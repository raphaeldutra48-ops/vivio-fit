import { z } from 'zod';

export const TipoMaterial = {
  ARQUIVO: 'ARQUIVO',
  LINK: 'LINK',
} as const;
export type TipoMaterial = (typeof TipoMaterial)[keyof typeof TipoMaterial];

/**
 * O que a biblioteca aceita como arquivo.
 *
 * Lista fechada em vez de aberta: aceitar qualquer mimeType convidaria a subir
 * executável, e o arquivo vai para a mão do aluno.
 */
export const MIMES_DE_MATERIAL = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'audio/mpeg',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
] as const;

export const ROTULO_DO_MIME: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'Imagem',
  'image/png': 'Imagem',
  'image/webp': 'Imagem',
  'video/mp4': 'Vídeo',
  'audio/mpeg': 'Áudio',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Planilha',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Documento',
  'text/csv': 'Planilha',
};

/** 200 MB: cabe vídeo curto de execução sem virar depósito de filme. */
export const TAMANHO_MAXIMO_BYTES = 200 * 1024 * 1024;

export const criarMaterialSchema = z
  .object({
    titulo: z.string().min(2).max(160),
    descricao: z.string().max(1000).optional(),
    tipo: z.nativeEnum(TipoMaterial),
    /** Só para ARQUIVO — vem de `midia.pedirUpload`. */
    chave: z.string().max(300).optional(),
    nomeArquivo: z.string().max(200).optional(),
    mimeType: z.string().max(120).optional(),
    tamanhoBytes: z.number().int().positive().max(TAMANHO_MAXIMO_BYTES).optional(),
    /** Só para LINK. */
    url: z.string().url().max(2000).optional(),
    etiquetas: z.array(z.string().min(1).max(40)).max(10).default([]),
  })
  .refine((m) => (m.tipo === 'ARQUIVO' ? Boolean(m.chave) : Boolean(m.url)), {
    message: 'Arquivo precisa de chave de upload; link precisa de URL',
  })
  .refine((m) => m.tipo !== 'ARQUIVO' || MIMES_DE_MATERIAL.includes(m.mimeType as never), {
    message: 'Tipo de arquivo não aceito',
    path: ['mimeType'],
  });
export type CriarMaterialInput = z.infer<typeof criarMaterialSchema>;

export const compartilharMaterialSchema = z.object({
  alunoIds: z.array(z.string().cuid()).min(1).max(200),
});
export type CompartilharMaterialInput = z.infer<typeof compartilharMaterialSchema>;

export interface MaterialResumo {
  id: string;
  titulo: string;
  descricao: string | null;
  tipo: TipoMaterial;
  nomeArquivo: string | null;
  mimeType: string | null;
  tamanhoBytes: number | null;
  url: string | null;
  etiquetas: string[];
  criadoEm: string;
  /** Com quem está compartilhado — visão do profissional. */
  compartilhadoCom: { alunoId: string; nome: string; vistoEm: string | null }[];
}

/** O que o aluno vê. Sem chave nem contagem de compartilhamento. */
export interface MaterialDoAluno {
  id: string;
  titulo: string;
  descricao: string | null;
  tipo: TipoMaterial;
  nomeArquivo: string | null;
  mimeType: string | null;
  tamanhoBytes: number | null;
  url: string | null;
  etiquetas: string[];
  compartilhadoEm: string;
  vistoEm: string | null;
  autor: { id: string; nome: string };
}

/** "2,4 MB" — tamanho legível, com vírgula decimal. */
export function formatarTamanho(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
