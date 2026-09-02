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
import { verificarTokenSupabase } from './token-supabase';

/**
 * Guard global de autenticação.
 *
 * Revalida o usuário no banco a cada requisição em vez de confiar apenas no
 * token: conta suspensa ou desativada precisa perder acesso na hora, não só
 * quando o access token de 15 minutos expirar.
 *
 * Aceita DOIS emissores enquanto a migração anda: o Supabase, que já é quem
 * autentica, e o nosso antigo, para as sessões abertas antes da virada. O
 * segundo caminho é temporário e sai junto com esta API.
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

    /*
      Dois emissores, enquanto a migracao anda.

      O Supabase primeiro porque, dali para a frente, e ele que emite tudo: o
      token proprio so aparece em sessao aberta antes da virada, e essas
      expiram sozinhas. Quando nao houver mais nenhuma, o `else` some — e a
      API inteira logo depois.

      Sem os dois caminhos, migrar auth obrigaria a migrar as 177 rotas no
      mesmo dia, num app de saude com gente usando.
    */
    const bruto = header.slice(7);
    let id: string;

    const urlSupabase = this.config.get<string>('SUPABASE_URL');
    const doSupabase = urlSupabase ? await verificarTokenSupabase(bruto, urlSupabase) : null;

    if (doSupabase) {
      /*
        `vivio_id` e nao `sub`: o `sub` e o uuid do Auth, e os nossos ids sao
        cuid para quem foi criado antes da migracao. Quem nasceu depois tem os
        dois iguais — e ai o `sub` serve de reserva.
      */
      id = doSupabase.vivio_id ?? doSupabase.sub;
    } else {
      let payload: PayloadAccessToken;
      try {
        payload = await this.jwt.verifyAsync<PayloadAccessToken>(bruto, {
          secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        });
      } catch {
        throw ErroDominio.tokenInvalido();
      }
      id = payload.sub;
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
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
