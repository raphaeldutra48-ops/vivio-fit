import { PrismaClient } from '@prisma/client';
import { config as carregarEnv } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { urlDoBanco } from '../conexao';
import { ordenarPorDependencia, paraJson, type Dependencia } from './ordem';

/**
 * Uma cópia dos dados fora do Supabase, que o dono controla.
 *
 *   pnpm --filter @vivio/banco exportar
 *   DESTINO=D:/backups/vivio pnpm --filter @vivio/banco exportar
 *
 * O provedor faz backup diário, e isso cobre a falha do provedor. Não cobre o
 * resto: projeto apagado por engano, cobrança não paga, conta suspensa, ou uma
 * migração minha que apague dado — nenhum desses casos é resolvido por um backup
 * que vive dentro do mesmo projeto.
 *
 * ## O que ele grava, e o que não grava
 *
 * Grava as tabelas de `public` em JSON, uma por arquivo, **na ordem em que dá
 * para restaurar** (pais antes de filhos, calculada das chaves estrangeiras),
 * mais um `manifesto.json` com essa ordem, a contagem por tabela e o instante.
 *
 * NÃO grava: as contas do Supabase Auth (`auth.users`, que é do provedor e tem
 * as credenciais) nem os arquivos do Storage. Para a mídia, `subir-catalogo`
 * repõe o acervo, e foto de aluno só existe no Storage — quem quiser cópia dela
 * precisa baixá-la; está registrado como o limite desta ferramenta, e não como
 * se fosse coberto.
 *
 * Também não escreve nada no banco: é leitura pura, segura de rodar a qualquer
 * hora.
 */
carregarEnv();
carregarEnv({ path: '.env.supabase' });

const prisma = new PrismaClient({ datasourceUrl: urlDoBanco() });

/** As tabelas de `public`, fora as internas do Prisma. */
async function tabelas(): Promise<string[]> {
  const linhas = await prisma.$queryRawUnsafe<{ tabela: string }[]>(
    `select c.relname tabela from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname <> '_prisma_migrations'
      order by 1`,
  );
  return linhas.map((l) => l.tabela);
}

async function dependencias(): Promise<Dependencia[]> {
  const linhas = await prisma.$queryRawUnsafe<Dependencia[]>(
    `select src.relname as tabela, alvo.relname as depende
       from pg_constraint c
       join pg_class src on src.oid = c.conrelid
       join pg_class alvo on alvo.oid = c.confrelid
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace`,
  );
  return linhas;
}

async function principal(): Promise<void> {
  const quando = new Date();
  const destino = join(
    process.env.DESTINO ?? join(process.cwd(), 'exportacoes'),
    quando.toISOString().slice(0, 19).replace(/[:T]/g, '-'),
  );
  mkdirSync(destino, { recursive: true });

  const { ordem, emCiclo } = ordenarPorDependencia(await tabelas(), await dependencias());
  const todas = [...ordem, ...emCiclo];

  const contagem: Record<string, number> = {};
  let linhasTotais = 0;
  for (const tabela of todas) {
    const linhas = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`select * from "${tabela}"`);
    contagem[tabela] = linhas.length;
    linhasTotais += linhas.length;
    writeFileSync(
      join(destino, `${tabela}.json`),
      JSON.stringify(paraJson(linhas), null, linhas.length > 200 ? 0 : 2),
      'utf8',
    );
    if (linhas.length > 0) console.log(`  ${tabela}: ${linhas.length}`);
  }

  const manifesto = {
    quando: quando.toISOString(),
    /*
      A ordem é o que torna o backup restaurável, e por isso ela vai gravada: no
      dia da restauração ninguém vai ter tempo de recalcular dependência de 68
      tabelas.
    */
    ordemDeRestauracao: ordem,
    /*
      Tabelas em ciclo, se houver: não existe ordem que as resolva, então
      restaurá-las exige uma transação com `set constraints all deferred`.
    */
    tabelasEmCiclo: emCiclo,
    contagem,
    linhasTotais,
    naoIncluido: [
      'auth.users (contas e credenciais: são do Supabase Auth)',
      'storage (arquivos: acervo volta com subir-catalogo; foto de aluno só existe lá)',
    ],
  };
  writeFileSync(join(destino, 'manifesto.json'), JSON.stringify(manifesto, null, 2), 'utf8');

  console.log('');
  console.log(`${todas.length} tabelas, ${linhasTotais} linhas`);
  if (emCiclo.length > 0) {
    console.log(`em ciclo (restaurar com constraints deferred): ${emCiclo.join(', ')}`);
  }
  console.log(`em ${destino}`);
  await prisma.$disconnect();
}

if (require.main === module) {
  principal().catch((erro: unknown) => {
    console.error(erro);
    process.exit(1);
  });
}
