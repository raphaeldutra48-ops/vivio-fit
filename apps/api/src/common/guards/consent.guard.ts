import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AcaoAuditoria, EscopoDado, Papel } from '@prisma/client';
import type { UsuarioAutenticado } from '@vivio/contracts';
import type { Request } from 'express';
import { consentimentoVigentePara } from '../consentimento/regra';
import { CHAVE_AUDITORIA } from '../decorators/auditar.decorator';
import { CHAVE_ESCOPO } from '../decorators/exige-consentimento.decorator';
import { ErroDominio } from '../erros/erro-dominio';
import { AuditoriaService } from '../../modules/auditoria/auditoria.service';
import { PrismaService } from '../../infra/prisma.service';

/**
 * Terceira e última condição de acesso a dado de aluno
 * (autenticação -> vínculo -> CONSENTIMENTO).
 *
 * Vínculo ativo não basta: o aluno precisa ter autorizado aquele escopo
 * específico. É a exigência do art. 11 da LGPD para dado de saúde.
 *
 * Não há cache: consulta o banco a cada requisição. Isso é deliberado —
 * revogação precisa valer na requisição seguinte, sem janela de propagação.
 */
@Injectable()
export class ConsentGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const escopo = this.reflector.getAllAndOverride<EscopoDado | undefined>(CHAVE_ESCOPO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (!escopo) return true;

    const req = contexto.switchToHttp().getRequest<Request & { usuario?: UsuarioAutenticado }>();
    const usuario = req.usuario;
    if (!usuario) throw ErroDominio.naoAutenticado();

    const parametro: string | string[] | undefined = req.params?.alunoId;
    const alunoId = Array.isArray(parametro) ? parametro[0] : parametro;
    if (!alunoId) throw new Error('ConsentGuard aplicado a rota sem parâmetro :alunoId');

    // O titular sempre acessa os próprios dados — não precisa consentir consigo.
    if (usuario.papel === Papel.ALUNO && usuario.id === alunoId) return true;

    const consentimento = await this.prisma.consentimento.findFirst({
      where: { alunoId, escopo, ...consentimentoVigentePara(usuario.id) },
      select: { id: true },
    });

    if (!consentimento) {
      // O guard registra a própria negativa: interceptors só rodam depois dos
      // guards, então um acesso barrado aqui nunca chegaria ao AuditoriaInterceptor.
      const recursoTipo =
        this.reflector.getAllAndOverride<string | undefined>(CHAVE_AUDITORIA, [
          contexto.getHandler(),
          contexto.getClass(),
        ]) ?? 'DESCONHECIDO';

      await this.auditoria.registrar({
        atorId: usuario.id,
        acao: AcaoAuditoria.NEGADO,
        recursoTipo,
        alunoId,
        escopo,
        ip: req.ip,
        userAgent: req.header('user-agent') ?? undefined,
        metadata: { motivo: 'CONSENTIMENTO_AUSENTE' },
      });

      throw ErroDominio.consentimentoAusente(escopo);
    }

    return true;
  }
}
