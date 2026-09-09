import type {
  AnterioresDaSessao,
  HistoricoCarga,
  PontoHistoricoCarga,
  RecordeBatido,
  SerieAnterior,
  SugestaoDeCarga,
  TipoSerie,
} from './execucoes';
import { estimar1rm, marcasDe, recordesBatidos, seriesDeTrabalho } from './metricas-treino';
import { sugerirCarga } from './progressao';

/**
 * As contas da tela de execução, sobre dados que quem pergunta já pode ler.
 *
 * ## Por que aqui
 *
 * Nada disto decide acesso. A coluna ANTERIOR, o gráfico de progressão e a
 * medalha de recorde são leituras do que a própria pessoa (ou quem cuida dela)
 * já enxerga série por série — o que a política de `SerieExecutada` devolve é
 * exatamente a matéria-prima. Descer isso para o SQL seria reescrever em outra
 * linguagem uma regra que já existe testada, e foi assim que as regras de
 * alerta divergiram da fonte uma vez neste projeto.
 *
 * O que decide acesso continua no banco; o que decide **o que se mostra** vive
 * aqui, num lugar só, e os dois lados chamam a mesma função enquanto a API
 * existir.
 *
 * ## Por que as entradas são cruas
 *
 * `number` e ISO com fuso, sem `Decimal` do Prisma nem string do PostgREST.
 * Cada lado converte antes de chamar; assim a conta não sabe de onde veio o
 * dado, e um `Decimal` que escapasse viraria concatenação em vez de soma.
 */

/** Uma série executada, com o instante da sessão em que ela aconteceu. */
export interface SerieComExecucao {
  exercicioId: string;
  execucaoId: string;
  serieNum: number;
  repsFeitas: number;
  cargaKg: number;
  tipo: string;
  /** `null` quando o aluno não informou o esforço percebido. */
  rpe: number | null;
  /** Início da execução, ISO com fuso. */
  iniciadoEm: string;
  /** Quando a execução foi gravada — desempata registro retroativo. */
  criadoEm: string;
}

/**
 * Ordem total, e não só "mais recente primeiro".
 *
 * Duas execuções podem ter o mesmo `iniciadoEm` — registro retroativo,
 * importação, fila offline reenviada com horários iguais. Empatadas, o banco
 * devolve em ordem arbitrária, e a coluna ANTERIOR mostraria uma sessão numa
 * abertura e outra na seguinte, sem nada ter mudado.
 */
function maisRecentePrimeiro(a: SerieComExecucao, b: SerieComExecucao): number {
  return (
    b.iniciadoEm.localeCompare(a.iniciadoEm) ||
    b.criadoEm.localeCompare(a.criadoEm) ||
    b.execucaoId.localeCompare(a.execucaoId) ||
    a.serieNum - b.serieNum
  );
}

export interface ItemDaSessao {
  exercicioId: string;
  /** Texto livre do plano ("8-12", "até a falha"). A sugestão precisa dele. */
  repsAlvo: string;
}

export interface EntradaDosAnteriores {
  /** Séries do aluno nos exercícios da sessão. Em qualquer ordem. */
  series: SerieComExecucao[];
  itens: ItemDaSessao[];
  /** Execuções em que o aluno relatou dor. */
  execucoesComDor: ReadonlySet<string>;
}

/**
 * Preenche a coluna ANTERIOR e a sugestão de carga da sessão inteira.
 *
 * Só a ÚLTIMA vez de cada exercício entra: a coluna responde "quanto eu fiz da
 * outra vez", e juntar duas sessões ali somaria séries de dias diferentes na
 * mesma lista.
 */
export function montarAnterioresDaSessao({
  series,
  itens,
  execucoesComDor,
}: EntradaDosAnteriores): AnterioresDaSessao {
  const exercicioIds = [...new Set(itens.map((i) => i.exercicioId))];
  if (exercicioIds.length === 0) return { porExercicio: {}, ultimaVezEm: {}, sugestao: {} };

  const ordenadas = [...series].sort(maisRecentePrimeiro);

  const porExercicio: Record<string, SerieAnterior[]> = {};
  const ultimaVezEm: Record<string, string> = {};
  /** exercicioId -> id da execução escolhida como "a última". */
  const escolhida: Record<string, string> = {};
  /** `execucaoId:serieNum` -> RPE. `SerieAnterior` não o carrega — a coluna
   *  ANTERIOR não o mostra —, mas a sugestão de carga precisa dele. */
  const rpePorSerie = new Map<string, number>();

  for (const s of ordenadas) {
    if (s.rpe !== null) rpePorSerie.set(`${s.execucaoId}:${s.serieNum}`, s.rpe);

    // Desduplicar por ID de execução, e não por data: com datas iguais duas
    // sessões seriam lidas como uma só.
    const jaEscolhida = escolhida[s.exercicioId];
    if (jaEscolhida === undefined) {
      escolhida[s.exercicioId] = s.execucaoId;
      ultimaVezEm[s.exercicioId] = s.iniciadoEm;
    } else if (jaEscolhida !== s.execucaoId) {
      continue;
    }

    (porExercicio[s.exercicioId] ??= []).push({
      serieNum: s.serieNum,
      repsFeitas: s.repsFeitas,
      cargaKg: s.cargaKg,
      tipo: s.tipo as TipoSerie,
    });
  }

  /*
    A sugestão é por EXERCÍCIO, e não por item do plano: o mesmo exercício pode
    aparecer duas vezes na sessão, e as duas têm o mesmo histórico. Se um item
    pede 8-12 e outro 15-20, vence o primeiro — caso raro, e uma sugestão
    consistente é melhor que duas conflitantes na mesma tela.
  */
  const alvoPorExercicio = new Map<string, string>();
  for (const item of itens) {
    if (!alvoPorExercicio.has(item.exercicioId)) {
      alvoPorExercicio.set(item.exercicioId, item.repsAlvo);
    }
  }

  const sugestao: Record<string, SugestaoDeCarga> = {};
  for (const exercicioId of exercicioIds) {
    const daUltima = porExercicio[exercicioId] ?? [];
    const execucao = escolhida[exercicioId] ?? '';
    sugestao[exercicioId] = sugerirCarga({
      ultimaSessao: daUltima.map((s) => ({
        cargaKg: s.cargaKg,
        repsFeitas: s.repsFeitas,
        tipo: s.tipo,
        rpe: rpePorSerie.get(`${execucao}:${s.serieNum}`) ?? null,
      })),
      repsAlvo: alvoPorExercicio.get(exercicioId) ?? '',
      /*
        A guarda que vem ANTES do número: quem fechou as repetições sentindo
        dor é exatamente quem não deve subir carga, e é quem a regra numérica
        sozinha mandaria subir.
      */
      teveDorNoTreino: execucoesComDor.has(execucao),
    });
  }

  return { porExercicio, ultimaVezEm, sugestao };
}

export interface EntradaDoHistorico {
  exercicioId: string;
  exercicioNome: string;
  series: SerieComExecucao[];
  /** Quantos DIAS de treino o gráfico mostra. */
  limite: number;
}

/**
 * Progressão de carga de um exercício, agrupada por dia.
 *
 * Por dia porque é assim que o aluno pensa a evolução — não por série nem por
 * execução. Duas execuções do mesmo exercício no mesmo dia são um treino só
 * para quem olha o gráfico.
 */
export function montarHistoricoDeCarga({
  exercicioId,
  exercicioNome,
  series,
  limite,
}: EntradaDoHistorico): HistoricoCarga {
  const ordenadas = [...series].sort(maisRecentePrimeiro);

  const porDia = new Map<string, SerieAnterior[]>();
  for (const s of ordenadas) {
    const dia = s.iniciadoEm.slice(0, 10);
    const doDia = porDia.get(dia) ?? [];
    doDia.push({
      serieNum: s.serieNum,
      repsFeitas: s.repsFeitas,
      cargaKg: s.cargaKg,
      tipo: s.tipo as TipoSerie,
    });
    porDia.set(dia, doDia);
  }

  const pontos: PontoHistoricoCarga[] = [...porDia.entries()]
    .slice(0, limite)
    .map(([data, doDia]) => {
      // Aquecimento não conta como carga de trabalho: entraria puxando a
      // progressão para baixo e distorceria o gráfico.
      const consideradas = seriesDeTrabalho(doDia);
      return {
        data,
        cargaMaximaKg: Math.max(...consideradas.map((s) => s.cargaKg)),
        volumeKg: Number(
          consideradas.reduce((soma, s) => soma + s.cargaKg * s.repsFeitas, 0).toFixed(2),
        ),
        estimativa1rmKg: Math.max(...consideradas.map((s) => estimar1rm(s.cargaKg, s.repsFeitas))),
        series: doDia,
      };
    })
    .reverse(); // cronológico para o gráfico

  return { exercicioId, exercicioNome, pontos };
}

export interface SerieDeExercicio {
  exercicioId: string;
  cargaKg: number;
  repsFeitas: number;
  tipo: string;
}

export interface EntradaDosRecordes {
  /** As séries que acabaram de ser registradas. */
  deHoje: SerieDeExercicio[];
  /** Tudo o que o aluno já fez nesses exercícios ANTES desta execução. */
  anteriores: SerieDeExercicio[];
  nomes: Record<string, string>;
}

/**
 * Quais marcas de hoje superaram o melhor de antes.
 *
 * `anteriores` precisa EXCLUIR a execução recém-gravada. Sem isso a série de
 * agora entra na comparação e nada nunca é recorde, porque o melhor histórico
 * já inclui o de hoje.
 *
 * E precisa ser o histórico INTEIRO, sem corte de data: recorde é "melhor de
 * todos os tempos". Limitar faria marca antiga sair da comparação e voltar
 * como medalha nova — o aluno seria parabenizado por um peso que já tinha
 * levantado no ano passado.
 */
export function apurarRecordes({ deHoje, anteriores, nomes }: EntradaDosRecordes): RecordeBatido[] {
  const agrupar = (lista: SerieDeExercicio[]): Map<string, SerieDeExercicio[]> => {
    const mapa = new Map<string, SerieDeExercicio[]>();
    for (const s of lista) {
      const atual = mapa.get(s.exercicioId) ?? [];
      atual.push(s);
      mapa.set(s.exercicioId, atual);
    }
    return mapa;
  };

  const hoje = agrupar(deHoje);
  const antes = agrupar(anteriores);
  const batidos: RecordeBatido[] = [];

  for (const [exercicioId, series] of hoje) {
    const marcasDeHoje = marcasDe(series);
    if (!marcasDeHoje) continue;

    // Lista vazia na primeira vez no exercício: `marcasDe` devolve `null` e
    // `recordesBatidos` já trata isso como "não há o que superar".
    const marcasDeAntes = marcasDe(antes.get(exercicioId) ?? []);

    for (const r of recordesBatidos(marcasDeHoje, marcasDeAntes)) {
      batidos.push({ exercicioId, exercicioNome: nomes[exercicioId] ?? 'Exercício', ...r });
    }
  }

  return batidos;
}
