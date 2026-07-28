import { z } from 'zod';

/** Categorias de mídia. Definem limites e onde o arquivo é guardado. */
export const TipoMidia = {
  VIDEO_EXERCICIO: 'VIDEO_EXERCICIO',
  FOTO_EVOLUCAO: 'FOTO_EVOLUCAO',
  AVATAR: 'AVATAR',
} as const;
export type TipoMidia = (typeof TipoMidia)[keyof typeof TipoMidia];

export const LIMITES_MIDIA: Record<
  TipoMidia,
  { tamanhoMaximoBytes: number; mimesAceitos: readonly string[] }
> = {
  VIDEO_EXERCICIO: {
    tamanhoMaximoBytes: 100 * 1024 * 1024,
    mimesAceitos: ['video/mp4', 'video/quicktime', 'video/webm'],
  },
  FOTO_EVOLUCAO: {
    tamanhoMaximoBytes: 15 * 1024 * 1024,
    mimesAceitos: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  },
  AVATAR: {
    tamanhoMaximoBytes: 5 * 1024 * 1024,
    mimesAceitos: ['image/jpeg', 'image/png', 'image/webp'],
  },
};

export const pedirUploadSchema = z.object({
  tipo: z.nativeEnum(TipoMidia),
  mimeType: z.string().min(3).max(100),
  tamanhoBytes: z.number().int().positive(),
});
export type PedirUploadInput = z.infer<typeof pedirUploadSchema>;

export interface AutorizacaoDeUpload {
  /** Identifica o arquivo no storage. É isto que o cliente devolve ao criar o registro. */
  chave: string;
  urlUpload: string;
  metodo: 'PUT';
  cabecalhos: Record<string, string>;
  expiraEm: string;
}

export interface UrlAssinada {
  url: string;
  expiraEm: string;
}

// --- Fotos de evolução ------------------------------------------------------

export const AnguloFoto = {
  FRENTE: 'FRENTE',
  LADO: 'LADO',
  COSTAS: 'COSTAS',
  LIVRE: 'LIVRE',
} as const;
export type AnguloFoto = (typeof AnguloFoto)[keyof typeof AnguloFoto];

export const registrarFotoSchema = z.object({
  chave: z.string().min(10),
  mimeType: z.string().min(3).max(100),
  tamanhoBytes: z.number().int().positive(),
  data: z.coerce.date().default(() => new Date()),
  angulo: z.nativeEnum(AnguloFoto).default(AnguloFoto.FRENTE),
  observacao: z.string().max(500).optional(),
  /**
   * Quem pode ver. Vazio = só o próprio aluno.
   * A foto de evolução é o dado mais íntimo do app; o padrão é não compartilhar.
   */
  visivelPara: z.array(z.enum(['PERSONAL', 'NUTRICIONISTA', 'MEDICO'])).default([]),
});
export type RegistrarFotoInput = z.infer<typeof registrarFotoSchema>;

export const atualizarVisibilidadeFotoSchema = z.object({
  visivelPara: z.array(z.enum(['PERSONAL', 'NUTRICIONISTA', 'MEDICO'])),
});
export type AtualizarVisibilidadeFotoInput = z.infer<typeof atualizarVisibilidadeFotoSchema>;

export interface FotoEvolucaoResumo {
  id: string;
  data: string;
  angulo: AnguloFoto;
  observacao: string | null;
  visivelPara: string[];
  /** Link assinado de curta duração — nunca URL pública. */
  url: string;
  urlExpiraEm: string;
}
