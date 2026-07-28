import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Papel, StatusVinculo, Vinculo } from '@prisma/client';
import type { UsuarioAutenticado } from '@vivio/contracts';
import type { Request } from 'express';
import { ErroDominio } from '../erros/erro-dominio';
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
  constructor(private readonly prisma: PrismaService) {}

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
      if (usuario.id !== alunoId) throw ErroDominio.vinculoAusente();
      return true;
    }

    const ehProfissional =
      usuario.papel === Papel.PERSONAL ||
      usuario.papel === Papel.NUTRICIONISTA ||
      usuario.papel === Papel.MEDICO;
    if (!ehProfissional) throw ErroDominio.vinculoAusente();

    const vinculo = await this.prisma.vinculo.findUnique({
      where: { alunoId_profissionalId: { alunoId, profissionalId: usuario.id } },
    });

    if (!vinculo || vinculo.status !== StatusVinculo.ATIVO) {
      throw ErroDominio.vinculoAusente();
    }

    req.vinculo = vinculo;
    return true;
  }
}
