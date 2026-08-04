import { z } from 'zod';

/**
 * Condições de saúde do aluno.
 *
 * É a outra metade do alerta cruzado. O exame produz achado bioquímico; aqui
 * mora o que não sai em exame nenhum — uma lesão no joelho, uma alergia a
 * amendoim, uma gestação. São esses os fatos que mudam a conduta do personal e
 * do nutricionista sem que eles precisem abrir prontuário.
 *
 * Diferente do exame, a condição **é legível pelos três profissionais**: um
 * personal que não sabe da lesão no ombro do aluno vai prescrever
 * desenvolvimento militar. O que continua privativo do médico é **escrever** —
 * diagnosticar não é papel de quem prescreve treino ou dieta.
 */

export const TipoCondicao = {
  LESAO: 'LESAO',
  DOENCA_CRONICA: 'DOENCA_CRONICA',
  ALERGIA_ALIMENTAR: 'ALERGIA_ALIMENTAR',
  INTOLERANCIA: 'INTOLERANCIA',
  RESTRICAO_ALIMENTAR: 'RESTRICAO_ALIMENTAR',
  MEDICACAO_CONTINUA: 'MEDICACAO_CONTINUA',
  CIRURGIA_RECENTE: 'CIRURGIA_RECENTE',
  GESTACAO: 'GESTACAO',
} as const;
export type TipoCondicao = (typeof TipoCondicao)[keyof typeof TipoCondicao];

export const ROTULO_TIPO_CONDICAO: Record<TipoCondicao, string> = {
  LESAO: 'Lesão',
  DOENCA_CRONICA: 'Doença crônica',
  ALERGIA_ALIMENTAR: 'Alergia alimentar',
  INTOLERANCIA: 'Intolerância',
  RESTRICAO_ALIMENTAR: 'Restrição alimentar',
  MEDICACAO_CONTINUA: 'Medicação contínua',
  CIRURGIA_RECENTE: 'Cirurgia recente',
  GESTACAO: 'Gestação',
};

/**
 * Região do corpo — só faz sentido em lesão e cirurgia.
 *
 * A lista é curta de propósito: ela existe para o motor de alerta saber o que
 * dizer ao personal, não para ser um atlas anatômico. Região que não muda a
 * conduta de treino não precisa estar aqui.
 */
export const RegiaoCorpo = {
  OMBRO: 'OMBRO',
  COTOVELO: 'COTOVELO',
  PUNHO_MAO: 'PUNHO_MAO',
  COLUNA_CERVICAL: 'COLUNA_CERVICAL',
  COLUNA_LOMBAR: 'COLUNA_LOMBAR',
  QUADRIL: 'QUADRIL',
  JOELHO: 'JOELHO',
  TORNOZELO_PE: 'TORNOZELO_PE',
} as const;
export type RegiaoCorpo = (typeof RegiaoCorpo)[keyof typeof RegiaoCorpo];

export const ROTULO_REGIAO: Record<RegiaoCorpo, string> = {
  OMBRO: 'Ombro',
  COTOVELO: 'Cotovelo',
  PUNHO_MAO: 'Punho ou mão',
  COLUNA_CERVICAL: 'Coluna cervical',
  COLUNA_LOMBAR: 'Coluna lombar',
  QUADRIL: 'Quadril',
  JOELHO: 'Joelho',
  TORNOZELO_PE: 'Tornozelo ou pé',
};

export const GravidadeCondicao = {
  LEVE: 'LEVE',
  MODERADA: 'MODERADA',
  GRAVE: 'GRAVE',
} as const;
export type GravidadeCondicao = (typeof GravidadeCondicao)[keyof typeof GravidadeCondicao];

export const ROTULO_GRAVIDADE: Record<GravidadeCondicao, string> = {
  LEVE: 'Leve',
  MODERADA: 'Moderada',
  GRAVE: 'Grave',
};

/** Tipos que exigem região do corpo — sem ela o alerta não sabe o que dizer. */
export const TIPOS_COM_REGIAO: TipoCondicao[] = [
  TipoCondicao.LESAO,
  TipoCondicao.CIRURGIA_RECENTE,
];

// --- Entrada -----------------------------------------------------------------

export const registrarCondicaoSchema = z
  .object({
    tipo: z.nativeEnum(TipoCondicao),
    /** O que é, em uma linha: "tendinite do supraespinhal", "alergia a amendoim". */
    descricao: z.string().min(3).max(200),
    regiao: z.nativeEnum(RegiaoCorpo).optional(),
    gravidade: z.nativeEnum(GravidadeCondicao).default(GravidadeCondicao.MODERADA),
    inicioEm: z.coerce.date().optional(),
    observacao: z.string().max(1000).optional(),
  })
  .refine((c) => !TIPOS_COM_REGIAO.includes(c.tipo) || c.regiao !== undefined, {
    message: 'Lesão e cirurgia precisam da região do corpo',
    path: ['regiao'],
  });
export type RegistrarCondicaoInput = z.infer<typeof registrarCondicaoSchema>;

export const resolverCondicaoSchema = z.object({
  observacao: z.string().max(1000).optional(),
});
export type ResolverCondicaoInput = z.infer<typeof resolverCondicaoSchema>;

// --- Saída -------------------------------------------------------------------

export interface CondicaoResumo {
  id: string;
  tipo: TipoCondicao;
  descricao: string;
  regiao: RegiaoCorpo | null;
  gravidade: GravidadeCondicao;
  inicioEm: string | null;
  observacao: string | null;
  registradoPor: { id: string; nome: string };
  criadoEm: string;
  /** Preenchido quando a condição deixou de valer. */
  resolvidaEm: string | null;
  resolvidaPor: { id: string; nome: string } | null;
}

/** "Lesão · Joelho · Moderada" — como a condição aparece numa linha. */
export function descreverCondicao(c: CondicaoResumo): string {
  return [
    ROTULO_TIPO_CONDICAO[c.tipo],
    c.regiao ? ROTULO_REGIAO[c.regiao] : null,
    ROTULO_GRAVIDADE[c.gravidade],
  ]
    .filter(Boolean)
    .join(' · ');
}
