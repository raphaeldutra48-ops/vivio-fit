import { PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Confere que toda coluna citada nas políticas existe mesmo.
 *
 *   pnpm --filter @vivio/api exec tsx prisma/conferir-rls.ts
 *
 * Existe porque escrever política é escrever SQL sem compilador: um nome de
 * coluna errado só aparece na hora de aplicar, uma falha por vez. Três nomes
 * foram supostos errado num arquivo só — `planoId` onde era `planoDietaId`,
 * `criadoPorId` onde era `profissionalId`, `usuarioId` onde era `userId`.
 */
async function principal(): Promise<void> {
  const prisma = new PrismaClient({
    datasourceUrl: process.env.SUPABASE_DIRECT_URL ?? process.env.DATABASE_URL,
  });
  try {
    const colunas = await prisma.$queryRawUnsafe<{ tabela: string; coluna: string }[]>(
      `select table_name tabela, column_name coluna from information_schema.columns
       where table_schema='public'`);
    const existe = new Set(colunas.map((c) => `${c.tabela}.${c.coluna}`));

    const pasta = join(__dirname, 'rls');
    let problemas = 0;
    for (const arq of readdirSync(pasta).filter((a) => a.endsWith('.sql')).sort()) {
      const sql = readFileSync(join(pasta, arq), 'utf8').replace(/^\s*--.*$/gm, '');
      // Cada `on public."X" for select using ( ... )` e as colunas citadas nele
      for (const m of sql.matchAll(/on public\."(\w+)" for \w+ using \(([\s\S]*?)\);\s*$/gm)) {
        const [, tabela, corpo] = m;
        for (const c of corpo!.matchAll(/(?<!\w\.)"(\w+)"(?!\.)/g)) {
          const nome = c[1]!;
          // Nomes de tabela citados em subconsulta não são coluna.
          if (/^[A-Z]/.test(nome)) continue;
          if (!existe.has(`${tabela}.${nome}`)) {
            console.log(`  ${arq}: ${tabela}.${nome} NAO EXISTE`);
            problemas++;
          }
        }
      }
    }
    console.log(problemas === 0 ? 'Todas as colunas citadas existem.' : `${problemas} problema(s).`);
    if (problemas > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
void principal();
