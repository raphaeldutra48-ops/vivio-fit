import type { Prisma } from '@prisma/client';
import { MACROS_ZERADOS, type Macros } from '@vivio/contracts';

/**
 * Todo o cálculo nutricional do app passa por aqui.
 *
 * A tabela guarda os valores por 100 g, então prescrever 150 g de frango é uma
 * regra de três. Centralizar isso num lugar só é o que faz o total da dieta
 * bater com a soma dos itens — que é o critério de aceite da Fase 2.
 */

export interface ComposicaoPor100g {
  kcal: Prisma.Decimal | number;
  proteinaG: Prisma.Decimal | number;
  carboidratoG: Prisma.Decimal | number;
  gorduraG: Prisma.Decimal | number;
  fibraG: Prisma.Decimal | number | null;
}

const num = (v: Prisma.Decimal | number | null): number => (v === null ? 0 : Number(v));

/** Arredonda para 2 casas, evitando o acúmulo de erro de ponto flutuante. */
const arredondar = (v: number): number => Math.round(v * 100) / 100;

export function macrosDaPorcao(
  alimento: ComposicaoPor100g,
  quantidadeG: Prisma.Decimal | number,
): Macros {
  const fator = num(quantidadeG) / 100;
  return {
    kcal: arredondar(num(alimento.kcal) * fator),
    proteinaG: arredondar(num(alimento.proteinaG) * fator),
    carboidratoG: arredondar(num(alimento.carboidratoG) * fator),
    gorduraG: arredondar(num(alimento.gorduraG) * fator),
    fibraG: arredondar(num(alimento.fibraG) * fator),
  };
}

export function somarMacros(lista: Macros[]): Macros {
  const total = lista.reduce(
    (soma, m) => ({
      kcal: soma.kcal + m.kcal,
      proteinaG: soma.proteinaG + m.proteinaG,
      carboidratoG: soma.carboidratoG + m.carboidratoG,
      gorduraG: soma.gorduraG + m.gorduraG,
      fibraG: soma.fibraG + m.fibraG,
    }),
    { ...MACROS_ZERADOS },
  );

  return {
    kcal: arredondar(total.kcal),
    proteinaG: arredondar(total.proteinaG),
    carboidratoG: arredondar(total.carboidratoG),
    gorduraG: arredondar(total.gorduraG),
    fibraG: arredondar(total.fibraG),
  };
}

/**
 * Quantidade do substituto que entrega as mesmas calorias do item original.
 * Alimento sem caloria (água, chá) não tem equivalente calórico.
 */
export function quantidadeEquivalentePorKcal(
  kcalAlvo: number,
  kcalPor100gDoSubstituto: number,
): number | null {
  if (kcalPor100gDoSubstituto <= 0) return null;
  return arredondar((kcalAlvo / kcalPor100gDoSubstituto) * 100);
}
