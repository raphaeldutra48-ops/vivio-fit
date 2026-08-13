
/**
 * Metabolismo basal e gasto energético total.
 *
 * Coisa diferente da queima do exercício, que já vive em `cardio.ts`: aquela é
 * MET × peso × tempo e não usa altura nem sexo. Esta é o que o corpo gasta
 * **existindo** — respirando, mantendo temperatura, trocando célula — e é ela
 * que precisa de composição corporal.
 */

/*
  O sexo biológico vem de `avaliacao.ts`, onde nasceu para a adipometria e para
  as faixas de gordura. Definir um segundo aqui criaria duas verdades sobre a
  mesma pessoa — uma com 'M'/'F' e outra com 'MASCULINO'/'FEMININO' — e a
  primeira gravação no campo errado só apareceria meses depois, num número que
  ninguém saberia explicar.
*/
import type { SexoBiologico } from './avaliacao';

/** Qual fórmula produziu o número — a tela precisa dizer, não esconder. */
export type FormulaDeTmb = 'KATCH_MCARDLE' | 'MIFFLIN_ST_JEOR';

export const NOME_DA_FORMULA: Record<FormulaDeTmb, string> = {
  KATCH_MCARDLE: 'Katch-McArdle',
  MIFFLIN_ST_JEOR: 'Mifflin-St Jeor',
};

/**
 * Fator de atividade da vida cotidiana — **sem o exercício**.
 *
 * A tabela clássica (1,375 "levemente ativo", 1,55 "moderado", 1,725 "muito
 * ativo") já embute o treino dentro dela. Num app que registra o treino de
 * verdade, usá-la e ainda somar as calorias da sessão conta o exercício duas
 * vezes e infla o total em 20% a 40% — é o erro mais comum deste cálculo.
 *
 * Por isso aqui só existe o 1,2: andar, trabalhar, cozinhar. O exercício entra
 * pelo que foi de fato registrado.
 */
export const FATOR_COTIDIANO = 1.2;

export interface DadosParaTmb {
  pesoKg: number | null;
  alturaCm: number | null;
  idade: number | null;
  sexo: SexoBiologico | null;
  /** Quando existe, manda: é medida em vez de estimada a partir do sexo. */
  massaMagraKg: number | null;
}

export interface TaxaMetabolica {
  /** Quilocalorias por dia em repouso absoluto. `null` sem dado suficiente. */
  tmb: number | null;
  formula: FormulaDeTmb | null;
  /** O que falta para conseguir calcular — a tela mostra isto ao aluno. */
  faltando: string[];
}

/**
 * Taxa metabólica basal, pela melhor fórmula que os dados permitirem.
 *
 * **Katch-McArdle primeiro**, sempre que houver massa magra medida:
 *
 *   TMB = 370 + (21,6 × massa magra)
 *
 * Ela não precisa de sexo, altura nem idade porque usa direto o tecido que
 * gasta energia. As outras fórmulas usam sexo como *atalho* para adivinhar
 * composição corporal — tendo a composição, o atalho vira ruído.
 *
 * Sem massa magra, cai para **Mifflin-St Jeor**, que é o padrão atual e mais
 * precisa que a Harris-Benedict para a população geral.
 *
 * Sem dado suficiente devolve `null` e diz o que falta, em vez de assumir uma
 * pessoa média — o número apareceria idêntico para gente muito diferente, e
 * seria lido como medida.
 */
export function taxaMetabolicaBasal(dados: DadosParaTmb): TaxaMetabolica {
  if (dados.massaMagraKg !== null && dados.massaMagraKg > 0) {
    return {
      tmb: Math.round(370 + 21.6 * dados.massaMagraKg),
      formula: 'KATCH_MCARDLE',
      faltando: [],
    };
  }

  const faltando: string[] = [];
  if (dados.pesoKg === null || dados.pesoKg <= 0) faltando.push('peso');
  if (dados.alturaCm === null || dados.alturaCm <= 0) faltando.push('altura');
  if (dados.idade === null || dados.idade <= 0) faltando.push('data de nascimento');
  if (dados.sexo === null) faltando.push('sexo biológico');

  if (faltando.length > 0) return { tmb: null, formula: null, faltando };

  /*
    O termo constante (+5 para homens, −161 para mulheres) é o que a fórmula
    usa para compensar a diferença média de massa magra entre os sexos. É
    média populacional, e por isso perde para a Katch-McArdle em quem mediu.
  */
  const base = 10 * dados.pesoKg! + 6.25 * dados.alturaCm! - 5 * dados.idade!;
  const ajuste = dados.sexo === 'M' ? 5 : -161;

  return { tmb: Math.round(base + ajuste), formula: 'MIFFLIN_ST_JEOR', faltando: [] };
}

export interface GastoDiario {
  tmb: number | null;
  formula: FormulaDeTmb | null;
  /** TMB × 1,2 — o que o corpo gasta no dia sem contar treino. */
  cotidiano: number | null;
  /** Média diária do exercício registrado no período. */
  exercicioPorDia: number | null;
  /** Cotidiano + exercício. `null` quando a TMB não pôde ser calculada. */
  totalPorDia: number | null;
  faltando: string[];
}

/**
 * Gasto médio por dia: o que o corpo gasta parado mais o que foi treinado.
 *
 * O exercício entra pelo **registrado**, e não por um fator de tabela. É a
 * diferença entre estimar que a pessoa treina e saber que ela treinou.
 *
 * Arredondado para dezenas, como o resto: a margem da TMB sozinha já é de 10%
 * a 15%, e somar o exercício não a diminui.
 */
export function gastoDiario(
  dados: DadosParaTmb,
  kcalDeExercicioNoPeriodo: number | null,
  diasDoPeriodo: number,
): GastoDiario {
  const { tmb, formula, faltando } = taxaMetabolicaBasal(dados);

  const exercicioPorDia =
    kcalDeExercicioNoPeriodo === null || diasDoPeriodo <= 0
      ? null
      : Math.round(kcalDeExercicioNoPeriodo / diasDoPeriodo / 10) * 10;

  if (tmb === null) {
    return { tmb: null, formula: null, cotidiano: null, exercicioPorDia, totalPorDia: null, faltando };
  }

  const cotidiano = Math.round((tmb * FATOR_COTIDIANO) / 10) * 10;

  return {
    tmb,
    formula,
    cotidiano,
    exercicioPorDia,
    totalPorDia: cotidiano + (exercicioPorDia ?? 0),
    faltando: [],
  };
}

/** Idade em anos a partir da data de nascimento. `null` quando não há data. */
export function idadeEmAnos(nascimento: Date | null, agora: Date = new Date()): number | null {
  if (!nascimento) return null;
  let anos = agora.getFullYear() - nascimento.getFullYear();
  const mes = agora.getMonth() - nascimento.getMonth();
  // Ainda não fez aniversário este ano.
  if (mes < 0 || (mes === 0 && agora.getDate() < nascimento.getDate())) anos -= 1;
  return anos > 0 ? anos : null;
}
