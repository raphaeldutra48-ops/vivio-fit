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
