import { Injectable } from '@nestjs/common';
import {
  TipoMeta,
  montarMetaResumo,
  ordenarMetas,
  seriesDeTrabalho,
  type CriarMetaInput,
  type MetaResumo,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';

const DIA_EM_MS = 24 * 60 * 60 * 1000;

/** Janela usada para aferir frequência semanal. */
const JANELA_FREQUENCIA_DIAS = 28;

type LinhaMeta = {
  id: string;
  tipo: string;
  titulo: string;
  alvo: unknown;
  exercicioId: string | null;
  exercicio: { nome: string } | null;
  valorInicial: unknown;
  prazo: Date | null;
  observacao: string | null;
  concluidaEm: Date | null;
  criadoEm: Date;
};

@Injectable()
export class MetasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cria a meta e **congela o valor inicial** no mesmo instante.
   *
   * Sem isso não há régua: "faltam 3 kg" não diz se a pessoa andou 10% ou 90%
   * do caminho, e o painel viraria um número sem contexto.
   */
  async criar(alunoId: string, autorId: string, dados: CriarMetaInput): Promise<MetaResumo> {
    if (dados.exercicioId) {
      const existe = await this.prisma.exercicio.findFirst({
        where: { id: dados.exercicioId, deletadoEm: null },
      });
      if (!existe) throw ErroDominio.naoEncontrado('Exercício');
    }

    const valorInicial = await this.aferir(alunoId, dados.tipo, dados.exercicioId ?? null);

    const criada = await this.prisma.meta.create({
      data: {
        alunoId,
        criadoPorId: autorId,
        tipo: dados.tipo,
        titulo: dados.titulo.trim(),
        alvo: dados.alvo ?? null,
        exercicioId: dados.exercicioId ?? null,
        valorInicial,
        prazo: dados.prazo ? new Date(`${dados.prazo}T00:00:00.000Z`) : null,
        observacao: dados.observacao ?? null,
      },
      include: { exercicio: { select: { nome: true } } },
    });

    return this.paraResumo(criada, valorInicial);
  }

  async listar(alunoId: string): Promise<MetaResumo[]> {
    const metas = await this.prisma.meta.findMany({
      where: { alunoId, deletadoEm: null },
      include: { exercicio: { select: { nome: true } } },
      orderBy: [{ criadoEm: 'desc' }],
    });

    /*
      A ordem é a do contrato: aberta antes de concluída. O `orderBy` do
      banco não conseguia dizer isso — `concluidaEm asc` põe NULL por
      último no Postgres, então a lista saía com as metas TERMINADAS no
      topo, ao contrário do que este arquivo dizia desde sempre. E ele
      também não enxerga a meta atingida pelo número, que continua com
      `concluidaEm` nulo.
    */
    return ordenarMetas(
      await Promise.all(
        metas.map(async (m) => {
          const atual = await this.aferir(alunoId, m.tipo as TipoMeta, m.exercicioId);
          return this.paraResumo(m, atual);
        }),
      ),
    );
  }

  /** Marca ou desmarca à mão. É o único caminho para a meta LIVRE. */
  async concluir(alunoId: string, metaId: string, concluida: boolean): Promise<MetaResumo> {
    const meta = await this.prisma.meta.findFirst({
      where: { id: metaId, alunoId, deletadoEm: null },
    });
    if (!meta) throw ErroDominio.naoEncontrado('Meta');

    const atualizada = await this.prisma.meta.update({
      where: { id: metaId },
      data: { concluidaEm: concluida ? new Date() : null },
      include: { exercicio: { select: { nome: true } } },
    });

    const atual = await this.aferir(alunoId, meta.tipo as TipoMeta, meta.exercicioId);
    return this.paraResumo(atualizada, atual);
  }

  /** Soft delete: a meta pode estar citada num relatório já enviado. */
  async remover(alunoId: string, metaId: string): Promise<void> {
    const meta = await this.prisma.meta.findFirst({
      where: { id: metaId, alunoId, deletadoEm: null },
    });
    if (!meta) throw ErroDominio.naoEncontrado('Meta');

    await this.prisma.meta.update({ where: { id: metaId }, data: { deletadoEm: new Date() } });
  }

  /**
   * O valor de agora, tirado do que já existe no sistema.
   *
   * Cada tipo lê de onde o dado vive. `null` significa "ainda não há medição",
   * e é diferente de zero — quem nunca se pesou não pesa zero.
   */
  private async aferir(
    alunoId: string,
    /*
      `string`, e nao `TipoMeta | string`. A uniao parecia mais segura e nao
      era: TypeScript colapsa `TipoMeta | string` em `string`, entao ela
      aceitava qualquer texto enquanto aparentava aceitar so o enum. O tipo
      real e este — a coluna do banco e `String`, e o `switch` abaixo e quem
      trata o que nao reconhece.
    */
    tipo: string,
    exercicioId: string | null,
  ): Promise<number | null> {
    switch (tipo) {
      case TipoMeta.PESO_CORPORAL:
        return this.ultimaMedida(alunoId, 'pesoKg');

      case TipoMeta.MEDIDA_CINTURA:
        return this.ultimaMedida(alunoId, 'cinturaCm');

      case TipoMeta.CARGA_EXERCICIO:
        return exercicioId ? this.maiorCarga(alunoId, exercicioId) : null;

      case TipoMeta.FREQUENCIA_SEMANAL:
        return this.frequenciaSemanal(alunoId);

      default:
        return null;
    }
  }

  private async ultimaMedida(
    alunoId: string,
    campo: 'pesoKg' | 'cinturaCm',
  ): Promise<number | null> {
    const medida = await this.prisma.medida.findFirst({
      where: { alunoId, deletadoEm: null, [campo]: { not: null } },
      orderBy: { data: 'desc' },
      select: { [campo]: true },
    });
    const valor = medida?.[campo as keyof typeof medida];
    return valor === undefined || valor === null ? null : Number(valor);
  }

  /**
   * Maior carga já usada numa **série de trabalho**.
   *
   * Aquecimento fora, pela mesma razão de sempre: senão a meta de carga seria
   * batida por quem aqueceu pesado uma vez.
   */
  private async maiorCarga(alunoId: string, exercicioId: string): Promise<number | null> {
    const series = await this.prisma.serieExecutada.findMany({
      where: { exercicioId, execucao: { alunoId } },
      select: { cargaKg: true, repsFeitas: true, tipo: true },
    });
    if (series.length === 0) return null;

    const trabalho = seriesDeTrabalho(
      series.map((s) => ({ cargaKg: Number(s.cargaKg), repsFeitas: s.repsFeitas, tipo: s.tipo })),
    );
    return Math.max(...trabalho.map((s) => s.cargaKg));
  }

  /**
   * Média de treinos por semana nas últimas quatro semanas.
   *
   * Quatro e não uma: uma semana ruim (viagem, gripe) jogaria a meta a zero e
   * a semana seguinte a devolveria — o número ficaria pulando sem dizer nada.
   */
  private async frequenciaSemanal(alunoId: string): Promise<number | null> {
    const de = new Date(Date.now() - JANELA_FREQUENCIA_DIAS * DIA_EM_MS);
    const total = await this.prisma.execucaoTreino.count({
      where: { alunoId, iniciadoEm: { gte: de } },
    });
    if (total === 0) return null;
    return Number(((total / JANELA_FREQUENCIA_DIAS) * 7).toFixed(1));
  }

  /** A montagem mora em `@vivio/contracts`: o SDK monta a mesma tela. */
  private paraResumo(m: LinhaMeta, valorAtual: number | null): MetaResumo {
    return montarMetaResumo(
      {
        id: m.id,
        tipo: m.tipo,
        titulo: m.titulo,
        alvo: m.alvo === null ? null : Number(m.alvo),
        exercicioId: m.exercicioId,
        exercicioNome: m.exercicio?.nome ?? null,
        valorInicial: m.valorInicial === null ? null : Number(m.valorInicial),
        prazo: m.prazo ? m.prazo.toISOString().slice(0, 10) : null,
        observacao: m.observacao,
        criadoEm: m.criadoEm.toISOString(),
        concluidaEm: m.concluidaEm?.toISOString() ?? null,
      },
      valorAtual,
    );
  }
}
