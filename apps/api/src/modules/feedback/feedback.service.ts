import { Injectable } from '@nestjs/common';
import { EscopoDado, StatusVinculo } from '@prisma/client';
import {
  compararPorAtencao,
  marcarSequenciasDeDor,
  precisaDeOlhar,
  type FeedbackDoAluno,
  type PainelDeFeedback,
} from '@vivio/contracts';
import { consentimentoVigentePara } from '../../common/consentimento/regra';
import { PrismaService } from '../../infra/prisma.service';

const DIA_EM_MS = 24 * 60 * 60 * 1000;

/**
 * Uma folga além da janela pedida, só para contar sequência de dor.
 *
 * Sem isso, o aluno que vem com dor há três treinos apareceria como "primeira
 * vez" toda vez que o profissional trocasse o filtro para 7 dias — e "primeira
 * vez" é exatamente a leitura que faz não agir.
 */
const FOLGA_PARA_SEQUENCIA_DIAS = 30;

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * O que os alunos disseram depois de treinar.
   *
   * O recorte por consentimento é por aluno, não por rota: o feedback é dado
   * de treino, e um aluno pode ter autorizado nutrição sem autorizar treino.
   * Guard de rota aqui daria tudo ou nada.
   */
  async doProfissional(
    profissionalId: string,
    dias: number,
    apenasAtencao: boolean,
  ): Promise<PainelDeFeedback> {
    const agora = new Date();
    const de = new Date(agora.getTime() - dias * DIA_EM_MS);

    const vinculos = await this.prisma.vinculo.findMany({
      where: { profissionalId, status: StatusVinculo.ATIVO, aluno: { deletadoEm: null } },
      select: { alunoId: true },
    });
    if (vinculos.length === 0) {
      return { dias, total: 0, precisamDeOlhar: 0, linhas: [] };
    }

    const consentidos = await this.prisma.consentimento.findMany({
      where: {
        alunoId: { in: vinculos.map((v) => v.alunoId) },
        escopo: EscopoDado.TREINO,
        ...consentimentoVigentePara(profissionalId),
      },
      select: { alunoId: true },
    });
    const alunoIds = [...new Set(consentidos.map((c) => c.alunoId))];
    if (alunoIds.length === 0) {
      return { dias, total: 0, precisamDeOlhar: 0, linhas: [] };
    }

    /*
      Busca a janela pedida MAIS a folga, numa consulta só. A folga não aparece
      na tela: serve apenas para a contagem de dores seguidas saber o que veio
      antes da primeira linha visível.
    */
    const inicioDaBusca = new Date(de.getTime() - FOLGA_PARA_SEQUENCIA_DIAS * DIA_EM_MS);

    const execucoes = await this.prisma.execucaoTreino.findMany({
      where: {
        alunoId: { in: alunoIds },
        iniciadoEm: { gte: inicioDaBusca },
        feedback: { isNot: null },
      },
      select: {
        id: true,
        alunoId: true,
        iniciadoEm: true,
        aluno: { select: { id: true, nome: true } },
        sessao: { select: { nome: true } },
        feedback: true,
      },
      orderBy: { iniciadoEm: 'asc' },
    });

    // Por aluno, do mais antigo ao mais novo: é a ordem que a contagem de
    // sequência exige.
    const porAluno = new Map<string, typeof execucoes>();
    for (const e of execucoes) {
      const lista = porAluno.get(e.alunoId);
      if (lista) lista.push(e);
      else porAluno.set(e.alunoId, [e]);
    }

    const linhas: FeedbackDoAluno[] = [];
    for (const daPessoa of porAluno.values()) {
      const comSequencia = marcarSequenciasDeDor(
        daPessoa.map((e) => ({
          execucaoId: e.id,
          aluno: e.aluno,
          sessaoNome: e.sessao?.nome ?? 'Treino avulso',
          treinoEm: e.iniciadoEm.toISOString(),
          dificuldade: e.feedback!.dificuldade,
          teveDor: e.feedback!.teveDor,
          localDor: e.feedback!.localDor,
          sensacao: e.feedback!.sensacao,
          comentario: e.feedback!.comentario,
        })),
      );

      // Só agora a folga é descartada: ela já cumpriu o papel de dar contexto
      // à sequência.
      linhas.push(...comSequencia.filter((f) => new Date(f.treinoEm) >= de));
    }

    const precisamDeOlhar = linhas.filter(precisaDeOlhar).length;
    const visiveis = apenasAtencao ? linhas.filter(precisaDeOlhar) : linhas;

    return {
      dias,
      total: linhas.length,
      precisamDeOlhar,
      linhas: visiveis.sort(compararPorAtencao),
    };
  }
}
