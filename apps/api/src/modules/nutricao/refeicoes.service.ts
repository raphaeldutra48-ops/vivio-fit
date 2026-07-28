import { Injectable } from '@nestjs/common';
import type { RegistrarRefeicaoInput, StatusRefeicao } from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';

export interface RegistroRefeicaoResumo {
  id: string;
  refeicaoId: string;
  refeicaoNome: string;
  data: string;
  status: StatusRefeicao;
  comentario: string | null;
}

@Injectable()
export class RefeicoesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Marcar a mesma refeição no mesmo dia atualiza — o aluno pode corrigir. */
  async registrar(
    alunoId: string,
    dados: RegistrarRefeicaoInput,
  ): Promise<RegistroRefeicaoResumo> {
    const refeicao = await this.prisma.refeicao.findUnique({
      where: { id: dados.refeicaoId },
      include: { plano: { select: { alunoId: true } } },
    });
    if (!refeicao || refeicao.plano.alunoId !== alunoId) {
      throw ErroDominio.naoEncontrado('Refeição');
    }

    const data = new Date(dados.data.toISOString().slice(0, 10));
    const salvo = await this.prisma.registroRefeicao.upsert({
      where: { alunoId_refeicaoId_data: { alunoId, refeicaoId: dados.refeicaoId, data } },
      create: {
        alunoId,
        refeicaoId: dados.refeicaoId,
        data,
        status: dados.status,
        comentario: dados.comentario,
      },
      update: { status: dados.status, comentario: dados.comentario },
    });

    return {
      id: salvo.id,
      refeicaoId: salvo.refeicaoId,
      refeicaoNome: refeicao.nome,
      data: salvo.data.toISOString().slice(0, 10),
      status: salvo.status,
      comentario: salvo.comentario,
    };
  }

  async listarDoDia(alunoId: string, data: Date): Promise<RegistroRefeicaoResumo[]> {
    const dia = new Date(data.toISOString().slice(0, 10));
    const registros = await this.prisma.registroRefeicao.findMany({
      where: { alunoId, data: dia },
      include: { refeicao: { select: { nome: true } } },
      orderBy: { criadoEm: 'asc' },
    });

    return registros.map((r) => ({
      id: r.id,
      refeicaoId: r.refeicaoId,
      refeicaoNome: r.refeicao.nome,
      data: r.data.toISOString().slice(0, 10),
      status: r.status,
      comentario: r.comentario,
    }));
  }
}
