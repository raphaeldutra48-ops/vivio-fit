import { Injectable } from '@nestjs/common';
import { EscopoExercicio, Prisma, StatusPlano } from '@prisma/client';
import type {
  CriarPlanoTreinoInput,
  ExercicioResumo,
  GrupoMuscular,
  PlanoTreinoCompleto,
  PlanoTreinoResumo,
  SessaoTreinoResumo,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';

type PlanoComTudo = Prisma.PlanoTreinoGetPayload<{
  include: {
    personal: { select: { id: true; nome: true } };
    sessoes: { include: { itens: { include: { exercicio: true } } } };
  };
}>;

const INCLUDE_COMPLETO = {
  personal: { select: { id: true, nome: true } },
  sessoes: {
    orderBy: { ordem: Prisma.SortOrder.asc },
    include: {
      itens: {
        orderBy: { ordem: Prisma.SortOrder.asc },
        include: { exercicio: true },
      },
    },
  },
} as const;

@Injectable()
export class PlanosService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(alunoId: string): Promise<PlanoTreinoResumo[]> {
    const planos = await this.prisma.planoTreino.findMany({
      where: { alunoId },
      include: { personal: { select: { id: true, nome: true } }, _count: { select: { sessoes: true } } },
      orderBy: [{ status: 'asc' }, { criadoEm: 'desc' }],
    });

    return planos.map((p) => ({
      id: p.id,
      nome: p.nome,
      objetivo: p.objetivo,
      versao: p.versao,
      status: p.status,
      inicioEm: p.inicioEm?.toISOString() ?? null,
      fimEm: p.fimEm?.toISOString() ?? null,
      totalSessoes: p._count.sessoes,
      personal: p.personal,
    }));
  }

  /** Payload que o mobile guarda para funcionar sem rede na academia. */
  async obterAtivo(alunoId: string): Promise<PlanoTreinoCompleto> {
    const plano = await this.prisma.planoTreino.findFirst({
      where: { alunoId, status: StatusPlano.ATIVO },
      include: INCLUDE_COMPLETO,
    });
    if (!plano) throw ErroDominio.naoEncontrado('Plano de treino ativo');
    return this.paraCompleto(plano);
  }

  async obter(alunoId: string, planoId: string): Promise<PlanoTreinoCompleto> {
    const plano = await this.prisma.planoTreino.findUnique({
      where: { id: planoId },
      include: INCLUDE_COMPLETO,
    });
    if (!plano || plano.alunoId !== alunoId) throw ErroDominio.naoEncontrado('Plano de treino');
    return this.paraCompleto(plano);
  }

  async criar(
    alunoId: string,
    personalId: string,
    dados: CriarPlanoTreinoInput,
  ): Promise<PlanoTreinoCompleto> {
    await this.exigirExerciciosAcessiveis(personalId, dados);

    const plano = await this.prisma.$transaction(async (tx) => {
      const criado = await tx.planoTreino.create({
        data: {
          alunoId,
          personalId,
          nome: dados.nome.trim(),
          objetivo: dados.objetivo,
          status: StatusPlano.RASCUNHO,
          sessoes: {
            create: dados.sessoes.map((sessao, indiceSessao) => ({
              nome: sessao.nome,
              ordem: indiceSessao,
              diaSugerido: sessao.diaSugerido,
              itens: {
                create: sessao.itens.map((item, indiceItem) => ({
                  exercicioId: item.exercicioId,
                  ordem: indiceItem,
                  series: item.series,
                  repsAlvo: item.repsAlvo,
                  cargaSugeridaKg: item.cargaSugeridaKg,
                  descansoSeg: item.descansoSeg,
                  tecnica: item.tecnica,
                  observacao: item.observacao,
                  supersetGrupo: item.supersetGrupo,
                })),
              },
            })),
          },
        },
        include: INCLUDE_COMPLETO,
      });

      if (dados.ativar) return this.ativarNaTransacao(tx, criado.id, alunoId);
      return criado;
    });

    return this.paraCompleto(plano);
  }

  /**
   * Ajuste de plano cria uma VERSÃO NOVA e arquiva a anterior.
   *
   * Sobrescrever destruiria a leitura do histórico: daqui a três meses, ao ver
   * que o aluno fez supino com 60kg, é preciso saber qual plano prescrevia o quê
   * naquele dia.
   */
  async criarNovaVersao(
    alunoId: string,
    personalId: string,
    planoAnteriorId: string,
    dados: CriarPlanoTreinoInput,
  ): Promise<PlanoTreinoCompleto> {
    const anterior = await this.prisma.planoTreino.findUnique({ where: { id: planoAnteriorId } });
    if (!anterior || anterior.alunoId !== alunoId) throw ErroDominio.naoEncontrado('Plano de treino');

    await this.exigirExerciciosAcessiveis(personalId, dados);
    const eraAtivo = anterior.status === StatusPlano.ATIVO;

    const plano = await this.prisma.$transaction(async (tx) => {
      const nova = await tx.planoTreino.create({
        data: {
          alunoId,
          personalId,
          nome: dados.nome.trim(),
          objetivo: dados.objetivo,
          versao: anterior.versao + 1,
          raizId: anterior.raizId ?? anterior.id,
          status: StatusPlano.RASCUNHO,
          sessoes: {
            create: dados.sessoes.map((sessao, indiceSessao) => ({
              nome: sessao.nome,
              ordem: indiceSessao,
              diaSugerido: sessao.diaSugerido,
              itens: {
                create: sessao.itens.map((item, indiceItem) => ({
                  exercicioId: item.exercicioId,
                  ordem: indiceItem,
                  series: item.series,
                  repsAlvo: item.repsAlvo,
                  cargaSugeridaKg: item.cargaSugeridaKg,
                  descansoSeg: item.descansoSeg,
                  tecnica: item.tecnica,
                  observacao: item.observacao,
                  supersetGrupo: item.supersetGrupo,
                })),
              },
            })),
          },
        },
        include: INCLUDE_COMPLETO,
      });

      // A versão nova assume o lugar da anterior se ela estava em uso.
      if (eraAtivo || dados.ativar) return this.ativarNaTransacao(tx, nova.id, alunoId);
      return nova;
    });

    return this.paraCompleto(plano);
  }

  async ativar(alunoId: string, planoId: string): Promise<PlanoTreinoCompleto> {
    const plano = await this.prisma.planoTreino.findUnique({ where: { id: planoId } });
    if (!plano || plano.alunoId !== alunoId) throw ErroDominio.naoEncontrado('Plano de treino');
    if (plano.status === StatusPlano.ATIVO) throw ErroDominio.conflito('Este plano já está ativo.');

    const ativado = await this.prisma.$transaction((tx) =>
      this.ativarNaTransacao(tx, planoId, alunoId),
    );
    return this.paraCompleto(ativado);
  }

  // --- auxiliares ---------------------------------------------------------

  /** Um aluno tem no máximo um plano ATIVO. Ativar arquiva os demais. */
  private async ativarNaTransacao(
    tx: Prisma.TransactionClient,
    planoId: string,
    alunoId: string,
  ): Promise<PlanoComTudo> {
    await tx.planoTreino.updateMany({
      where: { alunoId, status: StatusPlano.ATIVO, NOT: { id: planoId } },
      data: { status: StatusPlano.ARQUIVADO, fimEm: new Date() },
    });
    return tx.planoTreino.update({
      where: { id: planoId },
      data: { status: StatusPlano.ATIVO, inicioEm: new Date() },
      include: INCLUDE_COMPLETO,
    });
  }

  /**
   * Impede montar plano com exercício de outro profissional. Sem esta checagem,
   * bastaria adivinhar um id para referenciar a biblioteca privada alheia.
   */
  private async exigirExerciciosAcessiveis(
    personalId: string,
    dados: CriarPlanoTreinoInput,
  ): Promise<void> {
    const ids = [...new Set(dados.sessoes.flatMap((s) => s.itens.map((i) => i.exercicioId)))];
    const encontrados = await this.prisma.exercicio.findMany({
      where: {
        id: { in: ids },
        deletadoEm: null,
        OR: [{ escopo: EscopoExercicio.GLOBAL }, { criadoPorId: personalId }],
      },
      select: { id: true },
    });

    if (encontrados.length !== ids.length) {
      const achados = new Set(encontrados.map((e) => e.id));
      throw ErroDominio.naoEncontrado(
        `Exercício (${ids.filter((id) => !achados.has(id)).join(', ')})`,
      );
    }
  }

  private paraCompleto(plano: PlanoComTudo): PlanoTreinoCompleto {
    const sessoes: SessaoTreinoResumo[] = plano.sessoes.map((s) => ({
      id: s.id,
      nome: s.nome,
      ordem: s.ordem,
      diaSugerido: s.diaSugerido,
      itens: s.itens.map((i) => ({
        id: i.id,
        ordem: i.ordem,
        series: i.series,
        repsAlvo: i.repsAlvo,
        cargaSugeridaKg: i.cargaSugeridaKg === null ? null : Number(i.cargaSugeridaKg),
        descansoSeg: i.descansoSeg,
        tecnica: i.tecnica,
        observacao: i.observacao,
        supersetGrupo: i.supersetGrupo,
        exercicio: {
          id: i.exercicio.id,
          nome: i.exercicio.nome,
          grupoMuscular: i.exercicio.grupoMuscular as GrupoMuscular,
          equipamento: i.exercicio.equipamento,
          instrucoes: i.exercicio.instrucoes,
          escopo: i.exercicio.escopo,
          temVideo: i.exercicio.videoChave !== null,
          criadoPorId: i.exercicio.criadoPorId,
          /*
            Sem link assinado aqui: o plano de treino traz dezenas de itens e
            cada assinatura vale poucos minutos — para a maioria, expiraria
            antes de alguém rolar até ela. A tela pede a imagem pela biblioteca
            quando precisa mostrar.
          */
          imagemUrl: null,
          imagemCredito: i.exercicio.imagemCredito,
          videoCredito: i.exercicio.videoCredito,
        } satisfies ExercicioResumo,
      })),
    }));

    return {
      id: plano.id,
      nome: plano.nome,
      objetivo: plano.objetivo,
      versao: plano.versao,
      status: plano.status,
      inicioEm: plano.inicioEm?.toISOString() ?? null,
      fimEm: plano.fimEm?.toISOString() ?? null,
      totalSessoes: sessoes.length,
      personal: plano.personal,
      sessoes,
    };
  }
}
