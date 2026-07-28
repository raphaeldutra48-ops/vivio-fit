import { z } from 'zod';

/** Papéis do sistema. Espelha o enum `Papel` do Prisma. */
export const Papel = {
  ALUNO: 'ALUNO',
  PERSONAL: 'PERSONAL',
  NUTRICIONISTA: 'NUTRICIONISTA',
  MEDICO: 'MEDICO',
  ADMIN: 'ADMIN',
  ACADEMIA: 'ACADEMIA',
} as const;
export type Papel = (typeof Papel)[keyof typeof Papel];
export const papelSchema = z.nativeEnum(Papel);

/** Papéis que atendem alunos — os que podem ter Vinculo. */
export const PAPEIS_PROFISSIONAIS = [
  Papel.PERSONAL,
  Papel.NUTRICIONISTA,
  Papel.MEDICO,
] as const satisfies readonly Papel[];

export const StatusConta = {
  PENDENTE_VERIFICACAO: 'PENDENTE_VERIFICACAO',
  ATIVA: 'ATIVA',
  SUSPENSA: 'SUSPENSA',
  DESATIVADA: 'DESATIVADA',
} as const;
export type StatusConta = (typeof StatusConta)[keyof typeof StatusConta];
export const statusContaSchema = z.nativeEnum(StatusConta);

export const StatusVinculo = {
  PENDENTE: 'PENDENTE',
  ATIVO: 'ATIVO',
  ENCERRADO: 'ENCERRADO',
  RECUSADO: 'RECUSADO',
} as const;
export type StatusVinculo = (typeof StatusVinculo)[keyof typeof StatusVinculo];
export const statusVinculoSchema = z.nativeEnum(StatusVinculo);

/**
 * Escopos de dado sujeitos a consentimento explícito do aluno (LGPD art. 11).
 * Sem consentimento vigente, o backend nega a leitura mesmo com vínculo ativo.
 */
export const EscopoDado = {
  TREINO: 'TREINO',
  NUTRICAO: 'NUTRICAO',
  CLINICO: 'CLINICO',
  EVOLUCAO: 'EVOLUCAO',
  MENSAGENS: 'MENSAGENS',
} as const;
export type EscopoDado = (typeof EscopoDado)[keyof typeof EscopoDado];
export const escopoDadoSchema = z.nativeEnum(EscopoDado);
