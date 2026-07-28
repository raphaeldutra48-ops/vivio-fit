import { z } from 'zod';
import { Papel } from './enums';

/** Senha: mínimo 8, com letra e número. Regra deliberadamente simples de explicar ao usuário. */
export const senhaSchema = z
  .string()
  .min(8, 'A senha precisa de ao menos 8 caracteres')
  .regex(/[A-Za-zÀ-ÿ]/, 'A senha precisa de ao menos uma letra')
  .regex(/[0-9]/, 'A senha precisa de ao menos um número');

export const registrarAlunoSchema = z.object({
  nome: z.string().min(2).max(120),
  email: z.string().email(),
  senha: senhaSchema,
  telefone: z.string().min(8).max(20).optional(),
  dataNascimento: z.coerce.date(),
  alturaCm: z.number().int().min(80).max(260).optional(),
  objetivo: z.enum(['HIPERTROFIA', 'EMAGRECIMENTO', 'SAUDE', 'PERFORMANCE']).optional(),
});
export type RegistrarAlunoInput = z.infer<typeof registrarAlunoSchema>;

export const registrarProfissionalSchema = z.object({
  nome: z.string().min(2).max(120),
  email: z.string().email(),
  senha: senhaSchema,
  telefone: z.string().min(8).max(20).optional(),
  tipo: z.enum([Papel.PERSONAL, Papel.NUTRICIONISTA, Papel.MEDICO]),
  registroConselho: z.string().min(3).max(40),
  ufRegistro: z.string().length(2),
  especialidades: z.array(z.string()).max(10).default([]),
  bio: z.string().max(1000).optional(),
});
export type RegistrarProfissionalInput = z.infer<typeof registrarProfissionalSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

/** Conteúdo do access token. Só o essencial — token não é lugar de guardar dado. */
export interface PayloadAccessToken {
  sub: string;
  papel: Papel;
  email: string;
}

export interface UsuarioAutenticado {
  id: string;
  email: string;
  nome: string;
  papel: Papel;
}

export interface ParDeTokens {
  accessToken: string;
  refreshToken: string;
  expiraEm: number;
}

export interface RespostaAutenticacao extends ParDeTokens {
  usuario: UsuarioAutenticado & { emailVerificado: boolean };
}
