import { z } from 'zod';
import { SexoBiologico } from './avaliacao';

/**
 * Análise bioquímica: faixa laboratorial vs. faixa funcional.
 *
 * A ideia do produto em uma frase: a faixa do laboratório existe para sinalizar
 * DOENÇA; a faixa funcional, para sinalizar afastamento do IDEAL. Um valor pode
 * estar "normal" no laudo e ainda assim merecer conversa. É essa diferença que
 * transforma um PDF de números em consulta.
 *
 * Por isso a classificação tem exatamente três estados, e cada um significa uma
 * coisa que dá para explicar ao paciente sem rodeio:
 *
 * - CRITICO  — fora da faixa do laboratório. É achado clínico.
 * - ATENCAO  — dentro da faixa do laboratório, fora da funcional.
 * - OTIMO    — dentro da faixa funcional.
 *
 * Essa regra é deliberadamente conservadora: **nada vira "crítico" por causa da
 * faixa funcional**. Só o laudo carimba vermelho. Sem isso, uma fonte fraca
 * pintaria de vermelho um exame que o laboratório considera normal — e o
 * paciente veria o vermelho, não a nota de rodapé.
 *
 * ⚠️ A tabela abaixo precisa de revisão de um profissional habilitado antes de
 * uso clínico real. Ela é a melhor leitura das fontes citadas, não um parecer.
 */

export const Classificacao = {
  OTIMO: 'OTIMO',
  ATENCAO: 'ATENCAO',
  CRITICO: 'CRITICO',
} as const;
export type Classificacao = (typeof Classificacao)[keyof typeof Classificacao];

export const ROTULO_CLASSIFICACAO: Record<Classificacao, string> = {
  OTIMO: 'Ótimo',
  ATENCAO: 'Atenção',
  CRITICO: 'Crítico',
};

export const SistemaCorporal = {
  GLICEMICO: 'GLICEMICO',
  LIPIDEOS: 'LIPIDEOS',
  RENAL: 'RENAL',
  TIREOIDE: 'TIREOIDE',
  VITAMINAS: 'VITAMINAS',
  INFLAMACAO: 'INFLAMACAO',
  HORMONIOS_SEXUAIS: 'HORMONIOS_SEXUAIS',
} as const;
export type SistemaCorporal = (typeof SistemaCorporal)[keyof typeof SistemaCorporal];

export const ROTULO_SISTEMA: Record<SistemaCorporal, string> = {
  GLICEMICO: 'Metabolismo glicêmico',
  LIPIDEOS: 'Cardiovascular / lipídeos',
  RENAL: 'Função renal',
  TIREOIDE: 'Hormônios tireoidianos',
  VITAMINAS: 'Vitaminas e minerais',
  INFLAMACAO: 'Inflamação',
  HORMONIOS_SEXUAIS: 'Hormônios sexuais',
};

/**
 * De onde a faixa veio, e quanto ela pesa.
 *
 * Existe porque misturar diretriz de sociedade médica com manual de medicina
 * funcional sem dizer qual é qual é o defeito mais fácil de cometer aqui. A
 * tela mostra a etiqueta; quem lê decide quanto crédito dar.
 */
export const ForcaDaFonte = {
  /** Diretriz de sociedade médica. Peso máximo. */
  DIRETRIZ: 'DIRETRIZ',
  /** Estudo revisado por pares, citado com PMID. */
  ESTUDO: 'ESTUDO',
  /** Consenso de prática funcional. Não tem o mesmo peso — e a tela diz isso. */
  CONSENSO_FUNCIONAL: 'CONSENSO_FUNCIONAL',
} as const;
export type ForcaDaFonte = (typeof ForcaDaFonte)[keyof typeof ForcaDaFonte];

export const ROTULO_FORCA: Record<ForcaDaFonte, string> = {
  DIRETRIZ: 'Diretriz de sociedade médica',
  ESTUDO: 'Estudo revisado por pares',
  CONSENSO_FUNCIONAL: 'Consenso de prática funcional',
};

export interface Fonte {
  sigla: string;
  organizacao: string;
  documento: string;
  ano?: number;
  pmid?: string;
  forca: ForcaDaFonte;
}

/** Faixa aberta de um lado quando só um limite importa (LDL, TFG, PCR-us…). */
export interface Faixa {
  min?: number;
  max?: number;
}

/**
 * Quem pode ver o marcador.
 *
 * NUTRICIONAL é o que a avaliação nutricional usa para prescrever — glicemia,
 * lipídeos, ferro, vitaminas, e a função renal, que decide carga proteica.
 * MEDICO é o que exige interpretação médica: tireoide e hormônios sexuais.
 * O personal não vê marcador nenhum: recebe só o alerta derivado.
 */
export const EscopoMarcador = {
  NUTRICIONAL: 'NUTRICIONAL',
  MEDICO: 'MEDICO',
} as const;
export type EscopoMarcador = (typeof EscopoMarcador)[keyof typeof EscopoMarcador];

export interface ReferenciaMarcador {
  rotulo: string;
  unidade: string;
  sistema: SistemaCorporal;
  escopo: EscopoMarcador;
  /** O laudo do laboratório. Fora dela = CRITICO. */
  laboratorial: Faixa | Record<SexoBiologico, Faixa>;
  /** O alvo. Dentro dela = OTIMO. */
  funcional: Faixa | Record<SexoBiologico, Faixa>;
  fonteLaboratorial: Fonte;
  fonteFuncional: Fonte;
  /** Por que a faixa funcional é mais estreita — exibido ao expandir a linha. */
  nota?: string;
}

// --- Fontes -----------------------------------------------------------------

const ADA: Fonte = {
  sigla: 'ADA',
  organizacao: 'American Diabetes Association',
  documento: 'Standards of Care in Diabetes',
  ano: 2024,
  forca: ForcaDaFonte.DIRETRIZ,
};

const ESC_EAS: Fonte = {
  sigla: 'ESC/EAS',
  organizacao: 'European Society of Cardiology / European Atherosclerosis Society',
  documento: 'Dyslipidaemia Guidelines',
  ano: 2019,
  forca: ForcaDaFonte.DIRETRIZ,
};

const ATA: Fonte = {
  sigla: 'ATA',
  organizacao: 'American Thyroid Association',
  documento: 'Clinical Practice Guidelines',
  ano: 2023,
  forca: ForcaDaFonte.DIRETRIZ,
};

const ENDOCRINE: Fonte = {
  sigla: 'Endocrine Society',
  organizacao: 'The Endocrine Society',
  documento: 'Clinical Practice Guidelines',
  forca: ForcaDaFonte.DIRETRIZ,
};

const KDIGO: Fonte = {
  sigla: 'KDIGO',
  organizacao: 'Kidney Disease: Improving Global Outcomes',
  documento: 'CKD Evaluation and Management Guideline',
  ano: 2024,
  forca: ForcaDaFonte.DIRETRIZ,
};

const RIDKER: Fonte = {
  sigla: 'NEJM',
  organizacao: 'New England Journal of Medicine',
  documento: 'Ridker PM — C-Reactive Protein and cardiovascular risk',
  ano: 2003,
  forca: ForcaDaFonte.ESTUDO,
};

const HERRMANN_OBEID: Fonte = {
  sigla: 'PubMed',
  organizacao: 'National Library of Medicine',
  documento: 'Herrmann & Obeid — Vitamin B12 status markers',
  pmid: '29543324',
  forca: ForcaDaFonte.ESTUDO,
};

const IFM: Fonte = {
  sigla: 'IFM',
  organizacao: 'Institute for Functional Medicine',
  documento: 'Clinical Reference Manual',
  forca: ForcaDaFonte.CONSENSO_FUNCIONAL,
};

// --- Tabela de marcadores ---------------------------------------------------

/**
 * A tabela é a fonte única: classifica os exames E gera a página de
 * Metodologia. Página escrita à mão diverge da regra que roda — foi assim que
 * a equação de composição corporal acabou existindo em dois lugares.
 */
export const REFERENCIAS = {
  GLICOSE_JEJUM: {
    rotulo: 'Glicose de jejum',
    unidade: 'mg/dL',
    sistema: SistemaCorporal.GLICEMICO,
    escopo: EscopoMarcador.NUTRICIONAL,
    laboratorial: { min: 70, max: 99 },
    funcional: { min: 75, max: 88 },
    fonteLaboratorial: ADA,
    fonteFuncional: IFM,
    nota: 'A ADA trata 100–125 como pré-diabetes. A faixa funcional é mais estreita porque a curva de risco já sobe dentro do "normal".',
  },
  HBA1C: {
    rotulo: 'Hemoglobina glicada (HbA1c)',
    unidade: '%',
    sistema: SistemaCorporal.GLICEMICO,
    escopo: EscopoMarcador.NUTRICIONAL,
    laboratorial: { max: 5.7 },
    funcional: { max: 5.4 },
    fonteLaboratorial: ADA,
    fonteFuncional: IFM,
    nota: 'ADA: 5,7–6,4% é pré-diabetes; ≥6,5% fecha diagnóstico.',
  },
  INSULINA_JEJUM: {
    rotulo: 'Insulina de jejum',
    unidade: 'µUI/mL',
    sistema: SistemaCorporal.GLICEMICO,
    escopo: EscopoMarcador.NUTRICIONAL,
    laboratorial: { min: 2.6, max: 24.9 },
    funcional: { min: 2.6, max: 8 },
    fonteLaboratorial: IFM,
    fonteFuncional: IFM,
    nota: 'Insulina alta com glicose normal indica resistência compensada, que o laudo isolado não mostra. Valor baixo com HOMA-IR bom não é achado — é sensibilidade preservada.',
  },
  HOMA_IR: {
    rotulo: 'HOMA-IR',
    unidade: '',
    sistema: SistemaCorporal.GLICEMICO,
    escopo: EscopoMarcador.NUTRICIONAL,
    laboratorial: { max: 2.7 },
    funcional: { max: 1.5 },
    fonteLaboratorial: IFM,
    fonteFuncional: IFM,
  },
  COLESTEROL_TOTAL: {
    rotulo: 'Colesterol total',
    unidade: 'mg/dL',
    sistema: SistemaCorporal.LIPIDEOS,
    escopo: EscopoMarcador.NUTRICIONAL,
    laboratorial: { max: 190 },
    funcional: { max: 180 },
    fonteLaboratorial: ESC_EAS,
    fonteFuncional: ESC_EAS,
  },
  LDL: {
    rotulo: 'LDL colesterol',
    unidade: 'mg/dL',
    sistema: SistemaCorporal.LIPIDEOS,
    escopo: EscopoMarcador.NUTRICIONAL,
    laboratorial: { max: 116 },
    funcional: { max: 100 },
    fonteLaboratorial: ESC_EAS,
    fonteFuncional: ESC_EAS,
    nota: 'A ESC/EAS estratifica por risco: <116 baixo, <100 moderado, <70 alto, <55 muito alto. Sem o risco calculado, o app usa a faixa de risco baixo — o médico ajusta.',
  },
  HDL: {
    rotulo: 'HDL colesterol',
    unidade: 'mg/dL',
    sistema: SistemaCorporal.LIPIDEOS,
    escopo: EscopoMarcador.NUTRICIONAL,
    laboratorial: { M: { min: 40 }, F: { min: 48 } },
    funcional: { M: { min: 50 }, F: { min: 60 } },
    fonteLaboratorial: ESC_EAS,
    fonteFuncional: IFM,
  },
  TRIGLICERIDES: {
    rotulo: 'Triglicérides',
    unidade: 'mg/dL',
    sistema: SistemaCorporal.LIPIDEOS,
    escopo: EscopoMarcador.NUTRICIONAL,
    laboratorial: { max: 150 },
    funcional: { max: 100 },
    fonteLaboratorial: ESC_EAS,
    fonteFuncional: IFM,
  },
  UREIA: {
    rotulo: 'Ureia',
    unidade: 'mg/dL',
    sistema: SistemaCorporal.RENAL,
    escopo: EscopoMarcador.NUTRICIONAL,
    laboratorial: { min: 15, max: 45 },
    funcional: { min: 20, max: 40 },
    fonteLaboratorial: KDIGO,
    fonteFuncional: IFM,
  },
  CREATININA: {
    rotulo: 'Creatinina',
    unidade: 'mg/dL',
    sistema: SistemaCorporal.RENAL,
    escopo: EscopoMarcador.NUTRICIONAL,
    laboratorial: { M: { min: 0.7, max: 1.2 }, F: { min: 0.6, max: 1.0 } },
    funcional: { M: { min: 0.8, max: 1.1 }, F: { min: 0.6, max: 0.95 } },
    fonteLaboratorial: KDIGO,
    fonteFuncional: IFM,
    nota: 'Massa muscular alta eleva a creatinina sem doença renal — em atleta, ler junto com a TFG.',
  },
  TFG_ESTIMADA: {
    rotulo: 'Taxa de filtração glomerular estimada',
    unidade: 'mL/min/1,73 m²',
    sistema: SistemaCorporal.RENAL,
    escopo: EscopoMarcador.NUTRICIONAL,
    laboratorial: { min: 60 },
    funcional: { min: 90 },
    fonteLaboratorial: KDIGO,
    fonteFuncional: KDIGO,
    nota: 'KDIGO: ≥90 é G1, 60–89 é G2 (redução leve, sem doença por si só), <60 é G3. Por isso 67 aparece como Atenção, e não como Crítico: reduzido para o ideal, dentro do que o laudo aceita.',
  },
  ACIDO_URICO: {
    rotulo: 'Ácido úrico',
    unidade: 'mg/dL',
    sistema: SistemaCorporal.RENAL,
    escopo: EscopoMarcador.NUTRICIONAL,
    laboratorial: { M: { min: 3.5, max: 7.2 }, F: { min: 2.6, max: 6.0 } },
    funcional: { M: { min: 3.5, max: 6.0 }, F: { min: 2.6, max: 5.0 } },
    fonteLaboratorial: KDIGO,
    fonteFuncional: IFM,
  },
  VITAMINA_D: {
    rotulo: 'Vitamina D3 (25-OH)',
    unidade: 'ng/mL',
    sistema: SistemaCorporal.VITAMINAS,
    escopo: EscopoMarcador.NUTRICIONAL,
    laboratorial: { min: 30 },
    funcional: { min: 40, max: 60 },
    fonteLaboratorial: ENDOCRINE,
    fonteFuncional: ENDOCRINE,
    nota: 'Endocrine Society: <20 deficiência, 21–29 insuficiência, ≥30 suficiente, e alvo de 40–60 para quem trata. É por isso que 34,5 sai como Atenção sendo "normal" no laudo.',
  },
  VITAMINA_B12: {
    rotulo: 'Vitamina B12',
    unidade: 'pg/mL',
    sistema: SistemaCorporal.VITAMINAS,
    escopo: EscopoMarcador.NUTRICIONAL,
    laboratorial: { min: 200, max: 900 },
    funcional: { min: 400, max: 900 },
    fonteLaboratorial: HERRMANN_OBEID,
    fonteFuncional: HERRMANN_OBEID,
    nota: 'Entre 200 e 400 pg/mL há deficiência funcional detectável por homocisteína e ácido metilmalônico, com o laudo ainda normal.',
  },
  FERRITINA: {
    rotulo: 'Ferritina',
    unidade: 'ng/mL',
    sistema: SistemaCorporal.VITAMINAS,
    escopo: EscopoMarcador.NUTRICIONAL,
    laboratorial: { M: { min: 30, max: 400 }, F: { min: 15, max: 200 } },
    funcional: { M: { min: 50, max: 200 }, F: { min: 50, max: 150 } },
    fonteLaboratorial: IFM,
    fonteFuncional: IFM,
    nota: 'Ferritina é proteína de fase aguda: sobe com inflamação. Ferritina "normal" com PCR-us alta pode mascarar falta de ferro — ler as duas juntas.',
  },
  PCR_US: {
    rotulo: 'PCR ultrassensível',
    unidade: 'mg/L',
    sistema: SistemaCorporal.INFLAMACAO,
    escopo: EscopoMarcador.NUTRICIONAL,
    laboratorial: { max: 3 },
    funcional: { max: 1 },
    fonteLaboratorial: RIDKER,
    fonteFuncional: RIDKER,
    nota: 'Ridker: <1 risco cardiovascular baixo, 1–3 moderado, >3 alto. Valor acima de 10 costuma ser infecção aguda, não risco basal — repetir fora do quadro.',
  },
  TSH: {
    rotulo: 'TSH ultrassensível',
    unidade: 'µUI/mL',
    sistema: SistemaCorporal.TIREOIDE,
    escopo: EscopoMarcador.MEDICO,
    laboratorial: { min: 0.4, max: 4.0 },
    funcional: { min: 0.5, max: 2.5 },
    fonteLaboratorial: ATA,
    fonteFuncional: IFM,
  },
  T4_LIVRE: {
    rotulo: 'T4 livre (tiroxina livre)',
    unidade: 'ng/dL',
    sistema: SistemaCorporal.TIREOIDE,
    escopo: EscopoMarcador.MEDICO,
    laboratorial: { min: 0.8, max: 1.8 },
    funcional: { min: 1.0, max: 1.6 },
    fonteLaboratorial: ATA,
    fonteFuncional: IFM,
  },
  DHEA_S: {
    rotulo: 'DHEA-S',
    unidade: 'µg/dL',
    sistema: SistemaCorporal.HORMONIOS_SEXUAIS,
    escopo: EscopoMarcador.MEDICO,
    laboratorial: { M: { min: 80, max: 560 }, F: { min: 35, max: 430 } },
    funcional: { M: { min: 200, max: 500 }, F: { min: 100, max: 380 } },
    fonteLaboratorial: ENDOCRINE,
    fonteFuncional: IFM,
  },
  PROLACTINA: {
    rotulo: 'Prolactina',
    unidade: 'ng/mL',
    sistema: SistemaCorporal.HORMONIOS_SEXUAIS,
    escopo: EscopoMarcador.MEDICO,
    laboratorial: { M: { max: 15 }, F: { max: 25 } },
    funcional: { M: { max: 12 }, F: { max: 20 } },
    fonteLaboratorial: ENDOCRINE,
    fonteFuncional: IFM,
  },
} as const satisfies Record<string, ReferenciaMarcador>;

export type Marcador = keyof typeof REFERENCIAS;

export const MARCADORES = Object.keys(REFERENCIAS) as Marcador[];

export function referenciaDe(marcador: Marcador): ReferenciaMarcador {
  return REFERENCIAS[marcador];
}

/** Resolve a faixa quando ela depende do sexo biológico. */
export function faixaPara(
  faixa: Faixa | Record<SexoBiologico, Faixa>,
  sexo: SexoBiologico,
): Faixa {
  return 'M' in faixa || 'F' in faixa ? (faixa as Record<SexoBiologico, Faixa>)[sexo] : (faixa as Faixa);
}

function dentro(valor: number, faixa: Faixa): boolean {
  if (faixa.min !== undefined && valor < faixa.min) return false;
  if (faixa.max !== undefined && valor > faixa.max) return false;
  return true;
}

export interface MarcadorClassificado {
  marcador: Marcador;
  valor: number;
  classificacao: Classificacao;
  laboratorial: Faixa;
  funcional: Faixa;
}

/**
 * O coração do produto.
 *
 * Nada vira CRITICO por causa da faixa funcional — só sair da faixa do
 * laboratório carimba vermelho. A faixa funcional só distingue ATENCAO de
 * OTIMO **dentro** do que o laudo já considera normal.
 */
export function classificarMarcador(
  marcador: Marcador,
  valor: number,
  sexo: SexoBiologico,
): MarcadorClassificado {
  const ref = referenciaDe(marcador);
  const laboratorial = faixaPara(ref.laboratorial, sexo);
  const funcional = faixaPara(ref.funcional, sexo);

  const classificacao = !dentro(valor, laboratorial)
    ? Classificacao.CRITICO
    : dentro(valor, funcional)
      ? Classificacao.OTIMO
      : Classificacao.ATENCAO;

  return { marcador, valor, classificacao, laboratorial, funcional };
}

/** Os marcadores que um papel pode ver. O personal não entra aqui: só alerta. */
export function marcadoresDoEscopo(escopo: EscopoMarcador | 'TODOS'): Marcador[] {
  return escopo === 'TODOS'
    ? MARCADORES
    : MARCADORES.filter((m) => REFERENCIAS[m].escopo === escopo);
}

// --- Entrada ----------------------------------------------------------------

export const resultadoMarcadorSchema = z.object({
  marcador: z.enum(MARCADORES as [Marcador, ...Marcador[]]),
  valor: z.number().finite(),
});
export type ResultadoMarcadorInput = z.infer<typeof resultadoMarcadorSchema>;

// --- Saída ------------------------------------------------------------------

export interface MarcadorNoExame {
  marcador: Marcador;
  rotulo: string;
  unidade: string;
  sistema: SistemaCorporal;
  valor: number;
  classificacao: Classificacao;
  laboratorial: Faixa;
  funcional: Faixa;
  fonteLaboratorial: Fonte;
  fonteFuncional: Fonte;
  nota?: string;
}

export interface ExameResumo {
  id: string;
  laboratorio: string;
  dataColeta: string;
  sexo: SexoBiologico;
  observacao: string | null;
  registradoPor: { id: string; nome: string };
  /**
   * Já filtrados pelo escopo de quem pediu. O nutricionista recebe menos
   * marcadores que o médico, e `total` conta só o que ele pode ver — dizer
   * "45 marcadores" e listar 16 seria pior que não dizer nada.
   */
  resultados: MarcadorNoExame[];
  contagem: Record<Classificacao, number>;
  /**
   * Link assinado do arquivo. **null para o nutricionista, sempre** — só
   * médico e o próprio aluno recebem.
   */
  arquivoUrl: string | null;
  temArquivo: boolean;
}

/**
 * Vincula o arquivo do laudo ao exame já registrado.
 *
 * A chave vem de `midia.autorizarUpload` — o arquivo sobe direto para o
 * storage e nunca passa pela API.
 */
export const anexarLaudoSchema = z.object({
  chave: z.string().min(3).max(300),
  mimeType: z.string().min(3).max(100),
});
export type AnexarLaudoInput = z.infer<typeof anexarLaudoSchema>;

export const registrarExameSchema = z.object({
  laboratorio: z.string().min(2).max(120),
  dataColeta: z.coerce.date(),
  sexo: z.nativeEnum(SexoBiologico),
  observacao: z.string().max(1000).optional(),
  resultados: z.array(resultadoMarcadorSchema).min(1).max(MARCADORES.length),
});
export type RegistrarExameInput = z.infer<typeof registrarExameSchema>;
