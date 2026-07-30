import { z } from 'zod';
import { Papel } from './enums';

export const TipoPrescritivel = {
  SUPLEMENTO: 'SUPLEMENTO',
  FITOTERAPICO: 'FITOTERAPICO',
  MEDICAMENTO: 'MEDICAMENTO',
  ORIENTACAO: 'ORIENTACAO',
} as const;
export type TipoPrescritivel = (typeof TipoPrescritivel)[keyof typeof TipoPrescritivel];

export const ROTULO_TIPO_PRESCRITIVEL: Record<TipoPrescritivel, string> = {
  SUPLEMENTO: 'Suplemento',
  FITOTERAPICO: 'Fitoterápico',
  MEDICAMENTO: 'Medicamento',
  ORIENTACAO: 'Orientação',
};

/**
 * Competência profissional por tipo de item.
 *
 * Não é escolha de produto: no Brasil, a prescrição de medicamento é privativa
 * do médico (CRM). Nutricionista prescreve suplemento e fitoterápico dentro da
 * sua área (CFN). O app precisa refletir isso — permitir o contrário seria
 * facilitar exercício ilegal da profissão.
 */
export const PAPEIS_QUE_PRESCREVEM: Record<TipoPrescritivel, Papel[]> = {
  SUPLEMENTO: [Papel.NUTRICIONISTA, Papel.MEDICO],
  FITOTERAPICO: [Papel.NUTRICIONISTA, Papel.MEDICO],
  MEDICAMENTO: [Papel.MEDICO],
  ORIENTACAO: [Papel.NUTRICIONISTA, Papel.MEDICO],
};

export function podePrescrever(papel: Papel, tipo: TipoPrescritivel): boolean {
  return PAPEIS_QUE_PRESCREVEM[tipo].includes(papel);
}

// --- Catálogo ---------------------------------------------------------------

export const criarPrescritivelSchema = z.object({
  nome: z.string().min(2).max(160),
  tipo: z.nativeEnum(TipoPrescritivel),
  apresentacao: z.string().max(160).optional(),
  principioAtivo: z.string().max(160).optional(),
  contraindicacoes: z.string().max(2000).optional(),
  observacao: z.string().max(1000).optional(),
});
export type CriarPrescritivelInput = z.infer<typeof criarPrescritivelSchema>;

export const listarPrescritiveisSchema = z.object({
  q: z.string().max(80).optional(),
  tipo: z.nativeEnum(TipoPrescritivel).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListarPrescritiveisQuery = z.infer<typeof listarPrescritiveisSchema>;

export interface PrescritivelResumo {
  id: string;
  nome: string;
  tipo: TipoPrescritivel;
  apresentacao: string | null;
  principioAtivo: string | null;
  contraindicacoes: string | null;
  observacao: string | null;
  escopo: 'GLOBAL' | 'PRIVADO';
  criadoPorId: string | null;
}

// --- Posologia --------------------------------------------------------------

export const UNIDADES_DOSE = ['mg', 'g', 'mcg', 'mL', 'UI', 'cápsula', 'comprimido', 'scoop', 'gota', 'colher'] as const;
export const VIAS = ['Oral', 'Sublingual', 'Tópica', 'Inalatória', 'Outra'] as const;

export const posologiaSchema = z.object({
  prescritivelId: z.string().cuid(),
  dose: z.number().positive().max(100000).optional(),
  unidade: z.string().max(20).optional(),
  /** Texto livre: "2x ao dia", "a cada 8h", "1x ao dia em jejum". */
  frequencia: z.string().max(120).optional(),
  horarios: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).max(8).default([]),
  duracaoDias: z.number().int().min(1).max(3650).optional(),
  via: z.string().max(40).optional(),
  observacao: z.string().max(500).optional(),
});
export type PosologiaInput = z.infer<typeof posologiaSchema>;

// --- Modelos ----------------------------------------------------------------

export const criarModeloPrescricaoSchema = z.object({
  nome: z.string().min(2).max(120),
  descricao: z.string().max(500).optional(),
  orientacoes: z.string().max(2000).optional(),
  itens: z.array(posologiaSchema).min(1).max(30),
});
export type CriarModeloPrescricaoInput = z.infer<typeof criarModeloPrescricaoSchema>;

export interface ModeloPrescricaoResumo {
  id: string;
  nome: string;
  descricao: string | null;
  orientacoes: string | null;
  totalItens: number;
  itens: (PosologiaInput & { id: string; prescritivel: PrescritivelResumo })[];
}

// --- Prescrição emitida -----------------------------------------------------

export const emitirPrescricaoSchema = z.object({
  data: z.coerce.date().default(() => new Date()),
  validaAte: z.coerce.date().optional(),
  orientacoes: z.string().max(2000).optional(),
  itens: z.array(posologiaSchema).min(1).max(30),
});
export type EmitirPrescricaoInput = z.infer<typeof emitirPrescricaoSchema>;

export const StatusPrescricao = {
  ATIVA: 'ATIVA',
  SUSPENSA: 'SUSPENSA',
  ENCERRADA: 'ENCERRADA',
  SUBSTITUIDA: 'SUBSTITUIDA',
} as const;
export type StatusPrescricao = (typeof StatusPrescricao)[keyof typeof StatusPrescricao];

export const ROTULO_STATUS_PRESCRICAO: Record<StatusPrescricao, string> = {
  ATIVA: 'Ativa',
  SUSPENSA: 'Suspensa',
  ENCERRADA: 'Encerrada',
  SUBSTITUIDA: 'Substituída',
};

export const mudarStatusPrescricaoSchema = z.object({
  status: z.enum(['SUSPENSA', 'ENCERRADA', 'ATIVA']),
  motivo: z.string().max(300).optional(),
});
export type MudarStatusPrescricaoInput = z.infer<typeof mudarStatusPrescricaoSchema>;

export interface ItemPrescricaoResumo {
  id: string;
  /** Item de catálogo de origem — é por ele que a nova versão é remontada. */
  prescritivelId: string;
  /** Nome congelado na emissão — renomear o catálogo não muda o que foi prescrito. */
  nome: string;
  tipo: TipoPrescritivel;
  dose: number | null;
  unidade: string | null;
  frequencia: string | null;
  horarios: string[];
  duracaoDias: number | null;
  via: string | null;
  observacao: string | null;
  apresentacao: string | null;
}

export interface PrescricaoResumo {
  id: string;
  data: string;
  validaAte: string | null;
  orientacoes: string | null;
  versao: number;
  status: StatusPrescricao;
  motivoEncerramento: string | null;
  itens: ItemPrescricaoResumo[];
  prescritor: { id: string; nome: string; papel: Papel };
}

/**
 * Só a posologia: serve tanto para o item emitido quanto para o do modelo, que
 * usa `undefined` onde o emitido usa `null`.
 */
export interface Posologia {
  dose?: number | null;
  unidade?: string | null;
  frequencia?: string | null;
  horarios: string[];
  duracaoDias?: number | null;
  via?: string | null;
}

/** Monta a linha de posologia para exibição: "500 mg · 2x ao dia · 30 dias". */
export function descreverPosologia(item: Posologia): string {
  const partes: string[] = [];
  if (item.dose != null) partes.push(`${item.dose}${item.unidade ? ` ${item.unidade}` : ''}`);
  if (item.frequencia) partes.push(item.frequencia);
  if (item.horarios.length > 0) partes.push(item.horarios.join(', '));
  if (item.duracaoDias != null) partes.push(`${item.duracaoDias} dias`);
  if (item.via) partes.push(`via ${item.via.toLowerCase()}`);
  return partes.join(' · ');
}
