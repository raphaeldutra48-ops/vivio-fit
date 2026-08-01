import type { AlimentoResumo, CriarPlanoDietaInput, Macros } from '@vivio/contracts';

/**
 * Cálculo, validação e montagem do corpo do plano alimentar.
 *
 * Fora do componente pela mesma razão do `anamnese.ts`: é a parte que erra em
 * silêncio. O campo de gramas é texto — precisa ser, senão apagar o conteúdo
 * para redigitar viraria zero a cada tecla — e vira número só aqui. Enquanto
 * essa conversão morava dentro da tela, um campo vazio virava `0` e um campo
 * com lixo virava `NaN`; os dois eram enviados, e o schema do servidor
 * (`quantidadeG: z.number().positive().max(5000)`) recusava com um 400 que a
 * tela traduzia como "Não foi possível salvar o plano" — depois de o
 * nutricionista ter montado a dieta inteira.
 */

export interface ItemNaTela {
  chave: string;
  alimento: AlimentoResumo;
  /** Texto cru do campo. Só vira número ao somar ou ao enviar. */
  quantidadeG: string;
}

export interface RefeicaoNaTela {
  nome: string;
  horario: string;
  itens: ItemNaTela[];
}

/** As quatro metas, como estão nos campos: texto, possivelmente vazio. */
export interface MetasNaTela {
  kcal: string;
  proteina: string;
  carbo: string;
  gordura: string;
}

/** Espelha `itemRefeicaoSchema` em `@vivio/contracts`. */
export const GRAMAS_MAX = 5000;

/** Espelha as faixas de `criarPlanoDietaSchema`. Todas exigem inteiro. */
const FAIXA_DA_META = {
  kcal: { rotulo: 'Meta kcal', min: 500, max: 8000 },
  proteina: { rotulo: 'Meta proteína (g)', min: 0, max: 600 },
  carbo: { rotulo: 'Meta carbo (g)', min: 0, max: 1200 },
  gordura: { rotulo: 'Meta gordura (g)', min: 0, max: 400 },
} as const;

/**
 * Texto do campo → número, ou `null` quando não dá para ler.
 *
 * Aceita vírgula porque é assim que se escreve decimal em português. Devolver
 * `null` em vez de `0` é o ponto: quem chama precisa distinguir "o campo está
 * vazio" de "o nutricionista prescreveu zero grama".
 */
export function quantidadeEmGramas(texto: string): number | null {
  const limpo = texto.trim().replace(/,/g, '.');
  if (limpo === '') return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** Mensagem para o campo, ou `null` se está bom. */
export function problemaDaQuantidade(texto: string): string | null {
  const g = quantidadeEmGramas(texto);
  if (g === null) return 'informe a quantidade em gramas';
  if (g <= 0) return 'precisa ser maior que zero';
  if (g > GRAMAS_MAX) return `no máximo ${GRAMAS_MAX} g`;
  return null;
}

/** Meta em branco é ausência, não erro — as quatro são opcionais. */
export function metaEmNumero(texto: string): number | undefined {
  const limpo = texto.trim().replace(/,/g, '.');
  if (limpo === '') return undefined;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : undefined;
}

function problemaDaMeta(texto: string, faixa: { rotulo: string; min: number; max: number }) {
  const limpo = texto.trim();
  if (limpo === '') return null;
  const n = metaEmNumero(limpo);
  if (n === undefined) return `${faixa.rotulo}: use só números.`;
  if (!Number.isInteger(n)) return `${faixa.rotulo}: use um número inteiro.`;
  if (n < faixa.min || n > faixa.max) {
    return `${faixa.rotulo}: use um valor entre ${faixa.min} e ${faixa.max}.`;
  }
  return null;
}

/**
 * Tudo que impede salvar, em texto para a tela. Vazio significa que dá.
 *
 * Cada item aqui corresponde a uma regra que o servidor também aplica — a
 * lista existe para o erro aparecer no campo, e não como 400 genérico no fim.
 */
export function problemasDoPlano(
  nome: string,
  refeicoes: RefeicaoNaTela[],
  metas: MetasNaTela,
): string[] {
  const problemas: string[] = [];

  if (nome.trim().length < 2) problemas.push('Dê um nome ao plano (ao menos 2 letras).');

  refeicoes.forEach((r, i) => {
    const comoChamar = r.nome.trim() || `Refeição ${i + 1}`;
    if (r.nome.trim() === '') problemas.push(`Refeição ${i + 1}: dê um nome.`);
    if (r.itens.length === 0) problemas.push(`"${comoChamar}" está sem alimentos.`);
    r.itens.forEach((it) => {
      const problema = problemaDaQuantidade(it.quantidadeG);
      if (problema) problemas.push(`${it.alimento.nome} em "${comoChamar}": ${problema}.`);
    });
  });

  for (const chave of ['kcal', 'proteina', 'carbo', 'gordura'] as const) {
    const problema = problemaDaMeta(metas[chave], FAIXA_DA_META[chave]);
    if (problema) problemas.push(problema);
  }

  return problemas;
}

export function podeSalvarPlano(
  nome: string,
  refeicoes: RefeicaoNaTela[],
  metas: MetasNaTela,
): boolean {
  return problemasDoPlano(nome, refeicoes, metas).length === 0;
}

/**
 * Só faz sentido com `problemasDoPlano` vazio — o `?? 0` existe para o tipo
 * fechar, e um zero que escapasse ainda seria recusado pelo `positive()` do
 * servidor, que é a última palavra sobre o que entra no banco.
 */
export function corpoDoPlano(
  nome: string,
  metas: MetasNaTela,
  refeicoes: RefeicaoNaTela[],
  ativar: boolean,
): CriarPlanoDietaInput {
  return {
    nome: nome.trim(),
    ativar,
    kcalAlvo: metaEmNumero(metas.kcal),
    proteinaAlvoG: metaEmNumero(metas.proteina),
    carboAlvoG: metaEmNumero(metas.carbo),
    gorduraAlvoG: metaEmNumero(metas.gordura),
    refeicoes: refeicoes.map((r) => ({
      nome: r.nome.trim(),
      horarioSugerido: r.horario || undefined,
      itens: r.itens.map((i) => ({
        alimentoId: i.alimento.id,
        quantidadeG: quantidadeEmGramas(i.quantidadeG) ?? 0,
      })),
    })),
  };
}

/**
 * Espelha `macros.ts` do servidor.
 *
 * A tabela guarda tudo por 100 g, então prescrever 150 g é regra de três. O
 * total gravado é sempre recalculado no servidor — este aqui existe para o
 * número mudar enquanto o nutricionista digita, sem ida e volta a cada tecla.
 */
export function macrosDaPorcao(alimento: AlimentoResumo, gramas: number): Macros {
  const f = gramas / 100;
  const r = (v: number) => Math.round(v * f * 100) / 100;
  return {
    kcal: r(alimento.porcao100g.kcal),
    proteinaG: r(alimento.porcao100g.proteinaG),
    carboidratoG: r(alimento.porcao100g.carboidratoG),
    gorduraG: r(alimento.porcao100g.gorduraG),
    fibraG: r(alimento.porcao100g.fibraG),
  };
}

export function somar(lista: Macros[]): Macros {
  const t = lista.reduce(
    (s, m) => ({
      kcal: s.kcal + m.kcal,
      proteinaG: s.proteinaG + m.proteinaG,
      carboidratoG: s.carboidratoG + m.carboidratoG,
      gorduraG: s.gorduraG + m.gorduraG,
      fibraG: s.fibraG + m.fibraG,
    }),
    { kcal: 0, proteinaG: 0, carboidratoG: 0, gorduraG: 0, fibraG: 0 },
  );
  const r = (v: number) => Math.round(v * 100) / 100;
  return {
    kcal: r(t.kcal),
    proteinaG: r(t.proteinaG),
    carboidratoG: r(t.carboidratoG),
    gorduraG: r(t.gorduraG),
    fibraG: r(t.fibraG),
  };
}

/** Macros de uma refeição a partir do texto dos campos. Campo ilegível conta zero. */
export function macrosDaRefeicao(refeicao: RefeicaoNaTela): Macros {
  return somar(
    refeicao.itens.map((i) => macrosDaPorcao(i.alimento, quantidadeEmGramas(i.quantidadeG) ?? 0)),
  );
}

/** Verde dentro de ±5% da meta, laranja fora. Sem meta, neutro. */
export function corDaMeta(atual: number, alvo: number | null): string {
  if (!alvo) return 'var(--vv-texto-secundario)';
  const desvio = Math.abs(atual - alvo) / alvo;
  return desvio <= 0.05 ? 'var(--vv-sucesso)' : 'var(--vv-alerta)';
}
