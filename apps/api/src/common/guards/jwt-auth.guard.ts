import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { StatusConta } from '@prisma/client';
import type { PayloadAccessToken, UsuarioAutenticado } from '@vivio/contracts';
import type { Request } from 'express';
import { CHAVE_PUBLICO } from '../decorators/publico.decorator';
import { ErroDominio } from '../erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';

/**
 * Guard global de autenticação.
 *
 * Revalida o usuário no banco a cada requisição em vez de confiar apenas no
 * token: conta suspensa ou desativada precisa perder acesso na hora, não só
 * quando o access token de 15 minutos expirar.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const ehPublica = this.reflector.getAllAndOverride<boolean>(CHAVE_PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (ehPublica) return true;

    const req = contexto.switchToHttp().getRequest<Request & { usuario?: UsuarioAutenticado }>();
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      throw ErroDominio.naoAutenticado();
    }

    let payload: PayloadAccessToken;
    try {
      payload = await this.jwt.verifyAsync<PayloadAccessToken>(header.slice(7), {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw ErroDominio.tokenInvalido();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, nome: true, papel: true, status: true, deletadoEm: true },
    });

    if (!user || user.deletadoEm) throw ErroDominio.tokenInvalido();
    if (user.status === StatusConta.SUSPENSA || user.status === StatusConta.DESATIVADA) {
      throw ErroDominio.papelNaoAutorizado('Sua conta está suspensa.');
    }

    req.usuario = { id: user.id, email: user.email, nome: user.nome, papel: user.papel };
    return true;
  }
}
