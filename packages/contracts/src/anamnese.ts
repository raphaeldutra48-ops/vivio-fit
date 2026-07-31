import { z } from 'zod';

export const TipoPergunta = {
  TEXTO: 'TEXTO',
  TEXTO_LONGO: 'TEXTO_LONGO',
  SIM_NAO: 'SIM_NAO',
  ESCOLHA_UNICA: 'ESCOLHA_UNICA',
  ESCOLHA_MULTIPLA: 'ESCOLHA_MULTIPLA',
  NUMERO: 'NUMERO',
  DATA: 'DATA',
} as const;
export type TipoPergunta = (typeof TipoPergunta)[keyof typeof TipoPergunta];

export const ROTULO_TIPO_PERGUNTA: Record<TipoPergunta, string> = {
  TEXTO: 'Texto curto',
  TEXTO_LONGO: 'Texto longo',
  SIM_NAO: 'Sim ou não',
  ESCOLHA_UNICA: 'Escolha uma',
  ESCOLHA_MULTIPLA: 'Escolha várias',
  NUMERO: 'Número',
  DATA: 'Data',
};

/** Tipos que exigem lista de opções — o resto ignora o campo. */
export const TIPOS_COM_OPCOES: TipoPergunta[] = ['ESCOLHA_UNICA', 'ESCOLHA_MULTIPLA'];

// --- modelo -----------------------------------------------------------------

export const perguntaSchema = z
  .object({
    texto: z.string().min(3, 'Escreva a pergunta').max(300),
    tipo: z.nativeEnum(TipoPergunta),
    opcoes: z.array(z.string().min(1).max(120)).max(20).default([]),
    obrigatoria: z.boolean().default(false),
    ajuda: z.string().max(300).optional(),
  })
  .refine((p) => !TIPOS_COM_OPCOES.includes(p.tipo) || p.opcoes.length >= 2, {
    message: 'Pergunta de escolha precisa de ao menos duas opções',
    path: ['opcoes'],
  });
export type PerguntaInput = z.infer<typeof perguntaSchema>;

export const salvarModeloAnamneseSchema = z.object({
  nome: z.string().min(2).max(120),
  descricao: z.string().max(500).optional(),
  perguntas: z.array(perguntaSchema).min(1, 'Adicione ao menos uma pergunta').max(80),
});
export type SalvarModeloAnamneseInput = z.infer<typeof salvarModeloAnamneseSchema>;

export interface PerguntaResumo {
  id: string;
  texto: string;
  tipo: TipoPergunta;
  opcoes: string[];
  obrigatoria: boolean;
  ajuda: string | null;
  ordem: number;
}

export interface ModeloAnamneseResumo {
  id: string;
  nome: string;
  descricao: string | null;
  totalPerguntas: number;
  perguntas: PerguntaResumo[];
  atualizadoEm: string;
}

// --- anamnese aplicada ------------------------------------------------------

export const respostaSchema = z.object({
  perguntaId: z.string().cuid(),
  valor: z.string().max(4000).optional(),
  valores: z.array(z.string().max(200)).max(20).default([]),
});
export type RespostaInput = z.infer<typeof respostaSchema>;

export const aplicarAnamneseSchema = z.object({
  modeloId: z.string().cuid(),
  respondidaEm: z.coerce.date().default(() => new Date()),
  observacao: z.string().max(2000).optional(),
  respostas: z.array(respostaSchema).max(80).default([]),
});
export type AplicarAnamneseInput = z.infer<typeof aplicarAnamneseSchema>;

export interface RespostaResumo {
  id: string;
  /** Congelado na aplicação — editar o modelo não reescreve o histórico. */
  pergunta: string;
  tipo: TipoPergunta;
  valor: string | null;
  valores: string[];
  ordem: number;
}

export interface AnamneseResumo {
  id: string;
  nome: string;
  observacao: string | null;
  respondidaEm: string;
  profissional: { id: string; nome: string };
  respostas: RespostaResumo[];
}

/** Formata a resposta para leitura: "Sim", "Arroz, feijão", "—". */
export function descreverResposta(r: Pick<RespostaResumo, 'tipo' | 'valor' | 'valores'>): string {
  if (r.tipo === 'ESCOLHA_MULTIPLA') return r.valores.length > 0 ? r.valores.join(', ') : '—';
  if (r.tipo === 'SIM_NAO') {
    if (r.valor === 'sim') return 'Sim';
    if (r.valor === 'nao') return 'Não';
    return '—';
  }
  if (r.tipo === 'DATA' && r.valor) {
    return new Date(`${r.valor}T12:00:00`).toLocaleDateString('pt-BR');
  }
  return r.valor?.trim() || '—';
}

/**
 * Perguntas de partida para quem nunca montou uma anamnese.
 *
 * Não é modelo pronto de nutricionista nem de médico: é o mínimo que quase
 * toda anamnese pergunta, para o profissional editar e adaptar ao que ele faz.
 */
export const PERGUNTAS_SUGERIDAS: PerguntaInput[] = [
  { texto: 'Qual seu objetivo principal?', tipo: 'TEXTO_LONGO', opcoes: [], obrigatoria: true },
  {
    texto: 'Tem alguma condição de saúde diagnosticada?',
    tipo: 'TEXTO_LONGO',
    opcoes: [],
    obrigatoria: false,
    ajuda: 'Diabetes, hipertensão, tireoide, lesões…',
  },
  {
    texto: 'Usa alguma medicação contínua?',
    tipo: 'TEXTO_LONGO',
    opcoes: [],
    obrigatoria: false,
    ajuda: 'Inclua também suplementos e fitoterápicos.',
  },
  { texto: 'Tem alergia ou intolerância alimentar?', tipo: 'TEXTO_LONGO', opcoes: [], obrigatoria: false },
  {
    texto: 'Já passou por cirurgia?',
    tipo: 'TEXTO_LONGO',
    opcoes: [],
    obrigatoria: false,
    ajuda: 'Qual e há quanto tempo.',
  },
  {
    texto: 'Quantas horas dorme por noite?',
    tipo: 'NUMERO',
    opcoes: [],
    obrigatoria: false,
  },
  {
    texto: 'Consome bebida alcoólica?',
    tipo: 'ESCOLHA_UNICA',
    opcoes: ['Não', 'Socialmente', 'Semanalmente', 'Diariamente'],
    obrigatoria: false,
  },
  { texto: 'Fuma?', tipo: 'SIM_NAO', opcoes: [], obrigatoria: false },
  {
    texto: 'Como avalia seu nível de estresse?',
    tipo: 'ESCOLHA_UNICA',
    opcoes: ['Baixo', 'Moderado', 'Alto'],
    obrigatoria: false,
  },
  {
    texto: 'Pratica atividade física hoje? Qual e com que frequência?',
    tipo: 'TEXTO_LONGO',
    opcoes: [],
    obrigatoria: false,
  },
];
