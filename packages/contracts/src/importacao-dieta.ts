import { z } from 'zod';

/**
 * Leitura automática de uma dieta em PDF ou foto.
 *
 * O documento vira um RASCUNHO que o profissional confere e corrige antes de
 * virar prescrição. Nunca vira plano direto, e isso não é excesso de cuidado:
 * "150 g" lido como "1500 g" é dano real, e quem assina a prescrição é a
 * pessoa, não o programa.
 *
 * Por isso não pedimos "confiança" ao modelo. Modelo de linguagem estima mal a
 * própria certeza, e um número de confiança na tela convida a confiar nele.
 * Em vez disso guardamos `textoOriginal` — a linha exata do documento — que o
 * profissional confere contra o papel. Verificável ganha de auto-avaliação.
 */

/** Um alimento do catálogo que pode ser o que a linha diz. */
export interface AlimentoCandidato {
  id: string;
  nome: string;
  /** "1 filé médio (100 g)" — ajuda a decidir entre homônimos. */
  medidaCaseira: string | null;
  medidaGramas: number | null;
  kcalPor100g: number;
}

export interface ItemLido {
  /** A linha como está no documento. É o que se confere contra o papel. */
  textoOriginal: string;
  /** O alimento que o modelo entendeu, em texto. Ainda não é um id. */
  nomeLido: string;
  /**
   * Gramas SÓ quando o documento diz gramas.
   *
   * `null` quando ele diz "1 xícara" ou "4 colheres": converter medida caseira
   * em grama depende do alimento, e chutar aqui colocaria um número exato na
   * tela sobre um palpite. O profissional preenche — ou aceita a sugestão do
   * catálogo, que aparece marcada como sugestão.
   */
  quantidadeG: number | null;
  /** "1 xícara", "4 col. sopa" — o texto da medida, quando é o que está escrito. */
  medidaCaseiraLida: string | null;
  observacao: string | null;
  /**
   * Alimentos do catálogo que podem ser este. Vazio significa que não achamos
   * nada parecido — o profissional cadastra o alimento e segue.
   */
  candidatos: AlimentoCandidato[];
  /**
   * O candidato que o casamento considerou melhor, ou `null` quando nenhum
   * ficou bom o bastante. `null` obriga a escolha manual, que é o certo: uma
   * sugestão fraca pré-selecionada é aceita sem olhar.
   */
  alimentoIdSugerido: string | null;
}

export interface RefeicaoLida {
  nome: string;
  /** "07:30" quando o documento diz; `null` quando não diz. */
  horarioSugerido: string | null;
  itens: ItemLido[];
}

export interface LeituraDeDieta {
  nome: string;
  observacao: string | null;
  kcalAlvo: number | null;
  proteinaAlvoG: number | null;
  carboAlvoG: number | null;
  gorduraAlvoG: number | null;
  refeicoes: RefeicaoLida[];
  /**
   * O que o modelo não conseguiu ler com segurança: rasura, número cortado,
   * página torta. Vai para a tela como aviso, não como erro — o documento
   * ainda serve, só exige mais atenção naquele ponto.
   */
  avisos: string[];
  /** Quantos itens ficaram sem candidato — o tamanho do trabalho manual. */
  itensSemCandidato: number;
}

/**
 * O que pedimos ao modelo.
 *
 * É deliberadamente MENOS do que `LeituraDeDieta`: nada de `candidatos` nem de
 * `alimentoIdSugerido`. O modelo não conhece o catálogo e não deve inventar
 * ids — casar com o catálogo é trabalho do servidor, sobre dado que ele tem.
 */
export const itemExtraidoSchema = z.object({
  textoOriginal: z.string(),
  nomeLido: z.string(),
  quantidadeG: z.number().positive().max(5000).nullable(),
  medidaCaseiraLida: z.string().nullable(),
  observacao: z.string().nullable(),
});
export type ItemExtraido = z.infer<typeof itemExtraidoSchema>;

export const refeicaoExtraidaSchema = z.object({
  nome: z.string().min(1).max(60),
  horarioSugerido: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  itens: z.array(itemExtraidoSchema),
});

export const dietaExtraidaSchema = z.object({
  nome: z.string().min(1).max(120),
  observacao: z.string().nullable(),
  kcalAlvo: z.number().int().min(500).max(8000).nullable(),
  proteinaAlvoG: z.number().int().min(0).max(600).nullable(),
  carboAlvoG: z.number().int().min(0).max(1200).nullable(),
  gorduraAlvoG: z.number().int().min(0).max(400).nullable(),
  refeicoes: z.array(refeicaoExtraidaSchema).min(1).max(12),
  avisos: z.array(z.string()),
});
export type DietaExtraida = z.infer<typeof dietaExtraidaSchema>;

/**
 * Normaliza para comparar: sem acento, sem caixa, sem plural bobo.
 *
 * "Arroz Branco Cozido" e "arroz branco, cozido" têm de casar. Sem isto, o
 * casamento erra em quase toda linha — o documento é escrito por gente, o
 * catálogo por outra gente.
 */
export function normalizarParaBusca(texto: string): string {
  return texto
    .normalize('NFD')
    // \p{Mn} = marca combinante sem largura. Depois do NFD, é exatamente o
    // acento separado da letra. Escrito assim, e não como faixa de caracteres
    // literais, porque aqueles são invisíveis no fonte e somem em qualquer
    // editor que normalize o arquivo.
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Palavras que não distinguem alimento nenhum e só atrapalham a pontuação. */
const PALAVRAS_VAZIAS = new Set(['de', 'da', 'do', 'com', 'e', 'ou', 'a', 'o', 'em', 'no', 'na']);

export function palavrasSignificativas(texto: string): string[] {
  return normalizarParaBusca(texto)
    .split(' ')
    .filter((p) => p.length > 2 && !PALAVRAS_VAZIAS.has(p));
}

/**
 * Quanto o nome do catálogo combina com o que foi lido, de 0 a 1.
 *
 * Conta palavras significativas em comum sobre o total do que foi lido. Não é
 * distância de edição: erro de leitura em dieta é palavra faltando ou sobrando
 * ("arroz" vs "arroz branco cozido"), não letra trocada.
 *
 * O denominador é o texto LIDO, e não o do catálogo, de propósito: um item do
 * catálogo com nome longo não deve ser punido por ser específico.
 */
export function pontuarCandidato(nomeLido: string, nomeCatalogo: string): number {
  const lidas = palavrasSignificativas(nomeLido);
  if (lidas.length === 0) return 0;

  const doCatalogo = new Set(palavrasSignificativas(nomeCatalogo));
  const emComum = lidas.filter((p) => doCatalogo.has(p)).length;
  const base = emComum / lidas.length;

  // Nome idêntico não pode empatar com nome que só contém as mesmas palavras.
  if (normalizarParaBusca(nomeLido) === normalizarParaBusca(nomeCatalogo)) return 1;
  // Teto abaixo de 1 para o casamento parcial: só o exato merece certeza.
  return Math.min(base, 0.95);
}

/**
 * Abaixo disto não sugerimos nada.
 *
 * Uma sugestão fraca pré-selecionada é pior do que nenhuma: ela é aceita sem
 * olhar, e o erro entra na dieta com a aparência de ter sido conferido.
 */
export const PONTUACAO_MINIMA_PARA_SUGERIR = 0.6;

/** Quantos candidatos mostrar. Mais que isso vira lista para rolar, não escolha. */
export const MAXIMO_DE_CANDIDATOS = 5;
