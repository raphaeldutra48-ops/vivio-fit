import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AcaoAuditoria, EscopoDado, Papel, StatusVinculo, Vinculo } from '@prisma/client';
import type { UsuarioAutenticado } from '@vivio/contracts';
import type { Request } from 'express';
import { CHAVE_AUDITORIA } from '../decorators/auditar.decorator';
import { CHAVE_ESCOPO } from '../decorators/exige-consentimento.decorator';
import { ErroDominio } from '../erros/erro-dominio';
import { AuditoriaService } from '../../modules/auditoria/auditoria.service';
import { PrismaService } from '../../infra/prisma.service';

export interface RequisicaoComVinculo extends Request {
  usuario?: UsuarioAutenticado;
  vinculo?: Vinculo;
}

/**
 * Segunda das três condições de acesso a dado de aluno
 * (autenticação -> VÍNCULO -> consentimento).
 *
 * Lê o `:alunoId` da rota e exige vínculo ATIVO. O próprio aluno sempre passa.
 * ADMIN NÃO passa: administrar a plataforma não dá direito a ler prontuário —
 * é exatamente o tipo de acesso que a LGPD trata como indevido.
 */
@Injectable()
export class CareLinkGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<RequisicaoComVinculo>();
    const usuario = req.usuario;
    if (!usuario) throw ErroDominio.naoAutenticado();

    // Nos tipos do Express 5 um parâmetro de rota pode ser string[] (curinga).
    const parametro: string | string[] | undefined = req.params?.alunoId;
    const alunoId = Array.isArray(parametro) ? parametro[0] : parametro;
    if (!alunoId) {
      throw new Error('CareLinkGuard aplicado a uma rota sem parâmetro :alunoId');
    }

    // O aluno acessando os próprios dados
    if (usuario.papel === Papel.ALUNO) {
      if (usuario.id !== alunoId) await this.negar(contexto, req, usuario, alunoId);
      return true;
    }

    const ehProfissional =
      usuario.papel === Papel.PERSONAL ||
      usuario.papel === Papel.NUTRICIONISTA ||
      usuario.papel === Papel.MEDICO;
    if (!ehProfissional) await this.negar(contexto, req, usuario, alunoId);

    const vinculo = await this.prisma.vinculo.findUnique({
      where: { alunoId_profissionalId: { alunoId, profissionalId: usuario.id } },
    });

    if (!vinculo || vinculo.status !== StatusVinculo.ATIVO) {
      await this.negar(contexto, req, usuario, alunoId);
    }

    req.vinculo = vinculo ?? undefined;
    return true;
  }

  /** Registra a tentativa antes de barrar. Acesso indevido é o evento que mais importa guardar. */
  private async negar(
    contexto: ExecutionContext,
    req: RequisicaoComVinculo,
    usuario: UsuarioAutenticado,
    alunoId: string,
  ): Promise<never> {
    const recursoTipo =
      this.reflector.getAllAndOverride<string | undefined>(CHAVE_AUDITORIA, [
        contexto.getHandler(),
        contexto.getClass(),
      ]) ?? 'DESCONHECIDO';
    const escopo = this.reflector.getAllAndOverride<EscopoDado | undefined>(CHAVE_ESCOPO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);

    await this.auditoria.registrar({
      atorId: usuario.id,
      acao: AcaoAuditoria.NEGADO,
      recursoTipo,
      alunoId,
      escopo,
      ip: req.ip,
      userAgent: req.header('user-agent') ?? undefined,
      metadata: { motivo: 'VINCULO_AUSENTE' },
    });

    throw ErroDominio.vinculoAusente();
  }
}
