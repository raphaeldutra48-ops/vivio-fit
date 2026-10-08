import { describe, expect, it } from 'vitest';
import {
  ZodArray,
  ZodDefault,
  ZodEffects,
  ZodNullable,
  ZodObject,
  ZodOptional,
  ZodString,
  type ZodTypeAny,
} from 'zod';
import { z } from 'zod';
import * as contratos from './index';

/**
 * Uma prova sobre TODOS os schemas, e não sobre um deles.
 *
 * ## Por que existe
 *
 * O projeto já tinha `LIMITES_DE_TEXTO` e o hábito de pôr `.max()` em campo de
 * texto. Mesmo assim, um inventário de 02/10 encontrou **17 campos de texto sem
 * teto nenhum** entre os 166 existentes — e eles não tinham nada em comum além
 * de ninguém ter olhado: a senha (que o bcrypt trunca em 72 em silêncio), a
 * chave do arquivo no armazenamento, os cursores de paginação, as datas dos
 * filtros, cada especialidade de um profissional e **tudo que a leitura
 * automática de dieta devolve** — que é saída de modelo de linguagem, onde não
 * existe usuário para reclamar que o campo não aceitou.
 *
 * Corrigir os 17 resolve os 17. O que impede o 18º é esta prova: ela falha
 * quando um schema novo aparece com texto ou lista sem limite, e falha ANTES de
 * o campo existir numa tela.
 *
 * ## O que conta como teto, e o erro que esta lista já cometeu
 *
 * A primeira versão aceitava `.regex()` como teto, com o raciocínio de que forma
 * limitada é tamanho limitado. **Está errado**, e a mutação provou: tirei o
 * `.max(72)` da senha e a prova continuou verde, porque `senhaSchema` tem
 * `.regex(/[0-9]/)` — que não limita nada. `.email()` tem o mesmo problema: o
 * formato de e-mail do zod não tem tamanho máximo.
 *
 * Então contam só os que REALMENTE limitam o tamanho: `.max()`, `.length()` e os
 * formatos de comprimento fixo (`uuid`, `cuid`, `cuid2`, `ulid`, `datetime`,
 * `date`, `time`, `ip`). Um `.min()` sozinho não conta — ele defende do vazio,
 * que é o problema oposto. Um `.regex()` tampouco, mesmo quando por acaso
 * limita: prova que depende de interpretar expressão regular é prova que vai
 * errar na próxima.
 *
 * ## A lista de dispensados
 *
 * Fica vazia de propósito. Se um dia um campo precisar entrar nela, que entre
 * com o motivo escrito — e que o motivo seja melhor que "é nosso, confio".
 * Schema não existe para confiar em quem chama; existe para o caso de não dar.
 */
const DISPENSADOS: readonly string[] = [];

/** Tira `optional`, `nullable`, `default` e `transform` até achar o tipo real. */
function desembrulhar(tipo: ZodTypeAny): ZodTypeAny {
  let atual: ZodTypeAny = tipo;
  // Oito voltas cobrem qualquer combinação que apareça aqui sem risco de laço.
  for (let i = 0; i < 8; i++) {
    const def = (atual as unknown as { _def: Record<string, unknown> })._def;
    if (atual instanceof ZodOptional || atual instanceof ZodNullable || atual instanceof ZodDefault) {
      atual = def.innerType as ZodTypeAny;
    } else if (atual instanceof ZodEffects) {
      atual = def.schema as ZodTypeAny;
    } else {
      break;
    }
  }
  return atual;
}

const FORMAS_QUE_LIMITAM = [
  'max',
  'length',
  // Formatos de comprimento fixo ou quase: um uuid tem 36 caracteres e um
  // instante ISO não passa de 30. Nenhum deles deixa passar texto livre.
  'uuid',
  'cuid',
  'cuid2',
  'ulid',
  'datetime',
  'date',
  'time',
  'ip',
];

function textoTemTeto(t: ZodString): boolean {
  const checks = (t as unknown as { _def: { checks?: { kind: string }[] } })._def.checks ?? [];
  return checks.some((c) => FORMAS_QUE_LIMITAM.includes(c.kind));
}

function listaTemTeto(a: ZodArray<ZodTypeAny>): boolean {
  const def = (a as unknown as { _def: { maxLength: unknown; exactLength: unknown } })._def;
  return def.maxLength !== null || def.exactLength !== null;
}

interface Achado {
  onde: string;
  oque: string;
}

/**
 * Percorre UM schema. É o mesmo caminho que a varredura do repositório usa — e
 * é por isso que as amostras provam a varredura, e não um atalho parecido.
 */
function varrerUm(nome: string, schema: ZodTypeAny): Achado[] {
  return percorrer([[nome, schema]]).achados;
}

/** Percorre todo schema de objeto exportado, inclusive dentro de listas. */
function varrer(): { achados: Achado[]; textos: number; listas: number } {
  return percorrer(
    Object.entries(contratos).filter(([, v]) => v instanceof ZodObject) as [string, ZodTypeAny][],
  );
}

function percorrer(
  raizes: [string, ZodTypeAny][],
): { achados: Achado[]; textos: number; listas: number } {
  const achados: Achado[] = [];
  let textos = 0;
  let listas = 0;
  const vistos = new Set<ZodTypeAny>();

  const olhar = (nome: string, tipo: ZodTypeAny): void => {
    const real = desembrulhar(tipo);
    if (vistos.has(real)) return;

    if (real instanceof ZodString) {
      textos++;
      if (!textoTemTeto(real)) achados.push({ onde: nome, oque: 'texto sem teto' });
      return;
    }

    if (real instanceof ZodArray) {
      listas++;
      if (!listaTemTeto(real as ZodArray<ZodTypeAny>)) {
        achados.push({ onde: nome, oque: 'lista sem teto' });
      }
      olhar(`${nome}[]`, (real as unknown as { _def: { type: ZodTypeAny } })._def.type);
      return;
    }

    if (real instanceof ZodObject) {
      vistos.add(real);
      const forma = real.shape as Record<string, ZodTypeAny>;
      for (const [campo, tipoDoCampo] of Object.entries(forma)) {
        olhar(`${nome}.${campo}`, tipoDoCampo);
      }
    }
  };

  for (const [nome, valor] of raizes) olhar(nome, valor);
  return { achados, textos, listas };
}

/*
  Amostras para a verificação se provar, antes de olhar o repositório.

  Conferir o repositório NÃO serve de autoteste: o resultado esperado ali é
  "nada encontrado", que é também o resultado de uma verificação quebrada. Foi
  exatamente o que aconteceu com a regra de mapa parcial de rótulo, cuja
  expressão ganhou um byte de controle invisível e passou a aprovar tudo — e com
  a primeira versão DESTA regra, que aceitava `.regex()` como teto.

  Então: um schema que tem de reprovar e um que tem de passar.
*/
export const SCHEMA_RUIM = z.object({
  textoSolto: z.string(),
  listaSolta: z.array(z.string().max(10)),
});

export const SCHEMA_BOM = z.object({
  textoComTeto: z.string().max(120),
  identificador: z.string().cuid(),
  listaComTeto: z.array(z.string().max(10)).max(5),
  numero: z.number().int(),
});

describe('a verificação sabe o que procura', () => {
  it('reprova texto sem teto e lista sem teto', () => {
    const achados = varrerUm('ruim', SCHEMA_RUIM);
    expect(achados.map((a) => a.onde)).toEqual(['ruim.textoSolto', 'ruim.listaSolta']);
  });

  it('aprova o que tem teto — inclusive o formato de comprimento fixo', () => {
    expect(varrerUm('bom', SCHEMA_BOM)).toEqual([]);
  });

  it('`.regex()` sozinho NÃO conta como teto', () => {
    // O erro que a mutação pegou: `senhaSchema` tem `.regex(/[0-9]/)`, que não
    // limita nada, e por isso a prova aprovava a senha sem `.max()`.
    const comRegex = z.object({ senha: z.string().min(8).regex(/[0-9]/) });
    expect(varrerUm('auth', comRegex).map((a) => a.onde)).toEqual(['auth.senha']);
  });
});

describe('todo campo de entrada tem teto', () => {
  const { achados, textos, listas } = varrer();

  it('a varredura realmente alcança os schemas — senão ela aprova o vazio', () => {
    /*
      O segundo autoteste: os números confirmam que ela olhou o repositório, e
      não só as amostras acima. Um caminho errado na introspecção faria `achados`
      vir vazio e tudo parecer certo.
    */
    expect(textos).toBeGreaterThan(150);
    expect(listas).toBeGreaterThan(20);
  });

  it('nenhum texto e nenhuma lista sem limite', () => {
    const faltando = achados
      .filter((a) => !DISPENSADOS.includes(a.onde))
      .map((a) => `${a.onde} (${a.oque})`);

    expect(faltando, `campos sem teto:\n  ${faltando.join('\n  ')}`).toEqual([]);
  });

  it('a lista de dispensados não cresce sem alguém decidir', () => {
    // Se esta prova falhar, é porque alguém dispensou um campo: que explique no
    // comentário acima por quê, e aí atualize o número.
    expect(DISPENSADOS).toHaveLength(0);
  });
});
