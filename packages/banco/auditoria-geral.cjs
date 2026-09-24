const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ datasourceUrl: process.env.SUPABASE_DIRECT_URL });
const q = (sql, ...a) => p.$queryRawUnsafe(sql, ...a);
const j = (x) => JSON.stringify(x, (_, v) => (typeof v === 'bigint' ? Number(v) : v));
const titulo = (t) => console.log('\n===== ' + t);

(async () => {
  titulo('RLS, POLITICAS E FUNCOES');
  console.log(j(await q("select count(*)::int tabelas, count(*) filter (where relrowsecurity)::int com_rls, count(*) filter (where relforcerowsecurity)::int forcado from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'")));
  console.log('politicas:', j(await q('select count(*)::int n from pg_policy')));
  console.log('funcoes definer sem search_path:', j(await q("select count(*)::int n from pg_proc pr join pg_namespace n on n.oid=pr.pronamespace where n.nspname='public' and pr.prosecdef and pr.proconfig is null")));
  console.log('tabelas com RLS e sem politica:', j(await q("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity and not exists (select 1 from pg_policy pp where pp.polrelid=c.oid) order by 1")));

  titulo('ROTINAS');
  console.log(j(await q("select jobname, schedule, active from cron.job order by 1")));
  console.log(j(await q("select j.jobname, d.status, count(*)::int n, max(d.start_time)::text ultimo from cron.job_run_details d join cron.job j using (jobid) group by 1,2 order by 1,2")));

  titulo('CONTAS');
  console.log('por papel:', j(await q('select papel::text, count(*)::int n from "User" group by 1 order by 1')));
  console.log('auth.users:', j(await q('select count(*)::int n from auth.users')));
  console.log('sobras de teste:', j(await q(`select count(*)::int n from "User" where email like '%@teste.com' or email like 'prova-%'`)));
  console.log('senhaHash preenchido:', j(await q('select count(*)::int n from "User" where "senhaHash" is not null')));

  titulo('ARMAZENAMENTO');
  console.log(j(await q("select bucket_id, count(*)::int n from storage.objects group by 1 order by 1")));
  const cols = await q("select table_name t, column_name c from information_schema.columns where table_schema='public' and (column_name ilike '%chave%' or column_name ilike '%arquivo%') and data_type='text' order by 1,2");
  const chaves = [];
  for (const { t, c } of cols) {
    const linhas = await q('select "' + c + '" chave from "' + t + '" where "' + c + '" is not null');
    for (const l of linhas) if (typeof l.chave === 'string' && l.chave.includes('/')) chaves.push(l.chave);
  }
  const objetos = new Set((await q("select bucket_id || '/' || name k from storage.objects")).map((o) => o.k));
  console.log('chaves no banco:', chaves.length, '| arquivos:', objetos.size);
  console.log('chaves sem arquivo:', j(chaves.filter((k) => !objetos.has(k))));
  console.log('arquivos sem dono (fora do catalogo):', j([...objetos].filter((o) => !chaves.includes(o) && !o.startsWith('catalogo/'))));

  titulo('AUDITORIA E INTEGRIDADE');
  console.log(j(await q('select acao::text, count(*)::int n, max("criadoEm")::text ultimo from "LogAuditoria" group by 1 order by 1')));
  console.log('gatilhos de auditoria:', j(await q("select count(distinct event_object_table)::int n from information_schema.triggers where trigger_schema='public' and trigger_name='auditar_escrita'")));
  console.log('chaves estrangeiras sem indice:', j(await q("select count(*)::int n from pg_constraint c where c.contype='f' and array_length(c.conkey,1)=1 and connamespace='public'::regnamespace and not exists (select 1 from pg_index i where i.indrelid=c.conrelid and i.indkey[0]=c.conkey[1])")));
  console.log('consentimentos ativos:', j(await q('select escopo::text, count(*)::int n from "Consentimento" where "revogadoEm" is null group by 1 order by 1')));

  await p.$disconnect();
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
