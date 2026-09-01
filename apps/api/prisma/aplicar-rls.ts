import { PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Aplica os arquivos de `prisma/rls/` no banco, em ordem.
 *
 *   SUPABASE_DIRECT_URL=... pnpm --filter @vivio/api exec tsx prisma/aplicar-rls.ts
 *
 * O divisor de comandos existe porque o driver não aceita várias instruções
 * numa chamada — e a primeira versão dele custou um susto: ela descartava toda
 * linha começando com `--`, e como os `enable row level security` vinham logo
 * depois de um comentário, foram engolidos junto. As políticas existiam e não
 * valiam, e o teste acusou "vazamento" que era só ausência de aplicação.
 *
 * Agora os comentários são removidos ANTES de dividir, em vez de servirem de
 * critério para descartar comando.
 */
export function comandos(sql: string): string[] {
  const semComentarios = sql
    .replace(/\/\*[\s\S]*?\*\//g, '') // blocos
    .replace(/^\s*--.*$/gm, ''); // linhas

  const partes: string[] = [];
  let atual = '';
  let dentroDeCorpo = false; // corpo de função entre $$ ... $$
  for (const linha of semComentarios.split('\n')) {
    if (linha.includes('$$')) dentroDeCorpo = !dentroDeCorpo;
    atual += linha + '\n';
    if (!dentroDeCorpo && linha.trimEnd().endsWith(';')) {
      const c = atual.trim().replace(/;$/, '');
      if (c) partes.push(c);
      atual = '';
    }
  }
  if (atual.trim()) partes.push(atual.trim().replace(/;$/, ''));
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
void principal();
