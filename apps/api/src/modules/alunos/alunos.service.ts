import { Injectable } from '@nestjs/common';
import { StatusVinculo } from '@prisma/client';
import type { ResumoAluno } from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';

function calcularIdade(nascimento: Date): number {
  const hoje = new Date();
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const mes = hoje.getMonth() - nascimento.getMonth();
  if (mes < 0 || (mes === 0 && hoje.getDate() < nascimento.getDate())) idade--;
  return idade;
}

@Injectable()
export class AlunosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cabeçalho do aluno: identificação, dados básicos e a equipe de cuidado.
   *
   * Não traz nada clínico — é o que o profissional vê ao abrir a ficha, antes
   * de qualquer aba com dado sensível.
   */
  async resumo(alunoId: string): Promise<ResumoAluno> {
    const aluno = await this.prisma.user.findUnique({
      where: { id: alunoId },
      select: {
        id: true,
        nome: true,
        email: true,
        avatarUrl: true,
        deletadoEm: true,
        perfilAluno: { select: { dataNascimento: true, alturaCm: true, objetivo: true } },
        vinculosComoAluno: {
          where: { status: StatusVinculo.ATIVO },
          select: {
            tipo: true,
            profissional: { select: { id: true, nome: true, email: true, avatarUrl: true } },
          },
        },
      },
    });

    if (!aluno || aluno.deletadoEm) throw ErroDominio.naoEncontrado('Aluno');

    return {
      id: aluno.id,
      nome: aluno.nome,
      email: aluno.email,
      avatarUrl: aluno.avatarUrl,
      idade: aluno.perfilAluno ? calcularIdade(aluno.perfilAluno.dataNascimento) : null,
      alturaCm: aluno.perfilAluno?.alturaCm ?? null,
      objetivo: aluno.perfilAluno?.objetivo ?? null,
      equipe: aluno.vinculosComoAluno.map((v) => ({ tipo: v.tipo, profissional: v.profissional })),
    };
  }
}
