import { PrismaClient } from '@prisma/client';
import { DOCUMENTOS_LEGAIS, ENDERECO_DO_APP } from '@vivio/contracts';
import { config as carregarEnv } from 'dotenv';
import { urlDoBanco } from '../conexao';
import {
  avaliarCabecalhos,
  avaliarContas,
  avaliarFuncaoDeBorda,
  avaliarMidia,
  avaliarRotina,
  resumir,
  type Checagem,
} from './regras';

/**
 * O diagnóstico do sistema no ar, num comando.
 *
 *   pnpm --filter @vivio/banco diagnostico
 *
 * Nasceu de uma auditoria feita à mão em 22 e 25/09/2026: conferir site,
 * cabeçalhos, função de borda, rotina do banco, sobras de teste e chaves de
 * mídia levou dezenas de comandos, e cada achado só apareceu porque alguém
 * lembrou de olhar. Conferência que depende de lembrança não acontece na semana
 * em que mais importa.
 *
 * O que ele NÃO faz, de propósito: não conserta nada, não apaga nada e não
 * escreve no banco. Sai com código 1 quando algo reprova — serve para rodar
 * antes de publicar e depois de publicar.
 *
 * As regras de decisão moram em `regras.ts`, com teste próprio. Aqui só há
 * coleta: é a parte que precisa de rede e de banco, e é a parte que não dá para
 * testar sem produção.
 */
carregarEnv();
carregarEnv({ path: '.env.supabase' });

const prisma = new PrismaClient({ datasourceUrl: urlDoBanco() });

async function statusDe(url: string, metodo = 'GET'): Promise<number> {
  try {
    const r = await fetch(url, {
      method: metodo,
      ...(metodo === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: '{}' } : {}),
    });
    return r.status;
  } catch {
    return 0;
  }
}

async function paginasPublicas(): Promise<Checagem[]> {
  const alvos: [string, string][] = [
    ['login', `${ENDERECO_DO_APP}/login`],
    ['cadastro', `${ENDERECO_DO_APP}/cadastrar`],
    ['termos de uso', DOCUMENTOS_LEGAIS.termos],
    ['política de privacidade', DOCUMENTOS_LEGAIS.privacidade],
    // A tela que o app mostra sem rede: some do pacote e o modo offline quebra
    // calado, porque quem o usa já está sem conexão para reclamar.
    ['sem conexão', `${ENDERECO_DO_APP}/sem-conexao`],
    ['manifesto', `${ENDERECO_DO_APP}/manifest.webmanifest`],
    ['trabalhador de fundo', `${ENDERECO_DO_APP}/sw.js`],
  ];
  const resultados = await Promise.all(alvos.map(async ([nome, url]) => [nome, await statusDe(url)] as const));
  return resultados.map(([nome, status]) => ({
    nome: `página ${nome}`,
    ok: status === 200,
    detalhe: status === 200 ? '200' : `respondeu ${status === 0 ? 'nada (rede?)' : status}`,
  }));
}

async function cabecalhos(): Promise<Checagem> {
  try {
    const r = await fetch(`${ENDERECO_DO_APP}/login`);
    const recebidos: Record<string, string> = {};
    r.headers.forEach((valor, chave) => {
      recebidos[chave] = valor;
    });
    return avaliarCabecalhos(recebidos);
  } catch {
    return { nome: 'cabeçalhos de segurança do site', ok: false, detalhe: 'site inalcançável' };
  }
}

async function funcaoDeBorda(): Promise<Checagem> {
  const url = process.env.SUPABASE_URL;
  if (!url) {
    return { nome: 'função de borda ler-dieta', ok: false, detalhe: 'falta SUPABASE_URL' };
  }
  return avaliarFuncaoDeBorda('ler-dieta', await statusDe(`${url}/functions/v1/ler-dieta`, 'POST'));
}

async function doBanco(): Promise<Checagem[]> {
  const q = <T>(sql: string): Promise<T[]> => prisma.$queryRawUnsafe<T[]>(sql);
  const checagens: Checagem[] = [];

  const rotina = await q<{ status: string; quando: Date }>(
    `select d.status, d.start_time as quando
       from cron.job_run_details d join cron.job j using (jobid)
      where j.jobname = 'vivio-disparar-lembretes'
      order by d.start_time desc limit 1`,
  );
  checagens.push(
    avaliarRotina('disparo de lembretes', rotina[0] ? { status: rotina[0].status, quando: new Date(rotina[0].quando) } : null, new Date()),
  );

  const semRls = await q<{ tabela: string }>(
    `select c.relname tabela from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1`,
  );
  checagens.push({
    nome: 'tabelas sem RLS',
    ok: semRls.length === 0,
    detalhe: semRls.length === 0 ? 'nenhuma' : semRls.map((t) => t.tabela).join(', '),
  });

  const semSearchPath = await q<{ nome: string }>(
    `select pr.proname nome from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
      where n.nspname = 'public' and pr.prosecdef and pr.proconfig is null order by 1`,
  );
  checagens.push({
    nome: 'funções privilegiadas sem search_path fixado',
    ok: semSearchPath.length === 0,
    detalhe: semSearchPath.length === 0 ? 'nenhuma' : semSearchPath.map((f) => f.nome).join(', '),
  });

  const gatilhos = await q<{ n: number }>(
    `select count(distinct event_object_table)::int n from information_schema.triggers
      where trigger_schema = 'public' and trigger_name = 'auditar_escrita'`,
  );
  const quantos = Number(gatilhos[0]?.n ?? 0);
  checagens.push({
    nome: 'gatilhos da trilha de auditoria',
    ok: quantos === 15,
    detalhe: quantos === 15 ? '15 tabelas cobertas' : `${quantos} tabelas — esperado 15`,
  });

  const senhas = await q<{ n: number }>('select count(*)::int n from "User" where "senhaHash" is not null');
  checagens.push({
    nome: 'credencial antiga guardada no banco',
    ok: Number(senhas[0]?.n ?? 0) === 0,
    detalhe: `${Number(senhas[0]?.n ?? 0)} contas com hash de senha da API antiga`,
  });

  const contas = await q<{ email: string }>('select email from "User" where "deletadoEm" is null');
  checagens.push(...avaliarContas(contas.map((c) => c.email)));

  /*
    As chaves de mídia de todas as colunas que guardam caminho de arquivo, e o
    que existe no armazenamento. Ler as colunas do catálogo do banco, em vez de
    listá-las à mão, é o que faz a conferência continuar valendo quando uma
    tabela nova guardar arquivo.
  */
  const colunas = await q<{ tabela: string; coluna: string }>(
    `select table_name tabela, column_name coluna from information_schema.columns
      where table_schema = 'public' and data_type = 'text'
        and (column_name ilike '%chave%' or column_name ilike '%arquivo%')
      order by 1, 2`,
  );
  const chaves: string[] = [];
  for (const { tabela, coluna } of colunas) {
    const linhas = await q<{ chave: string | null }>(
      `select "${coluna}" as chave from "${tabela}" where "${coluna}" is not null`,
    );
    for (const l of linhas) if (l.chave?.includes('/')) chaves.push(l.chave);
  }
  const arquivos = await q<{ k: string }>("select bucket_id || '/' || name k from storage.objects");
  checagens.push(...avaliarMidia(chaves, arquivos.map((a) => a.k)));

  return checagens;
}

async function principal(): Promise<void> {
  console.log(`Diagnóstico — ${new Date().toLocaleString('pt-BR')}\n`);
  const checagens = [
    ...(await paginasPublicas()),
    await cabecalhos(),
    await funcaoDeBorda(),
    ...(await doBanco()),
  ];

  for (const c of checagens) {
    const marca = c.ok ? 'ok  ' : c.informativo === true ? 'nota' : 'FALHA';
    console.log(`${marca.padEnd(5)} ${c.nome}: ${c.detalhe}`);
  }

  const { reprovadas, avisos, codigoDeSaida } = resumir(checagens);
  console.log('');
  console.log(
    reprovadas.length === 0
      ? `Nada reprovou${avisos.length > 0 ? ` (${avisos.length} nota${avisos.length > 1 ? 's' : ''} para ler)` : ''}.`
      : `${reprovadas.length} falha(s): ${reprovadas.map((r) => r.nome).join(', ')}`,
  );
  process.exitCode = codigoDeSaida;
  await prisma.$disconnect();
}

if (require.main === module) {
  principal().catch((erro: unknown) => {
    console.error(erro);
    process.exit(1);
  });
}
