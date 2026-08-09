import { seriesDeTrabalho } from './metricas';

/**
 * Sugestão de progressão de carga.
 *
 * Implementa **dupla progressão**, que é como quase todo programa sério
 * funciona: trabalha-se numa faixa de repetições e, quando a pessoa completa o
 * topo da faixa em todas as séries, sobe a carga e recomeça no piso.
 *
 * O módulo é puro de propósito. A conta é simples; o que é difícil é decidir
 * **quando NÃO sugerir aumento** — e essa parte não pode depender de quem
 * lembrar de checar.
 */

export interface SerieFeita {
  cargaKg: number;
  repsFeitas: number;
  tipo: string;
  /** 1 a 10. 10 = falha. `null` quando o aluno não informou. */
  rpe?: number | null;
}

export type AcaoSugerida = 'AUMENTAR' | 'MANTER' | 'REDUZIR' | 'SEM_DADO';

export interface SugestaoDeCarga {
  acao: AcaoSugerida;
  /** Carga sugerida para a próxima vez. `null` em SEM_DADO. */
  cargaKg: number | null;
  /** Diferença para a carga atual; 0 em MANTER. */
  variacaoKg: number;
  /** Frase pronta, na voz de quem orienta — a tela não remonta o texto. */
  porque: string;
}

/**
 * Faixa de repetições extraída do texto do plano.
 *
 * `repsAlvo` é texto livre de propósito ("8-12", "até a falha", "30s"), porque
 * transformar em número quebraria metade dos usos legítimos. Aqui só o que dá
 * para ler vira faixa; o resto devolve `null` e a sugestão silencia — melhor
 * não opinar do que opinar sobre um alvo que não se entendeu.
 */
export function faixaDeReps(repsAlvo: string): { min: number; max: number } | null {
  const texto = repsAlvo.trim();

  const intervalo = texto.match(/^(\d{1,3})\s*[-–a]\s*(\d{1,3})$/);
  if (intervalo) {
    const min = Number(intervalo[1]);
    const max = Number(intervalo[2]);
    return min <= max ? { min, max } : { min: max, max: min };
  }

  const exato = texto.match(/^(\d{1,3})$/);
  if (exato) {
    const n = Number(exato[1]);
    return { min: n, max: n };
  }

  return null;
}

/**
 * Incremento em quilos.
 *
 * 5% da carga, arredondado para múltiplo de 2,5 kg — que é o menor par de
 * anilhas de qualquer academia. Percentual e não fixo porque 2,5 kg no supino
 * de 40 kg é muito, e no leg press de 200 kg é nada.
 */
export function incrementoPara(cargaKg: number): number {
  const cincoPorCento = cargaKg * 0.05;
  const arredondado = Math.round(cincoPorCento / 2.5) * 2.5;
  return Math.max(2.5, arredondado);
}

export interface ContextoDaSugestao {
  /** Séries da última vez que o aluno fez este exercício. */
  ultimaSessao: SerieFeita[];
  /** O que o plano manda: "8-12", "10", "até a falha". */
  repsAlvo: string;
  /** Houve relato de dor no treino em que este exercício foi feito. */
  teveDorNoTreino?: boolean;
}

/**
 * O que fazer na próxima vez.
 *
 * A ordem das guardas é deliberada: **dor vem antes de tudo**. Um aluno que
 * completou as repetições sentindo dor é exatamente quem não deve subir carga,
 * e é também quem o número sozinho mandaria subir.
 */
export function sugerirCarga({
  ultimaSessao,
  repsAlvo,
  teveDorNoTreino = false,
}: ContextoDaSugestao): SugestaoDeCarga {
  const trabalho = seriesDeTrabalho(
    ultimaSessao.map((s) => ({ cargaKg: s.cargaKg, repsFeitas: s.repsFeitas, tipo: s.tipo })),
  );

  if (trabalho.length === 0) {
    return {
      acao: 'SEM_DADO',
      cargaKg: null,
      variacaoKg: 0,
      porque: 'Ainda não há registro deste exercício para comparar.',
    };
  }

  const cargaAtual = Math.max(...trabalho.map((s) => s.cargaKg));

  if (teveDorNoTreino) {
    return {
      acao: 'MANTER',
      cargaKg: cargaAtual,
      variacaoKg: 0,
      porque: 'Houve relato de dor no último treino. Repita a carga e observe antes de subir.',
    };
  }

  const faixa = faixaDeReps(repsAlvo);
  if (!faixa) {
    return {
      acao: 'SEM_DADO',
      cargaKg: cargaAtual,
      variacaoKg: 0,
      porque: `O alvo "${repsAlvo}" não é uma faixa de repetições — a progressão fica a seu critério.`,
    };
  }

  const reps = trabalho.map((s) => s.repsFeitas);
  const menorReps = Math.min(...reps);

  /*
    RPE 10 é falha muscular. Subir carga logo depois de falhar é como a maioria
    das lesões de sala começa — e o aluno que falhou provavelmente completou as
    repetições, então é justamente o caso que a regra numérica mandaria subir.

    Só as séries com RPE informado entram: quem não preencheu não deve ser
    tratado como quem foi à falha.
    */
  const informaram = ultimaSessao.filter(
    (s) => s.tipo !== 'AQUECIMENTO' && typeof s.rpe === 'number',
  );
  const foiAFalha = informaram.length > 0 && informaram.every((s) => (s.rpe ?? 0) >= 10);

  if (menorReps >= faixa.max && foiAFalha) {
    return {
      acao: 'MANTER',
      cargaKg: cargaAtual,
      variacaoKg: 0,
      porque:
        'Completou a faixa, mas todas as séries foram até a falha. Repita a carga até sobrar margem.',
    };
  }

  if (menorReps >= faixa.max) {
    const incremento = incrementoPara(cargaAtual);
    return {
      acao: 'AUMENTAR',
      cargaKg: cargaAtual + incremento,
      variacaoKg: incremento,
      porque: `Fechou ${faixa.max} repetições em todas as séries. Suba ${incremento} kg e volte para ${faixa.min}.`,
    };
  }

  /*
    Ficar abaixo do piso da faixa em alguma série significa carga alta demais
    para o trabalho pedido. Reduzir é continuar o programa, não recuar.
  */
  if (menorReps < faixa.min) {
    const reducao = incrementoPara(cargaAtual);
    const nova = Math.max(0, cargaAtual - reducao);
    return {
      acao: 'REDUZIR',
      cargaKg: nova,
      variacaoKg: -reducao,
      porque: `Não fechou o mínimo de ${faixa.min} repetições. Baixe ${reducao} kg para treinar na faixa.`,
    };
  }

  return {
    acao: 'MANTER',
    cargaKg: cargaAtual,
    variacaoKg: 0,
    porque: `Está dentro da faixa. Mantenha a carga até fechar ${faixa.max} repetições em todas as séries.`,
  };
}
