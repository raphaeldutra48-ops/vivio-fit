import { z } from 'zod';

/**
 * Seções de mercado. O aluno percorre o supermercado por corredor, não por
 * macronutriente — agrupar por grupo alimentar faria ele voltar no hortifruti
 * três vezes.
 */
export const SECOES_MERCADO = [
  'Açougue, peixaria e ovos',
  'Hortifruti',
  'Laticínios e frios',
  'Mercearia',
  'Outros',
] as const;
export type SecaoMercado = (typeof SECOES_MERCADO)[number];

export const SECAO_POR_GRUPO: Record<string, SecaoMercado> = {
  PROTEINA: 'Açougue, peixaria e ovos',
  VEGETAL: 'Hortifruti',
  FRUTA: 'Hortifruti',
  LATICINIO: 'Laticínios e frios',
  CARBOIDRATO: 'Mercearia',
  LEGUMINOSA: 'Mercearia',
  GORDURA: 'Mercearia',
};

export const listaDeComprasSchema = z.object({
  /** Por quantos dias o plano deve render. */
  dias: z.coerce.number().int().min(1).max(60).default(7),
});
export type ListaDeComprasQuery = z.infer<typeof listaDeComprasSchema>;

export interface ItemDeCompra {
  alimentoId: string;
  nome: string;
  /** Total em gramas para o período. */
  quantidadeTotalG: number;
  /** Já formatado: "1,05 kg" ou "350 g". */
  quantidadeFormatada: string;
  /** Ex.: "≈ 7 unidades" quando o alimento tem medida caseira. */
  equivalencia: string | null;
  /** Em quais refeições ele aparece — ajuda a conferir o que é. */
  aparecEm: string[];
}

export interface SecaoDaLista {
  secao: SecaoMercado;
  itens: ItemDeCompra[];
}

export interface ListaDeCompras {
  planoNome: string;
  dias: number;
  totalItens: number;
  secoes: SecaoDaLista[];
  geradaEm: string;
}

/** Acima de 1 kg o número em gramas deixa de ser legível na gôndola. */
export function formatarQuantidade(gramas: number): string {
  if (gramas >= 1000) {
    return `${(gramas / 1000).toFixed(2).replace('.', ',')} kg`;
  }
  return `${Math.round(gramas)} g`;
}

/**
 * A lista de compras, derivada do plano alimentar ativo.
 *
 * **Não existe tabela de lista.** Ela é sempre calculada do plano no momento em
 * que é pedida: guardar uma cópia significaria manter duas verdades, e a lista
 * ficaria desatualizada assim que o nutricionista ajustasse a dieta — o aluno
 * iria ao mercado comprar o que já não está prescrito.
 *
 * Vive aqui, e não em quem consulta, porque são dois consumidores lendo o mesmo
 * plano — a API e o SDK sobre o Postgres — e duas somas do mesmo cardápio
 * dariam duas listas.
 */
export function montarListaDeCompras(
  plano: {
    nome: string;
    refeicoes: {
      nome: string;
      itens: {
        quantidadeG: number;
        alimento: {
          id: string;
          nome: string;
          grupo: string;
          medidaCaseira: string | null;
          medidaGramas: number | null;
        };
      }[];
    }[];
  },
  dias: number,
  agora: Date = new Date(),
): ListaDeCompras {
  /** alimentoId → acumulado. O mesmo alimento em duas refeições vira uma linha. */
  const acumulado = new Map<
    string,
    {
      nome: string;
      grupo: string;
      medidaCaseira: string | null;
      medidaGramas: number | null;
      gramasPorDia: number;
      refeicoes: Set<string>;
    }
  >();

  for (const refeicao of plano.refeicoes) {
    for (const item of refeicao.itens) {
      const atual = acumulado.get(item.alimento.id) ?? {
        nome: item.alimento.nome,
        grupo: item.alimento.grupo,
        medidaCaseira: item.alimento.medidaCaseira,
        medidaGramas: item.alimento.medidaGramas,
        gramasPorDia: 0,
        refeicoes: new Set<string>(),
      };
      atual.gramasPorDia += item.quantidadeG;
      atual.refeicoes.add(refeicao.nome);
      acumulado.set(item.alimento.id, atual);
    }
  }

  const porSecao = new Map<SecaoMercado, ItemDeCompra[]>();

  for (const [alimentoId, dados] of acumulado) {
    const total = dados.gramasPorDia * dias;
    const secao = SECAO_POR_GRUPO[dados.grupo] ?? 'Outros';

    /*
      "≈ 14 unidades" é mais útil na gôndola que "700 g de ovo".

      A medida caseira já vem com uma contagem embutida ("2 unidades" = 100 g,
      "4 colheres de sopa" = 100 g). Ignorar esse número daria 7 unidades para
      700 g de ovo, quando são 14 — por isso ele multiplica, não é descartado.
    */
    let equivalencia: string | null = null;
    if (dados.medidaGramas && dados.medidaGramas > 0 && dados.medidaCaseira) {
      const porMedida = Number(/^(\d+)/.exec(dados.medidaCaseira)?.[1] ?? 1);
      const unidade = dados.medidaCaseira.replace(/^\d+\s*/, '');
      const quantas = (total / dados.medidaGramas) * porMedida;
      equivalencia = `≈ ${Math.ceil(quantas)} ${unidade}`;
    }

    const lista = porSecao.get(secao) ?? [];
    lista.push({
      alimentoId,
      nome: dados.nome,
      quantidadeTotalG: Math.round(total * 100) / 100,
      quantidadeFormatada: formatarQuantidade(total),
      equivalencia,
      aparecEm: [...dados.refeicoes],
    });
    porSecao.set(secao, lista);
  }

  // Ordem fixa das seções: é o caminho do supermercado, não o alfabeto.
  const secoes: SecaoDaLista[] = SECOES_MERCADO.filter((s) => porSecao.has(s)).map((secao) => ({
    secao,
    itens: (porSecao.get(secao) ?? []).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  }));

  return {
    planoNome: plano.nome,
    dias,
    totalItens: acumulado.size,
    secoes,
    geradaEm: agora.toISOString(),
  };
}
