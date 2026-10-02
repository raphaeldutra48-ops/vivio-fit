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

/**
 * O nome da profissão como se escreve para gente.
 *
 * Existe porque a mesma tabela estava copiada em cinco telas — duas do
 * aplicativo, três da web — e as cópias já divergiam: o mesmo profissional era
 * "Médico" na página pública e "Médico(a)" no cabeçalho do painel. O preço da
 * cópia apareceu em dois lugares que ficaram SEM nenhuma delas e mostravam o
 * enum cru: a equipe de cuidado na ficha do aluno escrevia "MEDICO", sem acento,
 * e a tela de fotos do app escrevia "LADO_DIREITO", com sublinhado.
 *
 * `Record<Papel, string>` e não `Partial`: o tipo obriga a dar nome a todo papel
 * que existir, hoje e amanhã. Papel novo sem rótulo não compila — que é melhor
 * do que aparecer em caixa alta na tela de alguém.
 */
export const ROTULO_PAPEL: Record<Papel, string> = {
  ALUNO: 'Aluno',
  PERSONAL: 'Personal trainer',
  NUTRICIONISTA: 'Nutricionista',
  MEDICO: 'Médico',
  ADMIN: 'Administrador',
  ACADEMIA: 'Academia',
};

/**
 * O mesmo papel, quando a frase fala de uma PESSOA e não de uma profissão.
 *
 * São duas tabelas porque são duas coisas ditas. "Nutricionista" nomeia o ofício
 * — é o que a página pública e a escolha no cadastro precisam. "Médico(a)"
 * aparece onde há alguém do outro lado: a equipe de cuidado do aluno, a lista de
 * conversas, o cabeçalho de quem está logado. As cinco cópias espalhadas já
 * faziam essa distinção sem nome nenhum, e por isso ela parecia divergência.
 */
export const ROTULO_PAPEL_INCLUSIVO: Record<Papel, string> = {
  ALUNO: 'Aluno(a)',
  PERSONAL: 'Personal trainer',
  NUTRICIONISTA: 'Nutricionista',
  MEDICO: 'Médico(a)',
  ADMIN: 'Administrador(a)',
  ACADEMIA: 'Academia',
};
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
  /**
   * Enviar documento de saúde do aluno para leitura automática por serviço de
   * terceiro, fora do país.
   *
   * Separado de `NUTRICAO` de propósito: autorizar o profissional a **ver** a
   * dieta não autoriza uma empresa estrangeira a **processar** o documento.
   * São finalidades diferentes, e para dado sensível a LGPD pede consentimento
   * específico e destacado por finalidade — reaproveitar o de nutrição aqui
   * seria usar um "sim" dado para outra pergunta.
   */
  LEITURA_AUTOMATICA: 'LEITURA_AUTOMATICA',
} as const;
export type EscopoDado = (typeof EscopoDado)[keyof typeof EscopoDado];
export const escopoDadoSchema = z.nativeEnum(EscopoDado);
