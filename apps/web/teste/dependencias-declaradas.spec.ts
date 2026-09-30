import { readFileSync, readdirSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Pendência 7, virada em teste: ninguém importa o que não declarou.
 *
 * O workspace usa `nodeLinker: hoisted` porque o Metro do Expo não lida bem com
 * symlinks. O preço é perder o isolamento do pnpm: todo pacote passa a ENCONTRAR
 * qualquer dependência de qualquer outro, mesmo sem declará-la. Funciona na
 * máquina de quem instalou tudo, e quebra onde a árvore é montada do zero — o CI,
 * um `pnpm install --frozen-lockfile` limpo, o build de produção.
 *
 * Não é hipótese. Em 29/09 custou duas rodadas vermelhas de CI: um teste do
 * aplicativo importava `@vivio/ui` (pacote da WEB) e passava localmente; e
 * `@testing-library/user-event`, usado sem ser declarado, sumiu quando a árvore
 * foi remontada. Nos dois casos a mensagem não dizia nada sobre a causa.
 *
 * A regra é simples e aqui ela falha na hora, com o nome do pacote e do arquivo:
 * **se o código importa, o `package.json` declara.**
 */

/*
  `fileURLToPath`, e não `new URL(...).pathname`: o caminho deste projeto tem
  espaço no nome ("CLAUDE CODE"), e o `pathname` de uma URL vem com `%20` —
  a primeira versão deste arquivo morreu com sete `ENOENT` por isso.
*/
const RAIZ = fileURLToPath(new URL('../../..', import.meta.url));

const PACOTES = [
  'apps/web',
  'apps/mobile',
  'packages/contracts',
  'packages/sdk',
  'packages/ui',
  'packages/ui-native',
  'packages/banco',
] as const;

/** Pastas que não são código do pacote. */
const IGNORAR = new Set(['node_modules', 'dist', '.next', '.expo', 'build', 'coverage']);

const EXTENSOES = ['.ts', '.tsx', '.mts', '.cts'];

/*
  O que pode ser importado sem estar no `package.json` do pacote.

  Cada linha é uma decisão, não uma exceção de conveniência:

  - `expo/*` e `react-native/*`: submódulos do próprio Expo, que já é declarado
    pelo nome curto (`expo`, `react-native`) — a lista de imports vê o caminho
    completo, e cortar no primeiro segmento já resolve isso para escopos normais.
  - `virtual:*` e `vite/*`: identificadores que o bundler resolve, e que não
    existem como pacote instalável.
*/
const PERMITIDOS = new Set(['virtual:pwa-register', 'vite']);

const ehRelativo = (id: string) => id.startsWith('.') || id.startsWith('/');

/** `@escopo/pacote/sub/caminho` → `@escopo/pacote`; `pacote/sub` → `pacote`. */
function nomeDoPacote(id: string): string {
  const partes = id.split('/');
  return id.startsWith('@') ? partes.slice(0, 2).join('/') : partes[0]!;
}

function arquivosDe(dir: string): string[] {
  const achados: string[] = [];
  for (const nome of readdirSync(dir)) {
    if (IGNORAR.has(nome)) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) achados.push(...arquivosDe(caminho));
    else if (EXTENSOES.some((e) => nome.endsWith(e))) achados.push(caminho);
  }
  return achados;
}

/*
  Regex e não um parser de verdade: o que se procura é o especificador de módulo,
  que tem forma fixa. `import ... from 'x'`, `import 'x'`, `export ... from 'x'`,
  `require('x')` e `import('x')` cobrem tudo o que existe nestes pacotes, e um
  falso positivo aqui vira uma dependência declarada a mais — barato.
*/
const IMPORTS = [
  /(?:^|\n)\s*import\s[^;'"]*from\s*['"]([^'"]+)['"]/g,
  /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
  /(?:^|\n)\s*export\s[^;'"]*from\s*['"]([^'"]+)['"]/g,
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/**
 * O arquivo sem comentários.
 *
 * Necessário porque este projeto documenta com exemplos de código dentro de
 * comentários — inclusive este arquivo, cuja primeira versão se acusou sozinha
 * pedindo um pacote chamado `x`. Tira comentário de bloco e linha que comece
 * com duas barras ou asterisco; não mexe em endereço dentro de string, que é onde
 * um corte ingênuo estragaria o código.
 */
function semComentarios(conteudo: string): string {
  const semBloco = conteudo.replace(/\/\*[\s\S]*?\*\//g, '');
  return semBloco
    .split('\n')
    .filter((linha) => {
      const limpa = linha.trimStart();
      return !limpa.startsWith('//') && !limpa.startsWith('*');
    })
    .join('\n');
}

function importadosEm(arquivo: string): string[] {
  const conteudo = semComentarios(readFileSync(arquivo, 'utf8'));
  const ids = new Set<string>();
  for (const padrao of IMPORTS) {
    for (const achado of conteudo.matchAll(padrao)) {
      const id = achado[1]!;
      if (!ehRelativo(id)) ids.add(id);
    }
  }
  return [...ids];
}

function declaradasEm(pacote: string): Set<string> {
  const json = JSON.parse(readFileSync(join(RAIZ, pacote, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  return new Set([
    ...Object.keys(json.dependencies ?? {}),
    ...Object.keys(json.devDependencies ?? {}),
    ...Object.keys(json.peerDependencies ?? {}),
  ]);
}

const nativos = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

describe('todo import vem de uma dependência declarada', () => {
  for (const pacote of PACOTES) {
    it(pacote, () => {
      const declaradas = declaradasEm(pacote);
      const faltando: string[] = [];

      for (const arquivo of arquivosDe(join(RAIZ, pacote))) {
        for (const id of importadosEm(arquivo)) {
          if (nativos.has(id) || PERMITIDOS.has(id)) continue;
          const nome = nomeDoPacote(id);
          if (nativos.has(nome) || PERMITIDOS.has(nome) || declaradas.has(nome)) continue;
          faltando.push(`${nome} — em ${relative(RAIZ, arquivo).replace(/\\/g, '/')}`);
        }
      }

      /*
        A mensagem lista pacote e arquivo porque o conserto é sempre o mesmo e
        precisa ser óbvio: ou declara no `package.json` do pacote, ou para de
        importar de lá.
      */
      expect([...new Set(faltando)].sort()).toEqual([]);
    });
  }
});
