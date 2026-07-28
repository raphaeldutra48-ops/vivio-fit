import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AcaoAuditoria, EscopoDado } from '@prisma/client';
import type { UsuarioAutenticado } from '@vivio/contracts';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { CHAVE_AUDITORIA } from '../decorators/auditar.decorator';
import { CHAVE_ESCOPO } from '../decorators/exige-consentimento.decorator';
import { AuditoriaService } from '../../modules/auditoria/auditoria.service';

const ACAO_POR_METODO: Record<string, AcaoAuditoria> = {
  GET: AcaoAuditoria.LER,
  POST: AcaoAuditoria.CRIAR,
  PUT: AcaoAuditoria.ATUALIZAR,
  PATCH: AcaoAuditoria.ATUALIZAR,
  DELETE: AcaoAuditoria.REMOVER,
};

/**
 * Registra os acessos BEM SUCEDIDOS a recursos marcados com @Auditar.
 * As negativas são registradas pelos próprios guards, que rodam antes daqui.
 */
@Injectable()
export class AuditoriaInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditoria: AuditoriaService,
  ) {}

  intercept(contexto: ExecutionContext, next: CallHandler): Observable<unknown> {
    const recursoTipo = this.reflector.getAllAndOverride<string | undefined>(CHAVE_AUDITORIA, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (!recursoTipo) return next.handle();

    const req = contexto.switchToHttp().getRequest<Request & { usuario?: UsuarioAutenticado }>();
    const usuario = req.usuario;
    if (!usuario) return next.handle();

    const escopo = this.reflector.getAllAndOverride<EscopoDado | undefined>(CHAVE_ESCOPO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    const parametro: string | string[] | undefined = req.params?.alunoId;
    const alunoId = Array.isArray(parametro) ? parametro[0] : parametro;

    return next.handle().pipe(
      tap({
        next: () => {
          // Acesso do titular aos próprios dados não vira linha de auditoria.
          if (alunoId && alunoId === usuario.id) return;

          void this.auditoria.registrar({
            atorId: usuario.id,
            acao: ACAO_POR_METODO[req.method] ?? AcaoAuditoria.LER,
            recursoTipo,
            alunoId,
            escopo,
            ip: req.ip,
            userAgent: req.header('user-agent') ?? undefined,
            // NUNCA o corpo da resposta: é onde mora o dado clínico.
            metadata: { rota: req.route?.path ?? req.path },
          });
        },
      }),
    );
  }
}
