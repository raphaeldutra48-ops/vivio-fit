import { PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Auditoria das políticas, contra o banco de verdade.
 *
 *   pnpm --filter @vivio/banco exec tsx prisma/auditar-rls.ts
 *
 * Companheiro de `conferir-rls.ts`, que confere se as COLUNAS citadas nas
 * políticas existem. Aqui a pergunta é outra: se as políticas que existem
 * cobrem o que o produto realmente faz.
 *
 * ## Por que ler o banco, e não os arquivos
 *
 * Os arquivos de `rls/` dizem o que se pretendeu. O banco diz o que vale.
 * Entre os dois cabe o arquivo que não foi aplicado, a política criada à mão
 * que ninguém removeu, e a permissão que o Supabase dá de nascença a toda
 * tabela nova sem que nenhum arquivo peça.
 *
 * Sai com código 1 se achar problema: serve para rodar antes de publicar.
 */

const prisma = new PrismaClient({
  datasourceUrl:
    process.env.SUPABASE_DIRECT_URL ?? process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const COMANDOS: Record<string, string> = { r: 'SELECT', a: 'INSERT', w: 'UPDATE', d: 'DELETE' };
const ESCRITAS = ['INSERT', 'UPDATE', 'DELETE'];

interface Achado {
  titulo: string;
  explicacao: string;
  itens: string[];
  /** Achado informativo não reprova: pede olho, não conserto. */
  informativo?: boolean;
}

/** O que o SDK faz em cada tabela, lido do código. */
function usoDoSdk(): Map<string, Set<string>> {
  const caminho = join(__dirname, '../../../packages/sdk/src/supabase.ts');
  const linhas = readFileSync(caminho, 'utf8').split('\n');
  const achados = new Map<string, Set<string>>();
  const anotar = (tabela: string, op: string): void => {
    const ops = achados.get(tabela) ?? new Set<string>();
    ops.add(op);
    achados.set(tabela, ops);
  };

  /*
    A leitura também precisa das duas coisas, e falha PIOR que a escrita: sem
    permissão ou sem política, o PostgREST devolve lista vazia e 200. A tela
    mostra "nenhum registro" para quem tem registros, e não há erro nenhum
    para investigar.
  */
  for (let i = 0; i < linhas.length; i++) {
    const de = linhas[i]!.match(/\.from\(\s*'(\w+)'\s*\)/);
    if (de && /\.select\(/.test(linhas.slice(i, i + 6).join(' '))) anotar(de[1]!, 'SELECT');

    const op = linhas[i]!.match(/\.(insert|upsert|update|delete)\s*\(/);
    if (!op) continue;
    // O `.from` mais próximo acima é o dono da chamada.
    let tabela: string | null = null;
    for (let j = i; j >= Math.max(0, i - 40); j--) {
      const dono = linhas[j]!.match(/\.from\(\s*'(\w+)'\s*\)/);
      if (dono) {
        tabela = dono[1]!;
        break;
      }
    }
    if (tabela === null) continue;
    /*
      `upsert` conta como INSERT **e** UPDATE.

      É `insert ... on conflict do update`, e o Postgres exige a permissão de
      UPDATE mesmo quando nada conflita — a checagem é no plano, não na linha.
      Contar só INSERT foi o erro que derrubou a correção de medida corporal:
      a varredura julgou a permissão de UPDATE sobrando e a tirou.
    */
    if (op[1] === 'upsert') {
      anotar(tabela, 'INSERT');
      anotar(tabela, 'UPDATE');
    } else {
      anotar(tabela, op[1]!.toUpperCase());
    }
  }
  return achados;
}

/**
 * As colunas que o SDK nomeia ao inserir em cada tabela.
 *
 * Serve para uma falha que só aparece na primeira gravação de verdade: coluna
 * NOT NULL cujo valor o PRISMA gerava (`@default(cuid())`, `@updatedAt`) e que
 * o banco não tem quem preencha. Com o Prisma fora, o INSERT morre em "null
 * value in column ... violates not-null constraint" — depois de a tela já ter
 * dito que ia salvar.
 *
 * É leitura de texto, então erra para o lado seguro: pega as chaves do objeto
 * literal das ~30 linhas seguintes ao `.insert(`. Objeto montado em variável
 * separada vira falso alarme, e é por isso que o achado é informativo.
 */
function colunasQueOSdkPreenche(): Map<string, Set<string>> {
  const caminho = join(__dirname, '../../../packages/sdk/src/supabase.ts');
  const linhas = readFileSync(caminho, 'utf8').split('\n');
  const mapa = new Map<string, Set<string>>();

  for (let i = 0; i < linhas.length; i++) {
    if (!/\.(insert|upsert)\s*\(/.test(linhas[i]!)) continue;
    let tabela: string | null = null;
    for (let j = i; j >= Math.max(0, i - 40); j--) {
      const dono = linhas[j]!.match(/\.from\(\s*'(\w+)'\s*\)/);
      if (dono) {
        tabela = dono[1]!;
        break;
      }
    }
    if (tabela === null) continue;

    const campos = mapa.get(tabela) ?? new Set<string>();
    for (const linha of linhas.slice(i, i + 30)) {
      // Para no fim do bloco: a próxima chamada encadeada já é outra coisa.
      if (/^\s*\)\s*[.;]/.test(linha)) break;
      for (const m of linha.matchAll(/(?:^|[{,\s])(\w+)\s*:/g)) campos.add(m[1]!);
      // Abreviação de objeto (`id,` em vez de `id: id`) — o jeito mais comum
      // de passar a variável homônima, e ignorá-la fazia a varredura acusar
      // quinze colunas que estão preenchidas.
      const curto = linha.match(/^\s*(\w+),\s*$/);
      if (curto) campos.add(curto[1]!);
    }
    mapa.set(tabela, campos);
  }
  return mapa;
}

/** Nomes de política que algum arquivo de `rls/` cria. */
function politicasDeclaradas(): Set<string> {
  const pasta = join(__dirname, 'rls');
  const nomes = new Set<string>();
  for (const arq of readdirSync(pasta).filter((a) => a.endsWith('.sql'))) {
    for (const m of readFileSync(join(pasta, arq), 'utf8').matchAll(/create\s+policy\s+(\w+)/gi)) {
      nomes.add(m[1]!.toLowerCase());
    }
  }
  return nomes;
}

/** Funções que algum arquivo de `rls/` revoga do `authenticated`. */
function funcoesTiradasDoApp(): Set<string> {
  const pasta = join(__dirname, 'rls');
  const nomes = new Set<string>();
  const revogacao = /revoke\s+execute\s+on\s+function\s+public\.(\w+)[^;]*\bfrom\b([^;]*);/gi;
  for (const arq of readdirSync(pasta).filter((a) => a.endsWith('.sql'))) {
    for (const m of readFileSync(join(pasta, arq), 'utf8').matchAll(revogacao)) {
      if (/\bauthenticated\b/i.test(m[2]!)) nomes.add(m[1]!.toLowerCase());
    }
  }
  return nomes;
}

async function principal(): Promise<void> {
  const tabelas = await prisma.$queryRawUnsafe<{ tabela: string; ligado: boolean }[]>(
    `select c.relname tabela, c.relrowsecurity ligado
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' order by 1`,
  );

  const politicas = await prisma.$queryRawUnsafe<
    { tabela: string; politica: string; comando: string }[]
  >(
    `select c.relname tabela, p.polname politica, p.polcmd::text comando
     from pg_policy p join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' order by 1, 2`,
  );

  /*
    A permissão por COLUNA conta como permissão.

    Só `role_table_grants` mente por omissão: `User` e `Exame` não têm a
    permissão de SELECT na tabela — têm em colunas escolhidas a dedo, que é
    como `senhaHash` fica fora do alcance de quem lê o nome de alguém, e a
    chave do arquivo fora do alcance de quem lê o laudo. Olhando só a tabela, a
    auditoria acusava as duas de ter regra de leitura sem permissão. A regra
    funciona.
  */
  const permissoes = await prisma.$queryRawUnsafe<
    { tabela: string; papel: string; privilegio: string }[]
  >(
    `select table_name tabela, grantee papel, privilege_type privilegio
     from information_schema.role_table_grants
     where table_schema = 'public' and grantee in ('anon', 'authenticated')
     union
     select table_name, grantee, privilege_type from information_schema.column_privileges
     where table_schema = 'public' and grantee in ('anon', 'authenticated')`,
  );

  const pode = new Set(permissoes.map((p) => `${p.papel}.${p.tabela}.${p.privilegio}`));
  const temPolitica = new Set<string>();
  for (const p of politicas) {
    const alvos =
      p.comando === '*' ? ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] : [COMANDOS[p.comando]!];
    for (const a of alvos) temPolitica.add(`${p.tabela}.${a}`);
  }

  const ligadas = tabelas.filter((t) => t.ligado);
  const achados: Achado[] = [];

  achados.push({
    titulo: 'SEM RLS',
    explicacao: 'Qualquer sessão lê e escreve tudo — a permissão de nascença vale inteira.',
    itens: tabelas.filter((t) => !t.ligado).map((t) => t.tabela),
  });

  achados.push({
    titulo: 'PERMISSÃO SEM REGRA',
    explicacao:
      'Escrita permitida onde nenhuma política decide. Enquanto a permissão existia, o ' +
      'UPDATE afetava zero linhas em silêncio; sem ela, o Postgres recusa na porta.',
    itens: ligadas.flatMap((t) =>
      ESCRITAS.filter(
        (c) => pode.has(`authenticated.${t.tabela}.${c}`) && !temPolitica.has(`${t.tabela}.${c}`),
      ).map((c) => `${t.tabela}.${c}`),
    ),
  });

  /*
    O caso que motivou este arquivo: a política que está no banco e em nenhum
    arquivo. `notificacao_escreve` dizia `with check (true)` — qualquer um
    insere qualquer aviso para qualquer pessoa — e só não fazia efeito porque a
    tabela nunca teve permissão de INSERT. Uma decisão que nenhum arquivo
    declara é uma decisão que ninguém revisa.
  */
  const declaradas = politicasDeclaradas();
  achados.push({
    titulo: 'POLÍTICA ÓRFÃ',
    explicacao: 'Existe no banco e nenhum arquivo de `rls/` a cria.',
    itens: politicas
      .filter((p) => !declaradas.has(p.politica.toLowerCase()))
      .map((p) => `${p.tabela} — ${p.politica}`),
  });

  /*
    A metade que os testes cobrem tabela por tabela, aqui de uma vez: cada
    leitura e cada escrita que o SDK faz precisa das DUAS coisas. Sem
    permissão, erro; sem política, erro na escrita e silêncio na leitura.
    Nenhum dos dois é o que a tela promete.
  */
  const faltando: string[] = [];
  for (const [tabela, ops] of usoDoSdk()) {
    for (const op of ops) {
      const semPermissao = !pode.has(`authenticated.${tabela}.${op}`);
      const semRegra = !temPolitica.has(`${tabela}.${op}`);
      if (semPermissao || semRegra) {
        const falta = [semPermissao ? 'permissão' : null, semRegra ? 'política' : null].filter(
          (x): x is string => x !== null,
        );
        faltando.push(`${tabela}.${op} — falta ${falta.join(' e ')}`);
      }
    }
  }
  achados.push({
    titulo: 'O SDK USA E O BANCO NÃO DEIXA',
    explicacao: 'Leitura ou escrita que o cliente faz de verdade e que vai falhar em produção.',
    itens: faltando,
  });

  achados.push({
    titulo: 'REGRA SEM PERMISSÃO',
    explicacao:
      'Política que nunca decide nada. Às vezes é de propósito — apagar cardápio é ' +
      'carimbo, e o DELETE do `for all` fica sem uso — mas quem lê acredita que protege.',
    informativo: true,
    itens: ligadas.flatMap((t) =>
      ['SELECT', ...ESCRITAS]
        .filter(
          (c) =>
            temPolitica.has(`${t.tabela}.${c}`) &&
            !pode.has(`authenticated.${t.tabela}.${c}`) &&
            !pode.has(`anon.${t.tabela}.${c}`),
        )
        .map((c) => `${t.tabela}.${c}`),
    ),
  });

  /*
    Coluna obrigatória que ninguém preenche.

    `@default(cuid())` e `@updatedAt` do Prisma são do CLIENTE: o valor era
    sorteado em JavaScript e vinha dentro do INSERT. No banco essas colunas
    ficaram NOT NULL e sem default, e pelo PostgREST não há quem as preencha —
    foi assim que a regravação de demonstração morreu, e antes dela o
    `atualizadoEm` de meia dúzia de tabelas.
  */
  const obrigatorias = await prisma.$queryRawUnsafe<{ tabela: string; coluna: string }[]>(
    `select table_name tabela, column_name coluna
       from information_schema.columns
      where table_schema = 'public'
        and is_nullable = 'NO'
        and column_default is null
        and is_identity = 'NO'
      order by 1, 2`,
  );
  const preenchidas = colunasQueOSdkPreenche();
  const semQuemPreencha: string[] = [];
  for (const { tabela, coluna } of obrigatorias) {
    const campos = preenchidas.get(tabela);
    // Só interessa tabela em que o SDK realmente insere.
    if (!campos || campos.has(coluna)) continue;
    semQuemPreencha.push(`${tabela}.${coluna}`);
  }
  achados.push({
    titulo: 'COLUNA OBRIGATÓRIA SEM QUEM PREENCHA',
    explicacao:
      'NOT NULL, sem default no banco, e o INSERT do SDK não a nomeia. Ou um gatilho a ' +
      'preenche (e está tudo certo), ou a primeira gravação de verdade falha.',
    informativo: true,
    itens: semQuemPreencha,
  });

  /*
    Função ao alcance de quem não entrou no app.

    Toda função nasce com EXECUTE para PUBLIC, e `anon` herda de PUBLIC — um
    `revoke ... from anon` sozinho não tira nada. O arquivo 99 inverte isso a
    cada aplicação; esta seção existe para o caso de alguém criar uma função
    depois e não rodar o aplicador.

    Duas são abertas de propósito: a página pública do profissional e o
    formulário de contato dela, que é escrito por quem ainda não tem conta.
  */
  const ABERTAS_DE_PROPOSITO = new Set(['pagina_publica', 'enviar_pedido_de_contato']);
  const aoAlcanceDoAnonimo = await prisma.$queryRawUnsafe<{ nome: string; args: string }[]>(
    `select pr.proname nome, pg_get_function_identity_arguments(pr.oid) args
       from pg_proc pr
       join pg_namespace n on n.oid = pr.pronamespace
       join pg_type t on t.oid = pr.prorettype
      where n.nspname = 'public'
        and t.typname <> 'trigger'
        and not exists (select 1 from pg_depend d where d.objid = pr.oid and d.deptype = 'e')
        and has_function_privilege('anon', pr.oid, 'EXECUTE')
      order by 1`,
  );
  achados.push({
    titulo: 'FUNÇÃO AO ALCANCE DO ANÔNIMO',
    explicacao:
      'Chamável sem sessão. Hoje as que tocam dado começam perguntando `usuario_atual()` e ' +
      'recusam; a próxima escrita sem essa pergunta não vai reclamar de nada.',
    itens: aoAlcanceDoAnonimo
      .filter((f) => !ABERTAS_DE_PROPOSITO.has(f.nome))
      .map((f) => `${f.nome}(${f.args})`),
  });

  /*
    Função que um arquivo tirou do app e o banco devolveu.

    Foi um defeito de verdade, e da própria varredura do arquivo 99: ela dava
    EXECUTE ao `authenticated` em toda função e reabriu nove que os arquivos
    dos grupos tinham fechado — entre elas `consentimento_de`, que deixava um
    profissional perguntar sobre o consentimento dado a outro. A intenção
    estava escrita no arquivo; o banco dizia o contrário, e nada reclamava.
  */
  const internas = funcoesTiradasDoApp();
  const alcancaveis = await prisma.$queryRawUnsafe<{ nome: string }[]>(
    `select distinct pr.proname nome
       from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
      where n.nspname = 'public' and has_function_privilege('authenticated', pr.oid, 'EXECUTE')`,
  );
  achados.push({
    titulo: 'FUNÇÃO INTERNA AO ALCANCE DO APP',
    explicacao:
      'Um arquivo de `rls/` revoga do `authenticated`, e o banco ainda deixa chamar pelo ' +
      'PostgREST. Reaplicar os arquivos em ordem corrige.',
    itens: alcancaveis.map((f) => f.nome).filter((n) => internas.has(n)),
  });

  achados.push({
    titulo: 'POLÍTICAS "FOR ALL"',
    explicacao: 'Concedem SELECT junto: conferir se apagam alguma regra de leitura.',
    informativo: true,
    itens: politicas.filter((p) => p.comando === '*').map((p) => `${p.tabela} — ${p.politica}`),
  });

  console.log(`tabelas: ${tabelas.length} | com RLS: ${ligadas.length}`);
  let reprovou = 0;
  for (const a of achados) {
    const marca = a.informativo === true ? ' — informativo' : '';
    console.log(`\n## ${a.titulo} (${a.itens.length})${marca}`);
    if (a.itens.length > 0) console.log(`   ${a.explicacao}`);
    for (const i of a.itens) console.log(`   - ${i}`);
    if (a.informativo !== true) reprovou += a.itens.length;
  }

  console.log(reprovou === 0 ? '\nNada a corrigir.' : `\n${reprovou} problema(s).`);
  if (reprovou > 0) process.exitCode = 1;
  await prisma.$disconnect();
}

void principal();
