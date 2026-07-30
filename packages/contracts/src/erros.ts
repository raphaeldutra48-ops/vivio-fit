import { z } from 'zod';

/**
 * Códigos de erro estáveis. O cliente decide o que mostrar a partir do código,
 * nunca do texto da mensagem.
 */
export const CodigoErro = {
  NAO_AUTENTICADO: 'NAO_AUTENTICADO',
  TOKEN_INVALIDO: 'TOKEN_INVALIDO',
  TOKEN_REUTILIZADO: 'TOKEN_REUTILIZADO',
  CREDENCIAIS_INVALIDAS: 'CREDENCIAIS_INVALIDAS',
  /** Senha correta, e-mail ainda não confirmado — o cliente oferece o reenvio. */
  EMAIL_NAO_VERIFICADO: 'EMAIL_NAO_VERIFICADO',
  EMAIL_JA_CADASTRADO: 'EMAIL_JA_CADASTRADO',
  PAPEL_NAO_AUTORIZADO: 'PAPEL_NAO_AUTORIZADO',
  VINCULO_AUSENTE: 'VINCULO_AUSENTE',
  CONSENTIMENTO_AUSENTE: 'CONSENTIMENTO_AUSENTE',
  RECURSO_NAO_ENCONTRADO: 'RECURSO_NAO_ENCONTRADO',
  DADOS_INVALIDOS: 'DADOS_INVALIDOS',
  CONFLITO: 'CONFLITO',
  LIMITE_EXCEDIDO: 'LIMITE_EXCEDIDO',
} as const;
export type CodigoErro = (typeof CodigoErro)[keyof typeof CodigoErro];

export const erroRespostaSchema = z.object({
  erro: z.object({
    codigo: z.nativeEnum(CodigoErro),
    mensagem: z.string(),
    detalhes: z.record(z.unknown()).optional(),
  }),
});
export type ErroResposta = z.infer<typeof erroRespostaSchema>;

/** Envelope de paginação por cursor usado por toda listagem da API. */
export const paginacaoQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginacaoQuery = z.infer<typeof paginacaoQuerySchema>;

export interface PaginaResposta<T> {
  dados: T[];
  proximoCursor: string | null;
}
