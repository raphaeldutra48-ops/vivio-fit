import { z } from 'zod';
import { estimar1rm, seriesDeTrabalho, volumeKg } from './metricas-treino';

/**
 * Painel de progresso do aluno.
 *
 * Reúne numa tela o que hoje está espalhado: frequência, volume, tempo
 * treinado, adesão, evolução de carga e metas. O personal acompanha vários
 * alunos ao mesmo tempo — abrir cinco telas por pessoa não escala, e é por
 * isso que ninguém acompanha de verdade.
 *
 * **Nada aqui é dado novo.** Tudo já existe em execuções, check-ins e medidas;
 * o painel é a leitura conjunta. Por isso ele não tem tabela própria: um
 * número guardado ficaria velho, e a diferença entre o painel e a origem
 * apareceria como bug sem causa.
 */

export const consultaProgressoSchema = z.object({
  /** Janela em dias. 30 é o padrão; 90 pega um ciclo de treino inteiro. */
  dias: z.coerce.number().int().min(7).max(365).default(30),
});
export type ConsultaProgresso = z.infer<typeof consultaProgressoSchema>;

export interface TreinoNoPeriodo {
  /** Sessões efetivamente executadas. */
  total: number;
  /** Soma de carga × repetições, aquecimento fora. */
  volumeKg: number;
  /** Tempo total treinado, em minutos. */
  minutos: number;
  /** Duração média de uma sessão, em minutos; `null` sem sessão finalizada. */
  duracaoMediaMin: number | null;
  /**
   * Média de treinos por semana no período.
   *
   * Mais útil que o total puro: "12 treinos" quer dizer coisas diferentes em
   * 30 e em 90 dias, e é a frequência que diz se o programa está sendo
   * seguido.
   */
  porSemana: number;
  ultimoEm: string | null;
  diasSemTreinar: number | null;
}

export interface EvolucaoDeCarga {
  exercicioId: string;
  exercicioNome: string;
  /** Melhor 1RM estimado no início do período. */
  inicio1rmKg: number;
  /** Melhor 1RM estimado no fim. */
  fim1rmKg: number;
  /** Variação em %, positiva ou negativa. */
  variacaoPercentual: number;
}

/**
 * O painel inteiro.
 *
 * `checkins` vem `null` quando o aluno nunca registrou nenhum — diferente de
 * zero, que significaria "registrou e não treinou". A tela precisa distinguir
 * "sem dado" de "dado ruim" para não cobrar quem só não conhece o recurso.
 */
export interface PainelDeProgresso {
  dias: number;
  treino: TreinoNoPeriodo;
  checkins: {
    comCheckin: number;
    aderencia: number | null;
    energiaMedia: number | null;
    diasComDor: number;
    diasSemCheckin: number | null;
  } | null;
  /** Os exercícios que mais evoluíram e os que regrediram, no período. */
  cargas: EvolucaoDeCarga[];
  /** Variação de peso corporal no período, em kg; `null` sem duas medidas. */
  variacaoPesoKg: number | null;
}

// --- montagem ---------------------------------------------------------------

const DIA_EM_MS = 24 * 60 * 60 * 1000;

/** Quantos exercícios entram no destaque de evolução de carga. */
const DESTAQUES = 5;

/**
 * Menos que isso não é tendência, é uma medição solta.
 *
 * Sem esta regra, quem fez supino uma única vez apareceria com "+0%" ou, pior,
 * com uma variação enorme por causa de um dia de teste de carga.
 */
const MINIMO_DE_SESSOES_PARA_TENDENCIA = 2;

export interface SerieDoPainel {
  cargaKg: number;
  repsFeitas: number;
  tipo: string;
}

export interface ExecucaoDoPainel {
  /** ISO com fuso. */
  iniciadoEm: string;
  duracaoSeg: number | null;
  series: SerieDoPainel[];
}

/**
 * Frequência, volume e tempo no período.
 *
 * `agora` entra por parâmetro para o teste não depender do relógio — e porque
 * quem chama já sabe qual é o instante de referência da janela.
 */
export function resumoDeTreinoNoPeriodo(
  execucoes: ExecucaoDoPainel[],
  dias: number,
  agora: Date = new Date(),
): TreinoNoPeriodo {
  const total = execucoes.length;
  const volume = execucoes.reduce((soma, e) => soma + volumeKg(e.series), 0);

  /*
    Só sessões finalizadas entram no tempo. Treino em andamento tem
    `duracaoSeg` nulo, e contá-lo como zero puxaria a média para baixo — o
    personal veria "média de 20 minutos" para quem treina 50.
  */
  const comDuracao = execucoes.filter((e) => e.duracaoSeg !== null);
  const segundos = comDuracao.reduce((s, e) => s + (e.duracaoSeg ?? 0), 0);

  const ultimo = execucoes
    .map((e) => e.iniciadoEm)
    .sort()
    .at(-1) ?? null;

  return {
    total,
    volumeKg: Number(volume.toFixed(2)),
    minutos: Math.round(segundos / 60),
    duracaoMediaMin:
      comDuracao.length === 0 ? null : Math.round(segundos / comDuracao.length / 60),
    porSemana: Number(((total / dias) * 7).toFixed(1)),
    ultimoEm: ultimo,
    diasSemTreinar:
      ultimo === null
        ? null
        : Math.floor((agora.getTime() - new Date(ultimo).getTime()) / DIA_EM_MS),
  };
}

export interface SerieParaEvolucao {
  exercicioId: string;
  /** Início da execução, ISO com fuso. */
  quando: string;
  cargaKg: number;
  repsFeitas: number;
  tipo: string;
}

/**
 * Compara o melhor 1RM da primeira metade do período com o da segunda.
 *
 * Primeira contra última sessão seria mais simples e mais frágil: um dia ruim
 * no fim viraria "regrediu 8%". Metades diluem o ruído sem esconder tendência
 * real.
 */
export function montarEvolucaoDeCarga(
  series: SerieParaEvolucao[],
  nomes: Record<string, string>,
): EvolucaoDeCarga[] {
  const porExercicio = new Map<string, SerieParaEvolucao[]>();
  for (const s of series) {
    const lista = porExercicio.get(s.exercicioId);
    if (lista) lista.push(s);
    else porExercicio.set(s.exercicioId, [s]);
  }

  const evolucoes: EvolucaoDeCarga[] = [];

  for (const [exercicioId, todas] of porExercicio) {
    // Dia em UTC, e não o do fuso de quem consulta: o mesmo treino não pode
    // contar como dois dias diferentes conforme quem abre a tela.
    const diasDistintos = new Set(todas.map((s) => s.quando.slice(0, 10)));
    if (diasDistintos.size < MINIMO_DE_SESSOES_PARA_TENDENCIA) continue;

    const emOrdem = [...todas].sort((a, b) => a.quando.localeCompare(b.quando));
    const inicioEm = new Date(emOrdem[0]!.quando).getTime();
    const fimEm = new Date(emOrdem[emOrdem.length - 1]!.quando).getTime();
    const meio = (inicioEm + fimEm) / 2;

    const primeira = emOrdem.filter((s) => new Date(s.quando).getTime() <= meio);
    const segunda = emOrdem.filter((s) => new Date(s.quando).getTime() > meio);
    if (primeira.length === 0 || segunda.length === 0) continue;

    const melhor = (lista: SerieParaEvolucao[]): number => {
      const consideradas = seriesDeTrabalho(lista);
      return Math.max(...consideradas.map((s) => estimar1rm(s.cargaKg, s.repsFeitas)));
    };

    const inicio = melhor(primeira);
    const fim = melhor(segunda);
    if (inicio <= 0) continue;

    evolucoes.push({
      exercicioId,
      exercicioNome: nomes[exercicioId] ?? 'Exercício',
      inicio1rmKg: Number(inicio.toFixed(1)),
      fim1rmKg: Number(fim.toFixed(1)),
      variacaoPercentual: Number((((fim - inicio) / inicio) * 100).toFixed(1)),
    });
  }

  /*
    Ordena por variação absoluta, e não pela maior alta: quem regrediu 12% é
    mais urgente para o personal do que quem subiu 12%. Um painel que só mostra
    boa notícia não serve para acompanhar ninguém.
  */
  return evolucoes
    .sort((a, b) => Math.abs(b.variacaoPercentual) - Math.abs(a.variacaoPercentual))
    .slice(0, DESTAQUES);
}

/**
 * Diferença entre a primeira e a última pesagem do período.
 *
 * `null` com menos de duas medidas: uma pesagem sozinha não é variação, e
 * devolver zero diria "não mudou nada" sobre quem só se pesou uma vez.
 */
export function variacaoDePeso(pesosEmOrdem: number[]): number | null {
  if (pesosEmOrdem.length < 2) return null;
  return Number((pesosEmOrdem[pesosEmOrdem.length - 1]! - pesosEmOrdem[0]!).toFixed(1));
}
