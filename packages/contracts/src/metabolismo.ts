
/**
 * Metabolismo basal e gasto energético total.
 *
 * Coisa diferente da queima do exercício, que já vive em `cardio.ts`: aquela é
 * MET × peso × tempo e não usa altura nem sexo. Esta é o que o corpo gasta
 * **existindo** — respirando, mantendo temperatura, trocando célula — e é ela
 * que precisa de composição corporal.
 */

import { z } from 'zod';
/*
  O sexo biológico vem de `avaliacao.ts`, onde nasceu para a adipometria e para
  as faixas de gordura. Definir um segundo aqui criaria duas verdades sobre a
  mesma pessoa — uma com 'M'/'F' e outra com 'MASCULINO'/'FEMININO' — e a
  primeira gravação no campo errado só apareceria meses depois, num número que
  ninguém saberia explicar.
*/
import type { SexoBiologico } from './avaliacao';

/** De onde veio o número — a tela precisa dizer, não esconder. */
export type FormulaDeTmb = 'CALORIMETRIA' | 'KATCH_MCARDLE' | 'MIFFLIN_ST_JEOR';

export const NOME_DA_FORMULA: Record<FormulaDeTmb, string> = {
  CALORIMETRIA: 'Calorimetria indireta (medida)',
  KATCH_MCARDLE: 'Katch-McArdle',
  MIFFLIN_ST_JEOR: 'Mifflin-St Jeor',
};

/**
 * Por quanto tempo uma calorimetria continua valendo.
 *
 * Seis meses porque é o intervalo em que a prática clínica remede durante
 * acompanhamento ativo. Passado isso, o número deixa de ser "medido" e vira
 * "medido um dia" — e continuar chamando de medição daria a ele uma
 * autoridade que ele não tem mais.
 */
export const VALIDADE_CALORIMETRIA_MESES = 6;

/**
 * Mudança de peso que invalida a medição antes do prazo.
 *
 * A taxa metabólica acompanha a massa do corpo. Cinco por cento é onde a
 * diferença passa a ser maior que o próprio erro da estimativa — abaixo disso,
 * insistir na medição antiga ainda é melhor do que trocar por um cálculo.
 */
export const VARIACAO_PESO_QUE_INVALIDA = 0.05;

export interface CalorimetriaConhecida {
  tmbMedidaKcal: number;
  /** `AAAA-MM-DD`. */
  data: string;
  /** Peso no dia do exame; sem ele, só o prazo controla a validade. */
  pesoNoExameKg: number | null;
}

/** Por que uma calorimetria deixou de valer — a tela mostra o motivo. */
export type MotivoDeExpirar = 'PRAZO' | 'MUDANCA_DE_PESO';

export interface ValidadeDaCalorimetria {
  valida: boolean;
  motivo: MotivoDeExpirar | null;
  mesesDesde: number;
}

/**
 * Se a calorimetria ainda descreve o corpo de hoje.
 *
 * A pergunta não é "quando foi feita" e sim "o corpo ainda é o mesmo". Por
 * isso o peso pesa mais que a data: quem perdeu quinze quilos em quatro meses
 * tem uma medição mais velha, na prática, do que quem manteve o peso por um
 * ano.
 */
export function validadeDaCalorimetria(
  exame: CalorimetriaConhecida,
  pesoAtualKg: number | null,
  agora: Date = new Date(),
): ValidadeDaCalorimetria {
  const [ano, mes, dia] = exame.data.split('-').map(Number);
  const feitoEm = new Date(ano ?? 0, (mes ?? 1) - 1, dia ?? 1);
  const mesesDesde =
    (agora.getFullYear() - feitoEm.getFullYear()) * 12 + (agora.getMonth() - feitoEm.getMonth());

  if (
    exame.pesoNoExameKg !== null &&
    exame.pesoNoExameKg > 0 &&
    pesoAtualKg !== null &&
    Math.abs(pesoAtualKg - exame.pesoNoExameKg) / exame.pesoNoExameKg > VARIACAO_PESO_QUE_INVALIDA
  ) {
    return { valida: false, motivo: 'MUDANCA_DE_PESO', mesesDesde };
  }

  if (mesesDesde > VALIDADE_CALORIMETRIA_MESES) {
    return { valida: false, motivo: 'PRAZO', mesesDesde };
  }

  return { valida: true, motivo: null, mesesDesde };
}

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
  /** A medição de verdade, quando o aluno fez o exame. */
  calorimetria?: CalorimetriaConhecida | null;
}

export interface TaxaMetabolica {
  /** Quilocalorias por dia em repouso absoluto. `null` sem dado suficiente. */
  tmb: number | null;
  formula: FormulaDeTmb | null;
  /** O que falta para conseguir calcular — a tela mostra isto ao aluno. */
  faltando: string[];
  /**
   * Preenchido quando havia calorimetria e ela deixou de valer.
   *
   * A tela precisa dizer por que voltou a estimar: sem isso o número muda
   * sozinho de um mês para o outro e a pessoa acha que o app se confundiu.
   */
  calorimetriaExpirada: ValidadeDaCalorimetria | null;
}

/**
 * Taxa metabólica basal, pela melhor fonte que os dados permitirem.
 *
 * A ordem é sempre da medição para o palpite:
 *
 * 1. **Calorimetria indireta**, quando existe e ainda vale. Ela não estima:
 *    mede o gasto pela troca gasosa, e é a referência contra a qual as duas
 *    fórmulas abaixo foram validadas.
 * 2. **Katch-McArdle** — `370 + 21,6 × massa magra`. Dispensa sexo, altura e
 *    idade porque usa direto o tecido que gasta energia. As outras fórmulas
 *    usam o sexo como *atalho* para adivinhar composição corporal; tendo a
 *    composição medida, o atalho vira ruído.
 * 3. **Mifflin-St Jeor** — o padrão atual, mais preciso que a
 *    Harris-Benedict para a população geral.
 *
 * Sem dado suficiente devolve `null` e diz o que falta, em vez de assumir uma
 * pessoa média — o número apareceria idêntico para gente muito diferente, e
 * seria lido como medida.
 */
export function taxaMetabolicaBasal(
  dados: DadosParaTmb,
  agora: Date = new Date(),
): TaxaMetabolica {
  /*
    Medição vence cálculo, sempre. A calorimetria indireta é a referência
    contra a qual as duas fórmulas abaixo foram validadas — usá-las tendo o
    exame na mão seria trocar o original pela cópia.
  */
  let calorimetriaExpirada: ValidadeDaCalorimetria | null = null;

  if (dados.calorimetria) {
    const validade = validadeDaCalorimetria(dados.calorimetria, dados.pesoKg, agora);
    if (validade.valida) {
      return {
        tmb: dados.calorimetria.tmbMedidaKcal,
        formula: 'CALORIMETRIA',
        faltando: [],
        calorimetriaExpirada: null,
      };
    }
    calorimetriaExpirada = validade;
  }

  if (dados.massaMagraKg !== null && dados.massaMagraKg > 0) {
    return {
      tmb: Math.round(370 + 21.6 * dados.massaMagraKg),
      formula: 'KATCH_MCARDLE',
      faltando: [],
      calorimetriaExpirada,
    };
  }

  const faltando: string[] = [];
  if (dados.pesoKg === null || dados.pesoKg <= 0) faltando.push('peso');
  if (dados.alturaCm === null || dados.alturaCm <= 0) faltando.push('altura');
  if (dados.idade === null || dados.idade <= 0) faltando.push('data de nascimento');
  if (dados.sexo === null) faltando.push('sexo biológico');

  if (faltando.length > 0) return { tmb: null, formula: null, faltando, calorimetriaExpirada };

  /*
    O termo constante (+5 para homens, −161 para mulheres) é o que a fórmula
    usa para compensar a diferença média de massa magra entre os sexos. É
    média populacional, e por isso perde para a Katch-McArdle em quem mediu.
  */
  const base = 10 * dados.pesoKg! + 6.25 * dados.alturaCm! - 5 * dados.idade!;
  const ajuste = dados.sexo === 'M' ? 5 : -161;

  return {
    tmb: Math.round(base + ajuste),
    formula: 'MIFFLIN_ST_JEOR',
    faltando: [],
    calorimetriaExpirada,
  };
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
  calorimetriaExpirada: ValidadeDaCalorimetria | null;
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
  const { tmb, formula, faltando, calorimetriaExpirada } = taxaMetabolicaBasal(dados);

  const exercicioPorDia =
    kcalDeExercicioNoPeriodo === null || diasDoPeriodo <= 0
      ? null
      : Math.round(kcalDeExercicioNoPeriodo / diasDoPeriodo / 10) * 10;

  if (tmb === null) {
    return {
      tmb: null,
      formula: null,
      cotidiano: null,
      exercicioPorDia,
      totalPorDia: null,
      faltando,
      calorimetriaExpirada,
    };
  }

  const cotidiano = Math.round((tmb * FATOR_COTIDIANO) / 10) * 10;

  return {
    tmb,
    formula,
    cotidiano,
    exercicioPorDia,
    totalPorDia: cotidiano + (exercicioPorDia ?? 0),
    faltando: [],
    calorimetriaExpirada,
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

// --- Registro do exame ------------------------------------------------------

export const registrarCalorimetriaSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD'),
  /**
   * Faixa larga de propósito: 800 cobre pessoa pequena em restrição, 4500
   * cobre atleta grande. Fora disso é quase certo erro de digitação — e um
   * zero a mais aqui contaminaria todo o planejamento alimentar.
   */
  tmbMedidaKcal: z.number().int().min(800).max(4500),
  /** Peso do dia do exame — é a régua que diz quando o resultado envelheceu. */
  pesoNoExameKg: z.number().min(20).max(400).optional(),
  equipamento: z.string().max(120).optional(),
  observacao: z.string().max(500).optional(),
});
export type RegistrarCalorimetriaInput = z.infer<typeof registrarCalorimetriaSchema>;

export interface CalorimetriaResumo {
  id: string;
  data: string;
  tmbMedidaKcal: number;
  pesoNoExameKg: number | null;
  equipamento: string | null;
  observacao: string | null;
  registradoPor: { id: string; nome: string };
  /** Calculada na leitura: a validade depende do peso de hoje. */
  validade: ValidadeDaCalorimetria;
  criadoEm: string;
}
