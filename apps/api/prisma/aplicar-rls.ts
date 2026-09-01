import { PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Aplica os arquivos de `prisma/rls/` no banco, em ordem.
 *
 *   SUPABASE_DIRECT_URL=... pnpm --filter @vivio/api exec tsx prisma/aplicar-rls.ts
 *
 * O divisor existe porque o driver não aceita várias instruções numa chamada, e
 * já errou duas vezes por olhar LINHA em vez de ler o texto:
 *
 * 1. Descartava toda linha começando com `--`. Como os `enable row level
 *    security` vinham logo depois de um comentário, foram engolidos junto: as
 *    políticas existiam e não valiam, e o teste acusou "vazamento" que era só
 *    ausência de aplicação.
 * 2. Alternava "dentro do corpo" em `linha.includes('$$')`. Uma linha com DOIS
 *    `$$` alternava uma vez, e `$funcao$` não era reconhecido de jeito nenhum.
 *
 * Agora é um leitor de caracteres com estado, que é o que o problema sempre foi:
 * comentário, texto entre aspas e corpo entre cifrões só significam alguma coisa
 * em relação ao que veio antes deles.
 */
export function comandos(sql: string): string[] {
  const partes: string[] = [];
  let atual = '';
  let i = 0;

  const adiantar = (ate: string): void => {
    const fim = sql.indexOf(ate, i);
    i = fim === -1 ? sql.length : fim + ate.length;
  };

  while (i < sql.length) {
    const resto = sql.slice(i);

    // Comentário some do comando: o Postgres não precisa dele, e ele já
    // confundiu o divisor uma vez. Só some FORA de texto e de corpo — o que é
    // possível agora, e não era quando isto era um `replace` no arquivo todo.
    if (resto.startsWith('--')) {
      adiantar('\n');
      atual += ' ';
      continue;
    }
    if (resto.startsWith('/*')) {
      // Bloco aninha em Postgres, ao contrário de quase toda outra linguagem.
      let nivel = 1;
      i += 2;
      while (i < sql.length && nivel > 0) {
        if (sql.startsWith('/*', i)) {
          nivel += 1;
          i += 2;
        } else if (sql.startsWith('*/', i)) {
          nivel -= 1;
          i += 2;
        } else {
          i += 1;
        }
      }
      atual += ' ';
      continue;
    }

    // Texto entre aspas simples, com '' como aspa escapada.
    if (resto.startsWith("'")) {
      const inicio = i;
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") {
          i += 1;
          break;
        } else i += 1;
      }
      atual += sql.slice(inicio, i);
      continue;
    }

    // Corpo entre cifrões: $$ ou $qualquernome$. É aqui que vive o `;` que NÃO
    // termina comando, e é por isso que este bloco existe.
    const etiqueta = /^\$[A-Za-z_][A-Za-z_0-9]*\$|^\$\$/.exec(resto);
    if (etiqueta) {
      const marca = etiqueta[0];
      const fim = sql.indexOf(marca, i + marca.length);
      const ate = fim === -1 ? sql.length : fim + marca.length;
      atual += sql.slice(i, ate);
      i = ate;
      continue;
    }

    if (sql[i] === ';') {
      const c = atual.trim();
      if (c) partes.push(c);
      atual = '';
      i += 1;
      continue;
    }

    atual += sql[i];
    i += 1;
  }

  const ultimo = atual.trim();
  if (ultimo) partes.push(ultimo);
  return partes;
}

async function principal(): Promise<void> {
  const url = process.env.SUPABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Falta SUPABASE_DIRECT_URL no ambiente.');
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const pasta = join(__dirname, 'rls');
    for (const arquivo of readdirSync(pasta).filter((a) => a.endsWith('.sql')).sort()) {
      const lista = comandos(readFileSync(join(pasta, arquivo), 'utf8'));
      for (const c of lista) await prisma.$executeRawUnsafe(c);
      console.log(`${arquivo}: ${lista.length} comandos`);
    }
    const n = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `select count(*)::bigint n from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
       where ns.nspname='public' and c.relkind='r' and c.relrowsecurity`);
    console.log(`\ntabelas com RLS ligado: ${n[0]!.n}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) void principal();
