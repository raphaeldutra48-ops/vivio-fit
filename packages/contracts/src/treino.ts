import { z } from 'zod';

// --- Exercícios -------------------------------------------------------------

export const GRUPOS_MUSCULARES = [
  'PEITO',
  'COSTAS',
  'OMBRO',
  'BICEPS',
  'TRICEPS',
  'PERNA',
  'GLUTEO',
  'PANTURRILHA',
  'ABDOMEN',
  'CORPO_INTEIRO',
  'CARDIO',
] as const;
export type GrupoMuscular = (typeof GRUPOS_MUSCULARES)[number];

export const criarExercicioSchema = z.object({
  nome: z.string().min(2).max(120),
  grupoMuscular: z.enum(GRUPOS_MUSCULARES),
  equipamento: z.string().max(60).optional(),
  instrucoes: z.string().max(2000).optional(),
});
export type CriarExercicioInput = z.infer<typeof criarExercicioSchema>;

export const atualizarExercicioSchema = criarExercicioSchema.partial();
export type AtualizarExercicioInput = z.infer<typeof atualizarExercicioSchema>;

export const listarExerciciosSchema = z.object({
  q: z.string().max(80).optional(),
  grupoMuscular: z.enum(GRUPOS_MUSCULARES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListarExerciciosQuery = z.infer<typeof listarExerciciosSchema>;

export interface ExercicioResumo {
  id: string;
  nome: string;
  grupoMuscular: GrupoMuscular;
  equipamento: string | null;
  instrucoes: string | null;
  escopo: 'GLOBAL' | 'PRIVADO';
  /** Vídeo do próprio exercício — o do acervo, igual para todo mundo. */
  temVideo: boolean;
  /**
   * Há gravação de quem acompanha esta pessoa: a do próprio profissional
   * quando é ele olhando, a da equipe quando é o aluno.
   *
   * Separado de `temVideo` porque as duas respondem perguntas diferentes. Para
   * quem está gravando o acervo, "o catálogo tem um vídeo genérico" e "eu já
   * gravei este" são estados distintos — juntar os dois num booleano só faz o
   * profissional regravar o que já gravou, e são 159 exercícios.
   *
   * `null` quer dizer **não consultado**, e não "não tem": o plano de treino
   * devolve exercícios sem ir atrás das demonstrações, pela mesma razão que
   * devolve `imagemUrl: null`. Um `false` ali afirmaria algo que ninguém
   * verificou, e a tela mostraria "sem gravação" sobre um vídeo existente.
   */
  temDemonstracao: boolean | null;
  criadoPorId: string | null;
  /**
   * Passo a passo de execução. Vazio é normal: nem todo exercício tem, e a
   * tela cai para `instrucoes`, a linha única.
   *
   * As duas coisas convivem porque servem a momentos diferentes — `instrucoes`
   * é o erro a evitar, para ler entre séries; `passos` ensina o movimento a
   * quem nunca fez.
   */
  passos: string[];
  /** Link assinado da imagem demonstrativa; `null` quando não há. */
  imagemUrl: string | null;
  /**
   * Crédito a exibir junto da imagem — `null` quando a mídia é própria.
   *
   * Vem do resumo, e não de uma consulta à parte, porque licença aberta exige
   * que o crédito apareça **onde a imagem aparece**. Separar os dois é o jeito
   * mais fácil de a tela mostrar uma sem a outra.
   */
  imagemCredito: string | null;
  videoCredito: string | null;
}

/**
 * Um item da fila de gravação do profissional.
 *
 * Não reaproveita `ExercicioResumo` de propósito: aqui não há link assinado de
 * imagem, e assinar 159 URLs para uma tela que é uma lista de trabalho seria
 * pagar caro por nada.
 */
export interface ExercicioAGravar {
  id: string;
  nome: string;
  grupoMuscular: GrupoMuscular;
  equipamento: string | null;
  /**
   * Decide o destino do vídeo: no exercício próprio ele vai para o exercício;
   * no global, vira demonstração — criar um "supino do Diego" quebraria o
   * histórico de carga do aluno, que é indexado por exercício.
   */
  escopo: 'GLOBAL' | 'PRIVADO';
  /** Quantas vezes ele já prescreveu isto. Zero é comum e não é erro. */
  vezesPrescrito: number;
  /** Há imagem ou vídeo do acervo — o aluno não está totalmente às cegas. */
  temAlgumaReferencia: boolean;
}

// --- Plano de treino --------------------------------------------------------

export const itemTreinoSchema = z.object({
  exercicioId: z.string().cuid(),
  series: z.number().int().min(1).max(20),
  /** Texto livre: "8-12", "até a falha", "30s". */
  repsAlvo: z.string().min(1).max(30),
  cargaSugeridaKg: z.number().min(0).max(1000).optional(),
  descansoSeg: z.number().int().min(0).max(900).optional(),
  tecnica: z.string().max(60).optional(),
  observacao: z.string().max(500).optional(),
  supersetGrupo: z.string().max(10).optional(),
});
export type ItemTreinoInput = z.infer<typeof itemTreinoSchema>;

export const sessaoTreinoSchema = z.object({
  nome: z.string().min(1).max(60),
  diaSugerido: z.number().int().min(1).max(7).optional(),
  itens: z.array(itemTreinoSchema).min(1).max(30),
});
export type SessaoTreinoInput = z.infer<typeof sessaoTreinoSchema>;

export const criarPlanoTreinoSchema = z.object({
  nome: z.string().min(2).max(120),
  objetivo: z.string().max(200).optional(),
  /** Cria já ATIVO em vez de RASCUNHO. */
  ativar: z.boolean().default(false),
  sessoes: z.array(sessaoTreinoSchema).min(1).max(10),
});
export type CriarPlanoTreinoInput = z.infer<typeof criarPlanoTreinoSchema>;

export interface ItemTreinoResumo {
  id: string;
  ordem: number;
  series: number;
  repsAlvo: string;
  cargaSugeridaKg: number | null;
  descansoSeg: number | null;
  tecnica: string | null;
  observacao: string | null;
  supersetGrupo: string | null;
  exercicio: ExercicioResumo;
}

export interface SessaoTreinoResumo {
  id: string;
  nome: string;
  ordem: number;
  diaSugerido: number | null;
  itens: ItemTreinoResumo[];
}

export interface PlanoTreinoResumo {
  id: string;
  nome: string;
  objetivo: string | null;
  versao: number;
  status: 'RASCUNHO' | 'ATIVO' | 'ARQUIVADO';
  inicioEm: string | null;
  fimEm: string | null;
  totalSessoes: number;
  personal: { id: string; nome: string };
}

/** Payload completo — é o que o mobile guarda em cache para funcionar offline. */
export interface PlanoTreinoCompleto extends PlanoTreinoResumo {
  sessoes: SessaoTreinoResumo[];
}

/**
 * Demonstração dos exercícios de uma sessão, pedida no começo do treino.
 *
 * Separada do plano de propósito: o plano fica em cache para o app funcionar
 * sem rede, e link assinado dura poucos minutos — guardado junto, chegaria
 * morto. Aqui é pedido na hora de treinar, quando o link ainda vale.
 */
export const midiaDeExerciciosSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(50),
});
export type MidiaDeExerciciosInput = z.infer<typeof midiaDeExerciciosSchema>;

/** Exercício sem mídia nenhuma não aparece no mapa — a tela trata a ausência. */
export type MidiaDeExercicios = Record<
  string,
  { imagemUrl: string | null; videoUrl: string | null }
>;
