import type { Prisma } from '@prisma/client';
import {
  macrosDaPorcao as calcularPorcao,
  quantidadeEquivalentePorKcal,
  somarMacros,
  type Macros,
} from '@vivio/contracts';

/**
 * A ponte entre o `Decimal` do Prisma e a conta nutricional.
 *
 * A conta em si mora em `@vivio/contracts` desde que o SDK passou a montar a
 * mesma dieta falando direto com o Postgres — duas versões do arredondamento
 * dariam dois totais para o mesmo cardápio, e o critério de aceite da nutrição
 * é justamente o total bater com a soma dos itens.
 *
 * O que sobra aqui é a conversão: um `Decimal` que escapasse até a conta
 * viraria concatenação em vez de soma.
 */

export interface ComposicaoPor100g {
  kcal: Prisma.Decimal | number;
  proteinaG: Prisma.Decimal | number;
  carboidratoG: Prisma.Decimal | number;
  gorduraG: Prisma.Decimal | number;
  fibraG: Prisma.Decimal | number | null;
}

const num = (v: Prisma.Decimal | number | null): number => (v === null ? 0 : Number(v));

export function macrosDaPorcao(
  alimento: ComposicaoPor100g,
  quantidadeG: Prisma.Decimal | number,
): Macros {
  return calcularPorcao(
    {
      kcal: num(alimento.kcal),
      proteinaG: num(alimento.proteinaG),
      carboidratoG: num(alimento.carboidratoG),
      gorduraG: num(alimento.gorduraG),
      fibraG: num(alimento.fibraG),
    },
    num(quantidadeG),
  );
}

export { quantidadeEquivalentePorKcal, somarMacros };
