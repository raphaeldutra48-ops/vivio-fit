import { PrismaClient } from '@prisma/client';

/**
 * Copia os dados do banco atual para o Supabase, direto, sem arquivo no meio.
 *
 *   pnpm --filter @vivio/api migrar-supabase          # confere e não escreve
 *   pnpm --filter @vivio/api migrar-supabase --aplicar
 *
 * ## Antes de rodar
 *
 * O schema tem de existir no destino. Ele é criado pelas mesmas 36 migrações
 * versionadas, e não por dump de estrutura:
 *
 *   DATABASE_URL=$SUPABASE_DATABASE_URL DIRECT_URL=$SUPABASE_DIRECT_URL \
 *     pnpm --filter @vivio/api exec prisma migrate deploy
 *
 * Dump de estrutura entre versões diferentes de PostgreSQL — a origem roda 18,
 * o Supabase roda 15/17 — traz problema que migração não traz.
 *
 * ## De onde vem a credencial
 *
 * De `SUPABASE_DIRECT_URL`, no ambiente. Nunca de argumento de linha de
 * comando: argumento fica no histórico do shell e aparece em `ps` para
 * qualquer processo da máquina.
 *
 * Usa a conexão DIRETA (porta 5432) e não a do pooler: o pooler em modo
 * transação não sustenta `SET session_replication_role`, que é o que permite
 * inserir sem depender da ordem das chaves estrangeiras.
 *
 * ## Seguro para repetir
 *
 * Cada inserção termina em `ON CONFLICT DO NOTHING`, e tudo roda numa
 * transação só. Queda de rede no meio não deixa metade dos dados dentro, e
 * rodar de novo não duplica o que já entrou.
 */

interface Aresta {
  tabela: string;
  depende_de: string;
}

/**
 * Contas criadas pela suíte de testes, que não devem atravessar para o destino.
 *
 * Elas existem no banco de origem por um acidente que só apareceu agora: não
 * havia dois bancos. O `.env` local e a produção apontam para o mesmo endpoint
 * do Neon — mudam pelo `-pooler` — e a suíte e2e, que cria e apaga usuários,
 * vinha rodando ali.
 *
 * Migrar é a oportunidade de não levar a sujeira junto. Filtrar aqui é melhor
 * que apagar na origem: nada é destruído, e o Neon fica intacto até você
 * confirmar que o Supabase assumiu.
 */
const EMAIL_DE_TESTE = /@teste\.com$/i;

/** Teto de caracteres por comando INSERT, para o lote nao estourar o servidor. */
const LIMITE_DO_COMANDO = 400_000;

/**
 * Descobre, tabela por tabela, quais linhas pertencem a esses usuários.
 *
 * Percorre as chaves estrangeiras que apontam para `User` em vez de listar as
 * tabelas à mão: o schema tem 66 modelos e uma lista escrita à mão envelhece
 * no primeiro modelo novo — deixando passar justamente o que ela deveria
 * barrar, e sem aviso.
 */
async function contasDeTeste(
  origem: PrismaClient,
): Promise<{ ids: string[]; colunasPorTabela: Map<string, string[]> }> {
  const usuarios = await origem.$queryRawUnsafe<{ id: string; email: string }[]>(
    `SELECT id, email FROM "User"`,
  );
  const ids = usuarios.filter((u) => EMAIL_DE_TESTE.test(u.email)).map((u) => u.id);
  const colunasPorTabela = new Map<string, string[]>();
  if (ids.length === 0) return { ids, colunasPorTabela };

  // Toda coluna que referencia User.id, em qualquer tabela.
  const colunas = await origem.$queryRawUnsafe<{ tabela: string; coluna: string }[]>(`
    SELECT o.relname::text AS tabela, a.attname::text AS coluna
    FROM pg_constraint c
    JOIN pg_class o ON o.oid = c.conrelid
    JOIN pg_class d ON d.oid = c.confrelid
    JOIN unnest(c.conkey) AS k(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE c.contype = 'f' AND d.relname = 'User'
  `);

  for (const { tabela, coluna } of colunas) {
    colunasPorTabela.set(tabela, [...(colunasPorTabela.get(tabela) ?? []), coluna]);
  }
  // O próprio User entra pela chave primária, que nenhuma FK cobre.
  colunasPorTabela.set('User', [...(colunasPorTabela.get('User') ?? []), 'id']);
  return { ids, colunasPorTabela };
}

/** Ordem topológica: quem é referenciado entra antes de quem referencia. */
export function ordenarPorDependencia(tabelas: string[], arestas: Aresta[]): string[] {
  const dependencias = new Map<string, Set<string>>(tabelas.map((t) => [t, new Set()]));
  for (const a of arestas) {
    // Autorreferência não é dependência entre tabelas: se contasse, a tabela
    // esperaria por si mesma e nada ficaria pronto.
    if (a.tabela === a.depende_de) continue;
    if (dependencias.has(a.tabela) && dependencias.has(a.depende_de)) {
      dependencias.get(a.tabela)!.add(a.depende_de);
    }
  }

  const ordenadas: string[] = [];
  const restantes = new Set(tabelas);

  while (restantes.size > 0) {
    const prontas = [...restantes].filter((t) =>
      [...dependencias.get(t)!].every((d) => !restantes.has(d)),
    );
    if (prontas.length === 0) {
      // Ciclo: melhor parar do que emitir ordem errada e falhar no meio da
      // restauração, com parte dos dados já dentro.
      throw new Error(`Ciclo de chave estrangeira: ${[...restantes].sort().join(', ')}`);
    }
    for (const t of prontas.sort()) {
      ordenadas.push(t);
      restantes.delete(t);
    }
  }
  return ordenadas;
}

/** Um valor JavaScript como literal SQL. */
export function literal(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'bigint') return String(v);
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (Buffer.isBuffer(v)) return `'\\x${v.toString('hex')}'`;
  if (Array.isArray(v)) {
    // ARRAY[...] e não '{"a","b"}': aspas simples dentro do texto quebram a
    // sintaxe de chaves e não quebram esta.
    return v.length === 0 ? `'{}'` : `ARRAY[${v.map(literal).join(',')}]`;
  }
  if (typeof v === 'object') {
    // Decimal do Prisma tem toString próprio. Objeto sem toString vira JSON —
    // nunca "[object Object]", que entraria no banco como dado errado.
    const o = v as { toString?: () => string };
    const texto =
      o.toString && o.toString !== Object.prototype.toString ? o.toString() : JSON.stringify(v);
    return `'${texto.replace(/'/g, "''")}'`;
  }
  /*
    Chegou aqui: nao e nulo, booleano, numero, data, buffer, arranjo nem
    objeto — todos saem acima. Sobra texto, e o `as string` diz isso ao
    compilador em vez de deixar `String()` receber `unknown`.
  */
  return `'${(v as string).replace(/'/g, "''")}'`;
}

async function principal(): Promise<void> {
  const aplicar = process.argv.includes('--aplicar');
  const urlDestino = process.env.SUPABASE_DIRECT_URL;

  if (!urlDestino) {
    console.error(
      [
        'Falta SUPABASE_DIRECT_URL no ambiente.',
        '',
        'É a conexão DIRETA do Supabase (porta 5432), em',
        'Project Settings → Database → Connection string → URI.',
        '',
        'Coloque em apps/api/.env.supabase — o arquivo já está no .gitignore.',
        'Não passe por argumento: fica no histórico do shell e em `ps`.',
      ].join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  const origem = new PrismaClient();
  const destino = new PrismaClient({ datasourceUrl: urlDestino });

  try {
    const [{ v: versaoOrigem }] = await origem.$queryRawUnsafe<{ v: string }[]>(
      'SELECT version() AS v',
    );
    const [{ v: versaoDestino }] = await destino.$queryRawUnsafe<{ v: string }[]>(
      'SELECT version() AS v',
    );
    console.log(`origem : ${versaoOrigem.split(',')[0]}`);
    console.log(`destino: ${versaoDestino.split(',')[0]}\n`);

    const tabelas = (
      await origem.$queryRawUnsafe<{ tabela: string }[]>(`
        SELECT table_name AS tabela FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `)
    )
      .map((t) => t.tabela)
      // O histórico de migrações do destino é do próprio `migrate deploy`.
      .filter((t) => t !== '_prisma_migrations');

    /*
      Antes de qualquer escrita: o schema existe lá? Sem esta conferência, o
      script começaria a inserir e falharia na primeira tabela, deixando a
      mensagem de erro do Postgres no lugar de uma instrução clara.
    */
    const noDestino = new Set(
      (
        await destino.$queryRawUnsafe<{ tabela: string }[]>(`
          SELECT table_name AS tabela FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        `)
      ).map((t) => t.tabela),
    );
    const faltando = tabelas.filter((t) => !noDestino.has(t));
    if (faltando.length > 0) {
      console.error(
        [
          `O destino não tem ${faltando.length} das ${tabelas.length} tabelas.`,
          `Faltam, por exemplo: ${faltando.slice(0, 5).join(', ')}`,
          '',
          'Rode as migrações no destino primeiro:',
          '  DATABASE_URL=$SUPABASE_DATABASE_URL DIRECT_URL=$SUPABASE_DIRECT_URL \\',
          '    pnpm --filter @vivio/api exec prisma migrate deploy',
        ].join('\n'),
      );
      process.exitCode = 1;
      return;
    }

    const arestas = await origem.$queryRawUnsafe<Aresta[]>(`
      SELECT DISTINCT o.relname::text AS tabela, d.relname::text AS depende_de
      FROM pg_constraint c
      JOIN pg_class o ON o.oid = c.conrelid
      JOIN pg_class d ON d.oid = c.confrelid
      WHERE c.contype = 'f'
    `);
    const ordem = ordenarPorDependencia(tabelas, arestas);

    const { ids: idsDeTeste, colunasPorTabela } = await contasDeTeste(origem);
    if (idsDeTeste.length > 0) {
      console.log(
        `contas de teste encontradas: ${idsDeTeste.length} — não serão copiadas,` +
          ` junto com tudo que depende delas.\n`,
      );
    }
    const listaIds = idsDeTeste.map((i) => `'${i.replace(/'/g, "''")}'`).join(',');

    const comandos: string[] = [];
    const resumo: { tabela: string; linhas: number; pulou: number }[] = [];

    for (const tabela of ordem) {
      /*
        A condição é escrita pelo lado do que FICA, e cada coluna trata o nulo
        explicitamente. A primeira versão era `WHERE NOT (col IN (...) OR ...)`
        e apagava dado bom em silêncio: `Consentimento.profissionalId` é nulo no
        caso mais comum — o consentimento vale para a equipe inteira — e em SQL
        `NULL IN (...)` devolve NULL, não falso. `NOT (falso OR NULL)` é NULL, o
        `WHERE` descarta a linha, e os 45 consentimentos do banco viravam 0 no
        ensaio, sem erro nenhum.

        Coluna nula significa "não aponta para usuário de teste", então a linha
        fica.
      */
      const colunasDeUsuario = colunasPorTabela.get(tabela) ?? [];
      const filtro =
        idsDeTeste.length > 0 && colunasDeUsuario.length > 0
          ? ` WHERE ${colunasDeUsuario
              .map((c) => `("${c}" IS NULL OR "${c}" NOT IN (${listaIds}))`)
              .join(' AND ')}`
          : '';

      const linhas = await origem.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM "${tabela}"${filtro}`,
      );
      const [{ n: totalNaOrigem }] = await origem.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM "${tabela}"`,
      );
      const pulou = Number(totalNaOrigem) - linhas.length;
      if (linhas.length === 0) {
        if (pulou > 0) resumo.push({ tabela, linhas: 0, pulou });
        continue;
      }

      const colunas = Object.keys(linhas[0]!);
      const lista = colunas.map((c) => `"${c}"`).join(', ');
      /*
        Várias linhas por comando, e não uma cada.

        A primeira versão emitia um INSERT por linha: 3.985 idas e vindas até o
        Supabase, cada uma pagando a latência da rede. A transação estourou o
        tempo antes de terminar. Agrupadas, as mesmas 3.985 linhas viram algumas
        dezenas de comandos.

        O lote é limitado por caracteres e não por número de linhas, porque o
        que estoura o limite do servidor é o tamanho do comando — e uma linha de
        `LogAuditoria` com metadata é muito maior que uma de `ItemTreino`.
      */
      let lote: string[] = [];
      let tamanho = 0;
      const fecharLote = () => {
        if (lote.length === 0) return;
        comandos.push(
          `INSERT INTO "${tabela}" (${lista}) VALUES ${lote.join(', ')} ON CONFLICT DO NOTHING`,
        );
        lote = [];
        tamanho = 0;
      };
      for (const linha of linhas) {
        const tupla = `(${colunas.map((c) => literal(linha[c])).join(', ')})`;
        if (tamanho + tupla.length > LIMITE_DO_COMANDO) fecharLote();
        lote.push(tupla);
        tamanho += tupla.length;
      }
      fecharLote();
      resumo.push({ tabela, linhas: linhas.length, pulou });
    }

    const total = resumo.reduce((s, r) => s + r.linhas, 0);
    const pulados = resumo.reduce((s, r) => s + r.pulou, 0);
    console.log(`ordem topológica: ${ordem.length} tabelas`);
    console.log(`com dados: ${resumo.length} · linhas a copiar: ${total}`);
    console.log(`linhas deixadas para trás (contas de teste): ${pulados}\n`);
    for (const r of resumo) {
      const nota = r.pulou > 0 ? `   (${r.pulou} de teste, fora)` : '';
      console.log(`  ${String(r.linhas).padStart(6)}  ${r.tabela}${nota}`);
    }

    if (!aplicar) {
      console.log('\nEnsaio — nada foi escrito. Repita com --aplicar para copiar.');
      return;
    }

    console.log('\ncopiando…');
    /*
      Transação em lote (`$transaction` com uma lista), e não interativa.

      A interativa mantém a conexão aberta enquanto o JavaScript decide o que
      fazer, e o Prisma a fecha por tempo — foi o que aconteceu na primeira
      tentativa: `Transaction not found ... old closed transaction`. Aqui os
      comandos já estão todos prontos antes de a transação começar, então ela
      abre, executa e fecha sem esperar por nada.
    */
    await destino.$transaction(comandos.map((c) => destino.$executeRawUnsafe(c)));

    console.log('\nconferindo o destino:');
    let divergiu = false;
    for (const r of resumo) {
      const [{ n }] = await destino.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM "${r.tabela}"`,
      );
      const ok = Number(n) === r.linhas;
      if (!ok) divergiu = true;
      console.log(`  ${ok ? 'ok ' : 'DIF'}  ${r.tabela}: origem ${r.linhas} · destino ${n}`);
    }
    console.log(divergiu ? '\nHouve divergência — confira acima.' : '\nTodas as contagens batem.');
  } finally {
    await origem.$disconnect();
    await destino.$disconnect();
  }
}

void principal();
