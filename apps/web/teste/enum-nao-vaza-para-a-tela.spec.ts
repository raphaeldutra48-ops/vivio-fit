import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Nenhuma tela traduz enum com mapa PARCIAL.
 *
 * ## O defeito que esta regra fecha
 *
 * Em 02/10 duas telas mostraram o enum cru a quem usa o app: a equipe de cuidado
 * escreveu `MEDICO` — sem acento — sobre o nome de quem atende, e a tela de fotos
 * escreveu `LADO_DIREITO`, em caixa alta e com sublinhado, no cartão de uma foto
 * do corpo da pessoa. Nos dois casos a tabela de rótulos existia; nos dois casos
 * ela era parcial ou estava em outro arquivo.
 *
 * `Partial<Record<Enum, string>>` é o que torna isso possível sem erro nenhum:
 * valor novo no enum não exige rótulo, o acesso devolve `undefined`, e o
 * `?? valor` que vem depois escreve o enum. Com `Record<Enum, string>` total, o
 * TypeScript recusa compilar — e é melhor reprovar o build que mostrar
 * `LEITURA_AUTOMATICA` para alguém.
 *
 * ## O que NÃO é proibido, e como a regra sabe a diferença
 *
 * A primeira versão desta prova reprovou `ValoresDigitados`, em
 * `apps/web/lib/exames.ts` — e estava errada. Aquilo é
 * `type ValoresDigitados = Partial<Record<Marcador, string>>`: o RASCUNHO do
 * formulário de exame, onde o profissional digitou alguns marcadores e não
 * outros. Parcial ali é a verdade; exigir total seria exigir que ele preencha os
 * vinte.
 *
 * A diferença não está no tipo, está em ser declaração de VALOR ou de FORMA. Um
 * `const` de `Partial<Record<Enum, string>>` é uma tabela de tradução com
 * buracos — é dela que o enum escapa. Um `type` é o formato de um dado que
 * legitimamente vem incompleto. A regra só olha `const` e `let`.
 *
 * ## Por que a regra testa a si mesma, e não só o repositório
 *
 * Porque a primeira versão desta prova **passou com o defeito presente**. A
 * expressão regular tinha ganhado um byte de controle invisível no lugar de um
 * escape (`\b` virou 0x08), e por isso não casava com nada — a varredura
 * aprovava o repositório inteiro sem olhar. Foi a terceira vez nesta auditoria
 * que uma verificação minha falhou assim: a do auditor de RLS, a do teto de
 * campos, e esta.
 *
 * A conclusão virou regra: **varredura de fonte carrega amostra boa e amostra
 * ruim**. Se a expressão parar de casar, quem falha é a prova — e falha antes de
 * aprovar coisa errada. Conferir o repositório não serve de autoteste: o
 * resultado esperado ali é "nada encontrado", que é também o resultado de uma
 * verificação quebrada.
 */
const RAIZ = fileURLToPath(new URL('../../..', import.meta.url));

const ONDE_OLHAR = [
  join('apps', 'web', 'app'),
  join('apps', 'web', 'components'),
  join('apps', 'web', 'lib'),
  join('apps', 'mobile', 'app'),
  join('apps', 'mobile', 'src'),
];

/**
 * Tabela de tradução parcial: um `const`/`let` de `Partial<Record<X, string>>`.
 *
 * O `const` no padrão é o que separa a tabela de rótulos (proibida) do formato de
 * um dado que vem incompleto (permitido).
 */
const MAPA_PARCIAL_DE_TEXTO =
  /(?:const|let)\s+\w+\s*:\s*Partial<\s*Record<\s*[^,>]+,\s*string\s*>\s*>/;

/** O que a regra TEM de pegar. Foi assim que `MEDICO` chegou à tela. */
const AMOSTRA_RUIM = [
  "const NOME_DO_ESCOPO: Partial<Record<EscopoDado, string>> = {\n  TREINO: 'Treino',\n};",
  'let rotulo: Partial<Record<Papel, string>> = {};',
  'const R : Partial< Record< AnguloFoto , string > > = {};',
];

/** O que a regra NÃO pode pegar — nenhum destes é tabela de rótulo. */
const AMOSTRA_BOA = [
  'export type ValoresDigitados = Partial<Record<Marcador, string>>;',
  'const ROTULO_PAPEL: Record<Papel, string> = {};',
  'const dobras: Partial<Record<Dobra, number>> = {};',
  'interface Avaliacao { dobras: Partial<Record<Dobra, number>> | null }',
];

function arquivosDe(dir: string): string[] {
  const achados: string[] = [];
  const andar = (atual: string): void => {
    for (const nome of readdirSync(atual)) {
      const caminho = join(atual, nome);
      if (statSync(caminho).isDirectory()) {
        andar(caminho);
        continue;
      }
      if (!/\.tsx?$/.test(nome)) continue;
      // Teste pode usar o que quiser: ele não desenha tela para ninguém.
      if (/\.(test|spec)\.tsx?$/.test(nome)) continue;
      achados.push(caminho);
    }
  };
  andar(dir);
  return achados;
}

describe('a regra sabe o que procura', () => {
  it.each(AMOSTRA_RUIM)('pega o mapa parcial de rótulo: %s', (amostra) => {
    expect(MAPA_PARCIAL_DE_TEXTO.test(amostra)).toBe(true);
  });

  it.each(AMOSTRA_BOA)('não pega o que é legítimo: %s', (amostra) => {
    expect(MAPA_PARCIAL_DE_TEXTO.test(amostra)).toBe(false);
  });

  it('a expressão não tem caractere de controle escondido', () => {
    /*
      O defeito exato que deixou a primeira versão desta prova cega: o `\b` do
      padrão virou o byte 0x08 ao passar por uma ferramenta de edição, e a
      expressão passou a exigir um backspace literal antes de `const`.
      Invisível na tela, e fatal: a varredura aprovava tudo.
    */
    expect(MAPA_PARCIAL_DE_TEXTO.source).not.toMatch(/[\u0000-\u001f]/);
  });
});

describe('enum não vaza para a tela', () => {
  const arquivos = ONDE_OLHAR.flatMap((d) => arquivosDe(join(RAIZ, d)));

  it('a varredura alcança os dois aplicativos — senão ela aprova o vazio', () => {
    const daWeb = arquivos.filter((f) => f.includes(join('apps', 'web')));
    const doApp = arquivos.filter((f) => f.includes(join('apps', 'mobile')));
    expect(daWeb.length).toBeGreaterThan(40);
    expect(doApp.length).toBeGreaterThan(20);
  });

  it('nenhum mapa de rótulo é parcial', () => {
    const culpados = arquivos
      .filter((f) => MAPA_PARCIAL_DE_TEXTO.test(readFileSync(f, 'utf8')))
      .map((f) => relative(RAIZ, f).replace(/\\/g, '/'));

    expect(
      culpados,
      'mapa de rótulo parcial deixa o enum chegar à tela quando falta um valor.\n' +
        'Use `Record<Enum, string>` TOTAL, de preferência em `@vivio/contracts`:\n  ' +
        culpados.join('\n  '),
    ).toEqual([]);
  });
});
