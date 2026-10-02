import { z } from 'zod';
import { LIMITES_DE_TEXTO } from './numeros';
import { Papel } from './enums';

/** Senha: mínimo 8, com letra e número. Regra deliberadamente simples de explicar ao usuário. */
/**
 * O teto de 72 não é estético: é onde o bcrypt para de ler.
 *
 * O Supabase Auth guarda a senha com bcrypt, que considera no máximo 72 bytes e
 * **descarta o resto em silêncio**. Sem o limite, quem escolhesse uma frase de
 * 100 caracteres estaria protegido pelos 72 primeiros — e entraria depois
 * digitando qualquer coisa a partir dali, o que é o oposto do que a frase longa
 * prometia. Recusar na hora da escolha é dizer a verdade; aceitar e truncar é
 * mentir sobre a força da senha.
 */
export const senhaSchema = z
  .string()
  .min(8, 'A senha precisa de ao menos 8 caracteres')
  .max(72, 'A senha pode ter até 72 caracteres')
  .regex(/[A-Za-zÀ-ÿ]/, 'A senha precisa de ao menos uma letra')
  .regex(/[0-9]/, 'A senha precisa de ao menos um número');

export const registrarAlunoSchema = z.object({
  nome: z.string().min(2).max(120),
  email: z.string().email().max(160),
  senha: senhaSchema,
  telefone: z.string().min(8).max(20).optional(),
  dataNascimento: z.coerce.date(),
  alturaCm: z.number().int().min(80).max(260).optional(),
  objetivo: z.enum(['HIPERTROFIA', 'EMAGRECIMENTO', 'SAUDE', 'PERFORMANCE']).optional(),
});
export type RegistrarAlunoInput = z.infer<typeof registrarAlunoSchema>;

export const registrarProfissionalSchema = z.object({
  nome: z.string().min(2).max(120),
  email: z.string().email().max(160),
  senha: senhaSchema,
  telefone: z.string().min(8).max(20).optional(),
  tipo: z.enum([Papel.PERSONAL, Papel.NUTRICIONISTA, Papel.MEDICO]),
  registroConselho: z.string().min(3).max(40),
  ufRegistro: z.string().length(2),
  // O teto do ARRAY existia; o de cada item, não — uma especialidade podia ser
  // um texto de megabytes.
  especialidades: z.array(z.string().min(2).max(LIMITES_DE_TEXTO.curto)).max(10).default([]),
  bio: z.string().max(1000).optional(),
});
export type RegistrarProfissionalInput = z.infer<typeof registrarProfissionalSchema>;

export const loginSchema = z.object({
  email: z.string().email().max(160),
  // O mesmo teto da escolha: não há senha válida acima dele, e sem o limite o
  // corpo da requisição de entrar não tinha tamanho máximo nenhum.
  senha: z.string().min(1).max(72),
});
export type LoginInput = z.infer<typeof loginSchema>;

/*
  `refreshSchema` morava aqui e saiu em 02/10.

  Era da época da API própria, que renovava o token por rota nossa. Com o
  Supabase Auth quem renova é o `supabase-js`, sozinho, e nada no projeto
  importava esse schema nem o tipo dele — a varredura de campos sem teto o achou
  como "string sem limite" e foi assim que ele apareceu. Schema exportado que
  ninguém usa é pior que código morto comum: parece contrato.
*/

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

/**
 * Resposta do cadastro. Não traz tokens de propósito: se trouxesse, quem
 * cadastrasse com o e-mail de outra pessoa já entraria, e a confirmação viraria
 * enfeite. A sessão só nasce quando o e-mail é confirmado.
 */
export interface RespostaRegistro {
  usuario: { id: string; email: string; nome: string; papel: Papel };
  precisaConfirmarEmail: true;
  /** Só fora de produção: permite confirmar sem abrir caixa de entrada. */
  tokenDeVerificacao?: string;
}

export const verificarEmailSchema = z.object({
  token: z.string().min(10).max(200),
});
export type VerificarEmailInput = z.infer<typeof verificarEmailSchema>;

export const reenviarVerificacaoSchema = z.object({
  email: z.string().email().max(160),
});
export type ReenviarVerificacaoInput = z.infer<typeof reenviarVerificacaoSchema>;

// --- recuperação de senha ----------------------------------------------------

export const esqueciSenhaSchema = z.object({
  email: z.string().email().max(160),
});
export type EsqueciSenhaInput = z.infer<typeof esqueciSenhaSchema>;

export const redefinirSenhaSchema = z.object({
  token: z.string().min(10).max(200),
  senha: senhaSchema,
});
export type RedefinirSenhaInput = z.infer<typeof redefinirSenhaSchema>;
