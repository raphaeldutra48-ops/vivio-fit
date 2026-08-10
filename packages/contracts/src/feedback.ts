import { z } from 'zod';

/**
 * Feedback pós-treino chegando ao profissional.
 *
 * O aluno já respondia dificuldade, dor e comentário ao fechar o treino no
 * celular — e isso ficava guardado sem ninguém ler. Esta é a outra ponta: o
 * lugar onde o personal vê o que foi dito e responde.
 *
 * A área é só de leitura, de propósito. Não há "marcar como resolvido" porque
 * isso criaria uma caixa de entrada para o profissional zerar, e caixa de
 * entrada se zera por cansaço. O que fecha o ciclo aqui é responder ao aluno
 * — e para isso já existe o chat.
 */

export const DIAS_PADRAO_FEEDBACK = 14;

export const consultaFeedbackSchema = z.object({
  dias: z.coerce.number().int().min(1).max(90).default(DIAS_PADRAO_FEEDBACK),
  /** Esconde o que está bem e deixa só o que pede conduta. */
  apenasAtencao: z.coerce.boolean().default(false),
});
export type ConsultaFeedback = z.infer<typeof consultaFeedbackSchema>;

/** 1 a 5, como o aluno respondeu no celular. */
export const ROTULO_DIFICULDADE: Record<number, string> = {
  1: 'Muito fácil',
  2: 'Fácil',
  3: 'Na medida',
  4: 'Difícil',
  5: 'Muito difícil',
};

export const DIFICULDADE_MUITO_FACIL = 1;
export const DIFICULDADE_MUITO_DIFICIL = 5;

export interface FeedbackDoAluno {
  execucaoId: string;
  aluno: { id: string; nome: string };
  sessaoNome: string;
  /** Quando o treino aconteceu — não quando o celular conseguiu enviar. */
  treinoEm: string;
  dificuldade: number;
  teveDor: boolean;
  localDor: string | null;
  sensacao: string | null;
  comentario: string | null;
  /**
   * Quantos treinos seguidos com dor terminam neste.
   *
   * `null` quando não houve dor. É o número que separa "torceu o pé no fim de
   * semana" de "tem alguma coisa errada na prescrição": dor isolada acontece,
   * dor em três treinos seguidos é um padrão.
   */
  sequenciaDeDor: number | null;
}

export interface PainelDeFeedback {
  dias: number;
  total: number;
  /** Quantas linhas pedem conduta — o número que o profissional lê primeiro. */
  precisamDeOlhar: number;
  linhas: FeedbackDoAluno[];
}

export type MotivoDoFeedback = 'DOR' | 'MUITO_DIFICIL' | 'MUITO_FACIL' | 'COMENTARIO';

/**
 * Por que esta linha pede o olho do profissional.
 *
 * Podem ser vários ao mesmo tempo, e a ordem é a da urgência. Dor vem antes de
 * tudo: é a única que pode significar lesão, e a única que muda a conduta hoje.
 *
 * `MUITO_FACIL` está aqui junto com `MUITO_DIFICIL` porque as duas pontas são
 * erro de prescrição. Treino fácil demais não machuca ninguém, mas gasta o
 * tempo do aluno sem entregar resultado — e é a razão silenciosa pela qual
 * gente desiste dizendo que "não estava vendo diferença".
 */
export function motivosDoFeedback(f: FeedbackDoAluno): MotivoDoFeedback[] {
  const motivos: MotivoDoFeedback[] = [];
  if (f.teveDor) motivos.push('DOR');
  if (f.dificuldade >= DIFICULDADE_MUITO_DIFICIL) motivos.push('MUITO_DIFICIL');
  if (f.dificuldade <= DIFICULDADE_MUITO_FACIL) motivos.push('MUITO_FACIL');
  /*
    Comentário escrito conta como motivo mesmo quando o resto está tranquilo:
    o aluno se deu ao trabalho de digitar, e ninguém digita para não ser lido.
  */
  if (f.comentario !== null && f.comentario.trim() !== '') motivos.push('COMENTARIO');
  return motivos;
}

export function precisaDeOlhar(f: FeedbackDoAluno): boolean {
  return motivosDoFeedback(f).length > 0;
}

/** Peso de cada motivo na ordenação. Menor sobe primeiro. */
const PESO: Record<MotivoDoFeedback, number> = {
  DOR: 0,
  MUITO_DIFICIL: 1,
  MUITO_FACIL: 2,
  COMENTARIO: 3,
};

const SEM_MOTIVO = 9;

/**
 * A ordem em que o profissional deve ler.
 *
 * **Não é cronológica.** Uma dor de seis dias atrás importa mais do que um
 * "foi tranquilo" de hoje, e ordenar por data enterraria a dor na terceira
 * rolagem. Dentro do mesmo motivo, aí sim o mais recente primeiro; e entre
 * duas dores, a sequência mais longa vem antes, porque é a que virou padrão.
 */
export function compararPorAtencao(a: FeedbackDoAluno, b: FeedbackDoAluno): number {
  const pesoDe = (f: FeedbackDoAluno) => {
    const motivos = motivosDoFeedback(f);
    return motivos.length === 0 ? SEM_MOTIVO : Math.min(...motivos.map((m) => PESO[m]));
  };

  const diferenca = pesoDe(a) - pesoDe(b);
  if (diferenca !== 0) return diferenca;

  if (a.teveDor && b.teveDor) {
    const sequencia = (b.sequenciaDeDor ?? 0) - (a.sequenciaDeDor ?? 0);
    if (sequencia !== 0) return sequencia;
  }

  return b.treinoEm.localeCompare(a.treinoEm);
}

/**
 * Marca a sequência de dor numa lista de um aluno só, do mais antigo ao mais
 * recente.
 *
 * Fica aqui, e não numa consulta ao banco, porque "seguidas" é uma afirmação
 * sobre a ordem dos treinos daquela pessoa — algo que só faz sentido depois de
 * ter a lista dela em mãos, e que um `COUNT` no banco responderia errado
 * (contaria dores espalhadas como se fossem consecutivas).
 */
export function marcarSequenciasDeDor<T extends { teveDor: boolean }>(
  doMaisAntigoAoMaisNovo: T[],
): (T & { sequenciaDeDor: number | null })[] {
  let seguidas = 0;
  return doMaisAntigoAoMaisNovo.map((f) => {
    seguidas = f.teveDor ? seguidas + 1 : 0;
    return { ...f, sequenciaDeDor: f.teveDor ? seguidas : null };
  });
}
