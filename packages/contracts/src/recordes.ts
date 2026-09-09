import { estimar1rm, seriesDeTrabalho } from './metricas-treino';

/**
 * As marcas pessoais do aluno — "meus recordes".
 *
 * Diferente de `RecordeBatido`, que é notícia do instante: aquele nasce no
 * envio do treino e não é guardado em lugar nenhum. Quem treinou sem sinal e
 * sincronizou depois nunca via a medalha, e a conquista sumia.
 *
 * Aqui a marca é **derivada de todas as séries já registradas**, então ela não
 * depende de o aparelho estar online na hora certa e não pode divergir do
 * histórico. Nada é gravado: recorde é uma leitura das séries, e uma cópia
 * gravada envelheceria no dia em que uma execução fosse corrigida.
 */

/** Uma marca por exercício. */
export interface MarcaPessoal {
  exercicioId: string;
  exercicioNome: string;
  /** Maior carga numa série de trabalho. */
  cargaMaximaKg: number;
  /** Dia em que essa carga foi atingida, em `AAAA-MM-DD`. */
  cargaMaximaEm: string;
  /** Estimativa de Epley da melhor série. */
  melhor1rmKg: number;
  /** Maior volume numa ÚNICA série — não a soma da sessão. */
  volumeMaximoSerieKg: number;
  /** Dias diferentes em que o exercício foi executado. */
  diasTreinados: number;
  /** Última vez que fez o exercício, em `AAAA-MM-DD`. */
  ultimaEm: string;
}

export interface MeusRecordes {
  total: number;
  marcas: MarcaPessoal[];
}

/**
 * Janela em que uma marca ainda é "nova".
 *
 * Trinta dias porque o ciclo de treino é mensal: dentro dele a conquista ainda
 * é o assunto da pessoa. Depois disso ela vira o patamar normal, e continuar
 * anunciando como novidade diminui a próxima.
 */
export const DIAS_MARCA_RECENTE = 30;

export function ehMarcaRecente(marca: MarcaPessoal, agora: Date = new Date()): boolean {
  const [ano, mes, dia] = marca.cargaMaximaEm.split('-').map(Number);
  if (!ano || !mes || !dia) return false;
  const quando = new Date(ano, mes - 1, dia);
  const dias = Math.floor((agora.getTime() - quando.getTime()) / (24 * 60 * 60 * 1000));
  return dias >= 0 && dias <= DIAS_MARCA_RECENTE;
}

/**
 * A ordem em que o aluno quer ler.
 *
 * **Conquista mais recente primeiro**, e não ordem alfabética nem por peso.
 * Quem abre esta tela acabou de bater alguma coisa e quer ver aquilo — uma
 * lista alfabética faria a marca nova do dia aparecer no meio, entre coisas
 * que ele já sabe. Peso também não serve: agachamento sempre venceria rosca
 * direta, e a tela viraria um ranking de exercício em vez do progresso da
 * pessoa.
 *
 * Empate de data cai para a carga maior, só para a ordem ser estável.
 */
export function ordenarMarcas(marcas: MarcaPessoal[]): MarcaPessoal[] {
  return [...marcas].sort((a, b) => {
    const porData = b.cargaMaximaEm.localeCompare(a.cargaMaximaEm);
    return porData !== 0 ? porData : b.cargaMaximaKg - a.cargaMaximaKg;
  });
}

// --- montagem ---------------------------------------------------------------

/** Uma série já registrada, com o nome do exercício e o dia em que foi feita. */
export interface SerieParaMarca {
  exercicioId: string;
  exercicioNome: string;
  cargaKg: number;
  repsFeitas: number;
  tipo: string;
  /** Dia da execução, em `AAAA-MM-DD`. */
  dia: string;
}

/**
 * Derruba todas as séries do aluno em uma marca por exercício.
 *
 * Mora no contrato porque roda dos dois lados — a API e o SDK falando direto
 * com o Postgres. E porque nada aqui decide acesso: são as séries que quem
 * pergunta já lê uma a uma, lidas juntas.
 */
export function montarMeusRecordes(series: SerieParaMarca[]): MeusRecordes {
  const porExercicio = new Map<string, SerieParaMarca[]>();
  for (const s of series) {
    const lista = porExercicio.get(s.exercicioId);
    if (lista) lista.push(s);
    else porExercicio.set(s.exercicioId, [s]);
  }

  const marcas: MarcaPessoal[] = [];
  for (const [exercicioId, todas] of porExercicio) {
    // Mesma regra do resto do app: aquecimento não vira recorde, a não ser que
    // seja tudo o que existe.
    const consideradas = seriesDeTrabalho(todas);
    if (consideradas.length === 0) continue;

    /*
      A série da carga máxima, e a MAIS ANTIGA em caso de empate: a data que
      interessa é a da conquista, não a da última vez que a pessoa repetiu o
      mesmo peso. Dizer "seu recorde é de ontem" quando ele foi batido há três
      meses e só repetido ontem tira o sentido do número.
    */
    const cargaMaxima = Math.max(...consideradas.map((s) => s.cargaKg));
    const diaDaCargaMaxima = consideradas
      .filter((s) => s.cargaKg === cargaMaxima)
      .map((s) => s.dia)
      .sort()[0]!;

    marcas.push({
      exercicioId,
      exercicioNome: consideradas[0]!.exercicioNome,
      cargaMaximaKg: cargaMaxima,
      cargaMaximaEm: diaDaCargaMaxima,
      melhor1rmKg: Math.max(...consideradas.map((s) => estimar1rm(s.cargaKg, s.repsFeitas))),
      volumeMaximoSerieKg: Math.max(...consideradas.map((s) => s.cargaKg * s.repsFeitas)),
      diasTreinados: new Set(consideradas.map((s) => s.dia)).size,
      ultimaEm: consideradas
        .map((s) => s.dia)
        .sort()
        .at(-1)!,
    });
  }

  return { total: marcas.length, marcas: ordenarMarcas(marcas) };
}
