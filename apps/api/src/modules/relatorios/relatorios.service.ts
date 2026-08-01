import { Injectable } from '@nestjs/common';
import { EscopoDado, StatusRefeicao, StatusVinculo } from '@prisma/client';
import type { LinhaDoRelatorio, RelatorioDaCarteira } from '@vivio/contracts';
import { consentimentoVigentePara } from '../../common/consentimento/regra';
import { PrismaService } from '../../infra/prisma.service';

const DIA_EM_MS = 24 * 60 * 60 * 1000;

const soData = (d: Date): string => d.toISOString().slice(0, 10);
const arredondar1 = (v: number): number => Math.round(v * 10) / 10;

@Injectable()
export class RelatoriosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Panorama da carteira do profissional.
   *
   * O relatório cruza treino, evolução e nutrição — e cada um tem escopo de
   * consentimento próprio. Um aluno pode autorizar treino e não autorizar
   * evolução; nesse caso a coluna de peso vem `null`, não zero. Zero seria
   * mentira, e mostrar o dado seria vazamento.
   */
  async daCarteira(profissionalId: string, dias: number): Promise<RelatorioDaCarteira> {
    const ate = new Date();
    const de = new Date(ate.getTime() - dias * DIA_EM_MS);

    const vinculos = await this.prisma.vinculo.findMany({
      where: {
        profissionalId,
        status: StatusVinculo.ATIVO,
        aluno: { deletadoEm: null },
      },
      include: { aluno: { select: { id: true, nome: true } } },
      orderBy: { aluno: { nome: 'asc' } },
    });

    if (vinculos.length === 0) {
      return {
        dias,
        de: soData(de),
        ate: soData(ate),
        totalAlunos: 0,
        alunosQueTreinaram: 0,
        treinosNoPeriodo: 0,
        mediaTreinosPorAluno: 0,
        linhas: [],
      };
    }

    const alunoIds = vinculos.map((v) => v.alunoId);

    // Um SELECT por conjunto, não por aluno: com 200 alunos na carteira, o
    // laço viraria 800 consultas.
    const [consentimentos, execucoes, medidas, registros] = await Promise.all([
      this.prisma.consentimento.findMany({
        // A mesma regra que o ConsentGuard aplica, vinda do mesmo lugar: já
        // divergiu uma vez, e o relatório mostrava como "não autorizado" quem
        // tinha autorizado a equipe inteira.
        where: { alunoId: { in: alunoIds }, ...consentimentoVigentePara(profissionalId) },
        select: { alunoId: true, escopo: true },
      }),
      this.prisma.execucaoTreino.findMany({
        where: { alunoId: { in: alunoIds }, iniciadoEm: { gte: de } },
        select: { alunoId: true, iniciadoEm: true },
        orderBy: { iniciadoEm: 'desc' },
      }),
      this.prisma.medida.findMany({
        where: { alunoId: { in: alunoIds }, data: { gte: de }, pesoKg: { not: null } },
        select: { alunoId: true, data: true, pesoKg: true },
        orderBy: { data: 'asc' },
      }),
      this.prisma.registroRefeicao.findMany({
        where: { alunoId: { in: alunoIds }, data: { gte: de } },
        select: { alunoId: true, status: true },
      }),
    ]);

    const autorizados = new Map<string, Set<EscopoDado>>();
    for (const c of consentimentos) {
      const atual = autorizados.get(c.alunoId) ?? new Set<EscopoDado>();
      atual.add(c.escopo);
      autorizados.set(c.alunoId, atual);
    }

    const linhas: LinhaDoRelatorio[] = vinculos.map((v) => {
      const escopos = autorizados.get(v.alunoId) ?? new Set<EscopoDado>();
      const podeTreino = escopos.has(EscopoDado.TREINO);
      const podeEvolucao = escopos.has(EscopoDado.EVOLUCAO);
      const podeNutricao = escopos.has(EscopoDado.NUTRICAO);

      const doAluno = execucoes.filter((e) => e.alunoId === v.alunoId);
      const ultimo = doAluno[0]?.iniciadoEm ?? null;

      const pesos = medidas.filter((m) => m.alunoId === v.alunoId);
      const primeiro = pesos[0];
      const recente = pesos[pesos.length - 1];

      const refeicoes = registros.filter((r) => r.alunoId === v.alunoId);
      const feitas = refeicoes.filter((r) => r.status === StatusRefeicao.FEITA).length;

      return {
        alunoId: v.alunoId,
        nome: v.aluno.nome,
        autorizou: { treino: podeTreino, evolucao: podeEvolucao, nutricao: podeNutricao },

        treinosNoPeriodo: podeTreino ? doAluno.length : null,
        ultimoTreinoEm: podeTreino && ultimo ? ultimo.toISOString() : null,
        diasSemTreinar:
          podeTreino && ultimo
            ? Math.floor((ate.getTime() - ultimo.getTime()) / DIA_EM_MS)
            : null,

        pesoInicialKg: podeEvolucao && primeiro ? Number(primeiro.pesoKg) : null,
        pesoAtualKg: podeEvolucao && recente ? Number(recente.pesoKg) : null,
        variacaoPesoKg:
          podeEvolucao && primeiro && recente && pesos.length > 1
            ? arredondar1(Number(recente.pesoKg) - Number(primeiro.pesoKg))
            : null,

        adesaoDietaPercentual:
          podeNutricao && refeicoes.length > 0
            ? Math.round((feitas / refeicoes.length) * 100)
            : null,
      };
    });

    const comTreinoAutorizado = linhas.filter((l) => l.autorizou.treino);
    const treinosNoPeriodo = comTreinoAutorizado.reduce((s, l) => s + (l.treinosNoPeriodo ?? 0), 0);

    return {
      dias,
      de: soData(de),
      ate: soData(ate),
      totalAlunos: linhas.length,
      alunosQueTreinaram: comTreinoAutorizado.filter((l) => (l.treinosNoPeriodo ?? 0) > 0).length,
      treinosNoPeriodo,
      mediaTreinosPorAluno:
        comTreinoAutorizado.length > 0
          ? arredondar1(treinosNoPeriodo / comTreinoAutorizado.length)
          : 0,
      linhas,
    };
  }
}
