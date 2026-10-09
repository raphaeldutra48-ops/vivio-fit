import * as ts from 'typescript';
import { colunaTemQuemPreencha } from './regras-da-auditoria';

/**
 * O SDK fala com o Postgres por **texto**, e o compilador não vê nenhum deles.
 *
 * `from('Exame')`, `select('id,nome')`, `eq('alunoId', …)`, `order('criadoEm')`,
 * as chaves de um `insert({…})`, e os nomes de constraint em
 * `User!Vinculo_alunoId_fkey` — tudo isso é string. Um erro de digitação
 * compila, passa em toda prova que não toca o banco e só aparece em produção,
 * na primeira vez que alguém usa aquela tela. O PostgREST responde `PGRST200`
 * ou `42703`, e a tela diz "não foi possível carregar".
 *
 * A suíte do SDK pega isso — mas ela fala com o Supabase de verdade e se PULA
 * sem credencial, então nunca roda na cadeia nem no CI. Este módulo faz a mesma
 * pergunta **sem banco**: confronta o que o SDK escreve com o que o
 * `schema.prisma` declara, com as constraints que as migrações criam de fato, e
 * com os gatilhos que preenchem colunas obrigatórias.
 *
 * ## Por que a AST, e não regex
 *
 * O auditor anterior (`colunasQueOSdkPreenche`, em `auditar-rls.ts`) lia texto:
 * procurava `.from('X')` até 40 linhas acima e juntava qualquer `palavra:` nas
 * 30 seguintes. Isso erra na direção perigosa — um `Nota:` num comentário, um
 * ternário ou a chave de um objeto aninhado contavam como "coluna preenchida", e
 * uma coluna obrigatória realmente omitida passava. Medido: ele via 60 chaves a
 * mais do que existem, e nenhuma delas era obrigatória, então nada estava
 * mascarado — mas a margem era de sorte, não de método.
 *
 * Aqui a cadeia `db.from('T').select(…).eq(…)` é lida pela AST do TypeScript, o
 * que resolve de graça o que o regex não alcança: `select` montado por
 * concatenação, constantes estáticas da classe (`MotorSupabase.CAMPOS_X`),
 * condicional (`lado === 'aluno' ? 'alunoId' : 'profissionalId'`) e parâmetro
 * tipado com união de literais.
 *
 * ## O que NÃO é conferido, e fica dito
 *
 * - **Tipo do valor.** Se `alunoId` recebe um número, nada aqui sabe.
 * - **Existência da linha**, política de acesso e RLS — isso é do `rls:auditar`.
 * - **Gatilho que não existe de verdade no banco.** A evidência vem do SQL em
 *   `prisma/rls`, que é o que `rls:aplicar` aplica; se alguém nunca aplicou, o
 *   banco está atrás do repositório e o diagnóstico é quem acusa.
 * - Qualquer ponto cujo texto seja de fato dinâmico vira `NAO_RESOLVIDO` e
 *   **reprova** — um buraco conhecido é melhor que um buraco calado.
 */

// ---------------------------------------------------------------------------
// Esquema
// ---------------------------------------------------------------------------

export interface CampoDoEsquema {
  tipo: string;
  lista: boolean;
  opcional: boolean;
  /** O tipo é outro modelo: o campo é relação, e não coluna. */
  ehModelo: boolean;
  /** Texto depois de `@default(`, ou `null`. */
  padrao: string | null;
  atualizadoEm: boolean;
  /** Colunas da chave estrangeira declaradas neste campo de relação. */
  colunasFk: string[];
}

export type Esquema = Map<string, Map<string, CampoDoEsquema>>;

export function lerEsquema(texto: string): Esquema {
  // O comentário em bloco sai antes de tudo: a prosa dentro dele já virou
  // "coluna" uma vez ("guardar", "consegue", "Texto"…).
  const limpo = texto.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const modelos = new Set([...limpo.matchAll(/^model\s+(\w+)/gm)].map((m) => m[1]));
  const esquema: Esquema = new Map();

  for (const bloco of limpo.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const campos = new Map<string, CampoDoEsquema>();
    for (const linha of bloco[2].split('\n')) {
      const l = linha.trim();
      if (l === '' || l.startsWith('//') || l.startsWith('@@')) continue;
      const m = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(l);
      if (!m) continue;
      const [, nome, tipo, lista, opcional, resto] = m;
      const iDefault = resto.indexOf('@default(');
      const fk = /@relation\([^)]*fields:\s*\[([^\]]*)\]/.exec(resto);
      campos.set(nome, {
        tipo,
        lista: lista !== undefined,
        opcional: opcional !== undefined,
        ehModelo: modelos.has(tipo),
        padrao: iDefault >= 0 ? resto.slice(iDefault + '@default('.length) : null,
        atualizadoEm: resto.includes('@updatedAt'),
        colunasFk: fk ? fk[1].split(',').map((c) => c.trim()).filter(Boolean) : [],
      });
    }
    esquema.set(bloco[1], campos);
  }
  return esquema;
}

const ehColuna = (e: Esquema, tabela: string, nome: string): boolean => {
  const campo = e.get(tabela)?.get(nome);
  return campo !== undefined && !campo.ehModelo;
};

/**
 * Colunas que um `insert` PRECISA mandar, ou ter quem preencha.
 *
 * Obrigatória no banco = não opcional, não lista, e sem default **do banco**.
 * `cuid()` e `uuid()` são do cliente Prisma — o Postgres não os conhece, e pelo
 * PostgREST ninguém os gera —, e `@updatedAt` também. Os demais defaults
 * (`now()`, literais, `dbgenerated(…)`) existem no banco de verdade.
 */
export function colunasObrigatoriasNoInsert(e: Esquema, tabela: string): string[] {
  const saida: string[] = [];
  for (const [nome, c] of e.get(tabela) ?? []) {
    if (c.ehModelo || c.opcional || c.lista) continue;
    if (c.atualizadoEm || c.padrao === null || /^(cuid|uuid)\(/.test(c.padrao)) saida.push(nome);
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Constraints reais, das migrações
// ---------------------------------------------------------------------------

export interface ConstraintFk {
  nome: string;
  tabela: string;
  colunas: string[];
  alvo: string;
}

/**
 * As chaves estrangeiras que existem no banco depois de TODAS as migrações.
 *
 * Lidas do SQL, e não deduzidas do `schema.prisma`: o nome que o PostgREST
 * resolve em `User!Vinculo_alunoId_fkey` é o nome da constraint no Postgres.
 * O Prisma gera `Tabela_coluna_fkey`, mas uma migração editada à mão pode ter
 * mudado isso, e é no SQL que se vê.
 *
 * Em ordem, porque uma constraint pode ser criada e derrubada depois — e
 * `DROP TABLE` leva junto as que apontam para a tabela.
 */
export function lerConstraints(migracoesEmOrdem: string[]): Map<string, ConstraintFk> {
  const mapa = new Map<string, ConstraintFk>();
  const eventos =
    /ALTER TABLE "(\w+)" ADD CONSTRAINT "(\w+)" FOREIGN KEY \(([^)]*)\) REFERENCES "(\w+)"|ALTER TABLE "(\w+)" DROP CONSTRAINT "(\w+)"|DROP TABLE "(\w+)"/g;

  for (const sql of migracoesEmOrdem) {
    for (const m of sql.matchAll(eventos)) {
      if (m[2] !== undefined) {
        mapa.set(m[2], {
          nome: m[2],
          tabela: m[1],
          colunas: m[3].split(',').map((c) => c.replace(/"/g, '').trim()),
          alvo: m[4],
        });
      } else if (m[6] !== undefined) {
        mapa.delete(m[6]);
      } else if (m[7] !== undefined) {
        for (const [nome, c] of mapa) if (c.tabela === m[7] || c.alvo === m[7]) mapa.delete(nome);
      }
    }
  }
  return mapa;
}

// ---------------------------------------------------------------------------
// Quem preenche cada coluna: gatilhos de BEFORE INSERT, lidos do SQL
// ---------------------------------------------------------------------------

/**
 * Para cada tabela, o texto dos gatilhos `before … insert` e o corpo das funções
 * que eles executam. É o que `colunaTemQuemPreencha` sabe ler.
 *
 * A declaração entra junto da função porque `governar_conteudo` é genérica e
 * serve quatro tabelas: a coluna que cada uma governa (`autorId`,
 * `profissionalId`, `prescritorId`) só aparece como ARGUMENTO do gatilho.
 */
export function evidenciasDeGatilhos(arquivosSql: string[]): Map<string, string[]> {
  const sql = arquivosSql.map((t) => t.replace(/\r\n/g, '\n'));
  const corpos = new Map<string, string>();
  for (const t of sql) {
    for (const m of t.matchAll(
      /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\([\s\S]*?\$(\w*)\$([\s\S]*?)\$\2\$/gi,
    )) {
      corpos.set(m[1], `${corpos.get(m[1]) ?? ''}\n${m[3]}`);
    }
  }

  const porTabela = new Map<string, string[]>();
  for (const t of sql) {
    for (const m of t.matchAll(
      /create\s+trigger\s+(\w+)\s+before\s+([\s\S]*?)\s+on\s+public\."(\w+)"([\s\S]*?)execute\s+(?:function|procedure)\s+public\.(\w+)\s*\(([^)]*)\)\s*;/gi,
    )) {
      if (!/\binsert\b/i.test(m[2])) continue;
      const atuais = porTabela.get(m[3]) ?? [];
      porTabela.set(m[3], [...atuais, m[0], corpos.get(m[5]) ?? '']);
    }
  }
  return porTabela;
}

// ---------------------------------------------------------------------------
// Funções do banco: assinatura e quem pode executar
// ---------------------------------------------------------------------------

export interface ParametroDeFuncao {
  nome: string;
  /** Tem `default`: o chamador pode omitir. */
  opcional: boolean;
}

export type FuncoesDoBanco = Map<string, ParametroDeFuncao[][]>;

/**
 * As funções `public.*` que os arquivos SQL criam, com os nomes dos argumentos.
 *
 * O PostgREST resolve uma chamada por **nome e conjunto de argumentos
 * nomeados**: `rpc('responder_vinculo', { p_vinculo_id, p_acao })` só acha a
 * função se os dois nomes batem com os parâmetros. Um `p_vinculoId` digitado
 * responde `PGRST202` em execução. A lista é de listas porque uma função pode
 * ter sobrecarga, e a chamada vale se casar com QUALQUER uma.
 */
export function lerFuncoes(arquivosSql: string[]): FuncoesDoBanco {
  const mapa: FuncoesDoBanco = new Map();
  for (const t of arquivosSql) {
    // Sem comentários: a prosa dentro deles já citou `create function` de exemplo.
    const sem = t.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
    for (const m of sem.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(/gi)) {
      const inicio = m.index + m[0].length;
      let i = inicio;
      let fundo = 1;
      while (i < sem.length && fundo > 0) {
        if (sem[i] === '(') fundo++;
        if (sem[i] === ')') fundo--;
        i++;
      }
      const params: ParametroDeFuncao[] = [];
      for (const p of dividirNoTopo(sem.slice(inicio, i - 1))) {
        if (/^out\s/i.test(p)) continue;
        const pm = /^(?:(?:in|inout|variadic)\s+)?(\w+)\s+/i.exec(p);
        if (!pm) continue;
        params.push({ nome: pm[1], opcional: /\bdefault\b|\s=\s/i.test(p) });
      }
      mapa.set(m[1], [...(mapa.get(m[1]) ?? []), params]);
    }
  }
  return mapa;
}

export type Execucao = Map<string, Partial<Record<'public' | 'anon' | 'authenticated', boolean>>>;

/**
 * Quem pode executar cada função, depois de todos os `grant`/`revoke`, em ordem.
 *
 * O Postgres deixa `PUBLIC` executar toda função nova; por isso o estado de uma
 * função sem nenhum comando é "pode", e `revoke … from public` é o que fecha. O
 * padrão do projeto é `revoke from anon, public` seguido de `grant to
 * authenticated`, e a ordem importa: um `revoke` depois do `grant` desfaz.
 */
export function lerExecucao(arquivosSql: string[], funcoes?: FuncoesDoBanco): Execucao {
  const mapa: Execucao = new Map();
  for (const t of arquivosSql) {
    // Os comentários saem: o `99-fechar-portas.sql` cita `revoke execute on
    // function public.x(...) from anon` em prosa, para explicar o que NÃO funciona.
    const sem = t.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
    const eventos: Array<{ pos: number; aplicar: () => void }> = [];

    for (const m of sem.matchAll(
      /\b(grant|revoke)\s+(?:execute|all(?:\s+privileges)?)\s+on\s+function\s+public\.(\w+)\s*\([^)]*\)\s+(?:to|from)\s+([^;]+);/gi,
    )) {
      eventos.push({
        pos: m.index,
        aplicar: () => {
          const atual = mapa.get(m[2]) ?? {};
          for (const papel of m[3].split(',').map((x) => x.trim().toLowerCase())) {
            if (papel === 'public' || papel === 'anon' || papel === 'authenticated') {
              atual[papel] = m[1].toLowerCase() === 'grant';
            }
          }
          mapa.set(m[2], atual);
        },
      });
    }

    /*
      A varredura que fecha tudo, por SQL dinâmico.

      `99-fechar-portas.sql` percorre `pg_proc` e roda, por função,
      `execute format('revoke execute on function public.%I(%s) from public,
      anon')` — e devolve o `grant` a `authenticated` só para quem já o alcançava.
      Nenhuma leitura de comandos soltos enxerga isso, e sem modelá-la a prova
      diria que uma função NOVA, sem `revoke` escrito, está aberta ao `anon`,
      quando o laço a fecha no dia em que o arquivo é aplicado.

      Só é modelada quando `funcoes` é passada: ela precisa saber quais funções
      existem naquele ponto da leitura.
    */
    if (funcoes) {
      for (const m of sem.matchAll(/execute\s+format\(\s*'revoke\s+execute\s+on\s+function\s+public\.%I\(%s\)\s+from\s+public,\s*anon'/gi)) {
        eventos.push({
          pos: m.index,
          aplicar: () => {
            for (const nome of funcoes.keys()) {
              const alcancavaAntes = podeExecutar(mapa, nome, 'authenticated');
              mapa.set(nome, { ...(mapa.get(nome) ?? {}), public: false, anon: false, authenticated: alcancavaAntes });
            }
          },
        });
      }
    }

    for (const e of eventos.sort((a, b) => a.pos - b.pos)) e.aplicar();
  }
  return mapa;
}

/**
 * Um papel executa se tem `grant` DIRETO **ou** se `PUBLIC` tem.
 *
 * É a regra que o `99-fechar-portas.sql` conta ter custado caro: o arquivo 11
 * escrevia `revoke execute … from anon`, e isso não fazia nada — `anon` recebia
 * o acesso por `PUBLIC`, e tirar de `anon` o que ele recebe por `PUBLIC` deixa o
 * acesso de pé. A primeira versão desta função cometeu o mesmo equívoco: tratava
 * `revoke from anon` como fechamento. O que fecha é `revoke from public`.
 */
export function podeExecutar(execucao: Execucao, funcao: string, papel: 'anon' | 'authenticated'): boolean {
  const e = execucao.get(funcao) ?? {};
  return e[papel] === true || (e.public ?? true);
}

// ---------------------------------------------------------------------------
// Políticas de acesso
// ---------------------------------------------------------------------------

export type ComandoDePolitica = 'select' | 'insert' | 'update' | 'delete' | 'all';
export interface PoliticaViva {
  tabela: string;
  comando: ComandoDePolitica;
}

/**
 * As políticas que existem depois de todos os arquivos, em ordem.
 *
 * `create policy` acrescenta e `drop policy` tira — e a ordem decide, porque os
 * arquivos fazem `drop policy if exists` antes de recriar. Política citada em
 * comentário não existe: o `99-fechar-portas.sql` descreve em prosa a
 * `notificacao_escreve` que ele derruba.
 */
export function lerPoliticas(arquivosSql: string[]): PoliticaViva[] {
  const vivas = new Map<string, PoliticaViva>();
  for (const t of arquivosSql) {
    const sem = t.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
    const eventos: Array<{ pos: number; aplicar: () => void }> = [];
    for (const m of sem.matchAll(
      /create\s+policy\s+(\w+)\s+on\s+public\."(\w+)"(?:\s+as\s+\w+)?\s+for\s+(select|insert|update|delete|all)\b/gi,
    )) {
      eventos.push({
        pos: m.index,
        aplicar: () => vivas.set(`${m[2]}|${m[1]}`, { tabela: m[2], comando: m[3].toLowerCase() as ComandoDePolitica }),
      });
    }
    for (const m of sem.matchAll(/drop\s+policy\s+(?:if\s+exists\s+)?(\w+)\s+on\s+public\."(\w+)"/gi)) {
      eventos.push({ pos: m.index, aplicar: () => vivas.delete(`${m[2]}|${m[1]}`) });
    }
    for (const e of eventos.sort((a, b) => a.pos - b.pos)) e.aplicar();
  }
  return [...vivas.values()];
}

const politicaCobre = (politicas: PoliticaViva[], tabela: string, op: Exclude<ComandoDePolitica, 'all'>): boolean =>
  politicas.some((p) => p.tabela === tabela && (p.comando === 'all' || p.comando === op));

// ---------------------------------------------------------------------------
// A gramática do select do PostgREST
// ---------------------------------------------------------------------------

type ItemDoSelect =
  | { tipo: 'todas' }
  | { tipo: 'coluna'; nome: string }
  | { tipo: 'embed'; alias: string | null; relacao: string; dicas: string[]; filhos: ItemDoSelect[] };

function dividirNoTopo(texto: string): string[] {
  const partes: string[] = [];
  let fundo = 0;
  let atual = '';
  for (const ch of texto) {
    if (ch === '(') fundo++;
    if (ch === ')') fundo--;
    if (ch === ',' && fundo === 0) {
      partes.push(atual);
      atual = '';
    } else atual += ch;
  }
  if (atual.trim() !== '') partes.push(atual);
  return partes.map((p) => p.trim()).filter(Boolean);
}

export function lerSelect(texto: string): ItemDoSelect[] {
  return dividirNoTopo(texto).map((item): ItemDoSelect => {
    if (item === '*') return { tipo: 'todas' };
    const abre = item.indexOf('(');
    if (abre === -1) {
      // alias:coluna | coluna::cast | coluna->json
      let nome = item.replace(/::.*$/, '');
      const dois = nome.indexOf(':');
      if (dois > -1) nome = nome.slice(dois + 1);
      return { tipo: 'coluna', nome: nome.split('->')[0] };
    }
    let cabeca = item.slice(0, abre);
    const dentro = item.slice(abre + 1, item.lastIndexOf(')'));
    const dois = cabeca.indexOf(':');
    const alias = dois > -1 ? cabeca.slice(0, dois) : null;
    if (dois > -1) cabeca = cabeca.slice(dois + 1);
    const [relacao, ...dicas] = cabeca.split('!');
    return { tipo: 'embed', alias, relacao, dicas, filhos: lerSelect(dentro) };
  });
}

// ---------------------------------------------------------------------------
// Achados
// ---------------------------------------------------------------------------

export type TipoDeAchado =
  | 'TABELA'
  | 'COLUNA'
  | 'EMBED'
  | 'AMBIGUO'
  | 'DICA'
  | 'OBRIGATORIA'
  | 'RPC'
  | 'POLITICA'
  | 'NAO_RESOLVIDO';

export interface Achado {
  arquivo: string;
  linha: number;
  tabela: string;
  tipo: TipoDeAchado;
  mensagem: string;
}

export interface Estatistica {
  cadeias: number;
  selects: number;
  filtros: number;
  escritas: number;
  dicas: number;
  rpcs: number;
  /** Pares (tabela, operação) conferidos contra as políticas. */
  operacoes: number;
  /** `.storage.from('balde')` — olhado e descartado, porque balde não é tabela. */
  armazenamento: number;
}

const FILTROS = new Set([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'is',
  'in',
  'like',
  'ilike',
  'not',
  'order',
  'contains',
  'overlaps',
]);

/** Receptores cujo `.from(` é do JavaScript. Qualquer outro é tratado como o banco. */
const CONSTRUTORES_NATIVOS = new Set(['Buffer', 'Array', 'Uint8Array', 'Int8Array', 'Float32Array', 'Float64Array', 'Set', 'Map', 'Object']);

export interface EntradaDaAnalise {
  arquivo: string;
  fonte: string;
  esquema: Esquema;
  constraints: Map<string, ConstraintFk>;
  /** Sem isto a regra "obrigatória sem quem preencha" não é conferida. */
  evidencias?: Map<string, string[]>;
  /** Sem isto as chamadas `rpc(...)` não são conferidas. */
  funcoes?: FuncoesDoBanco;
  /** Sem isto o privilégio de execução das funções chamadas não é conferido. */
  execucao?: Execucao;
  /** Sem isto a regra "toda operação do SDK tem política" não é conferida. */
  politicas?: PoliticaViva[];
}

export interface ResultadoDaAnalise {
  achados: Achado[];
  estatistica: Estatistica;
  /** Por tabela, as colunas que algum `insert`/`upsert` do SDK manda. */
  escritasPorTabela: Map<string, Set<string>>;
}

export function analisarSdk(entrada: EntradaDaAnalise): ResultadoDaAnalise {
  const { arquivo, fonte, esquema, constraints, evidencias, funcoes, execucao, politicas } = entrada;
  const raiz = ts.createSourceFile(arquivo, fonte, ts.ScriptTarget.Latest, true);
  const achados: Achado[] = [];
  const estatistica: Estatistica = { cadeias: 0, selects: 0, filtros: 0, escritas: 0, dicas: 0, rpcs: 0, operacoes: 0, armazenamento: 0 };
  const escritasPorTabela = new Map<string, Set<string>>();

  const linhaDe = (no: ts.Node): number => raiz.getLineAndCharacterOfPosition(no.getStart()).line + 1;
  const achar = (no: ts.Node, tabela: string, tipo: TipoDeAchado, mensagem: string): void => {
    achados.push({ arquivo, linha: linhaDe(no), tabela, tipo, mensagem });
  };

  // --- constantes que o SDK usa como texto (`static readonly CAMPOS_X = '…'`) ---
  const constantes = new Map<string, ts.Expression>();
  const coletar = (no: ts.Node): void => {
    if (ts.isPropertyDeclaration(no) && no.initializer && ts.isIdentifier(no.name)) {
      const dono = ts.isClassDeclaration(no.parent) && no.parent.name ? no.parent.name.text : null;
      constantes.set(dono ? `${dono}.${no.name.text}` : no.name.text, no.initializer);
    }
    if (ts.isVariableDeclaration(no) && no.initializer && ts.isIdentifier(no.name)) {
      constantes.set(no.name.text, no.initializer);
    }
    ts.forEachChild(no, coletar);
  };
  coletar(raiz);

  const funcaoQueContem = (no: ts.Node): ts.SignatureDeclaration | null => {
    let atual: ts.Node | undefined = no.parent;
    while (atual && !ts.isFunctionLike(atual)) atual = atual.parent;
    return atual ?? null;
  };

  /**
   * Os textos que a expressão pode ter — uma lista, porque um condicional tem
   * dois ramos —, ou `null` se alguma parte é de fato dinâmica.
   */
  const textosDe = (no: ts.Node | undefined, fundo = 0): string[] | null => {
    if (!no || fundo > 8) return null;
    if (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) return [no.text];
    if (ts.isParenthesizedExpression(no) || ts.isAsExpression(no) || ts.isNonNullExpression(no)) {
      return textosDe(no.expression, fundo + 1);
    }
    if (ts.isBinaryExpression(no) && no.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const a = textosDe(no.left, fundo + 1);
      const b = textosDe(no.right, fundo + 1);
      if (!a || !b) return null;
      return a.flatMap((x) => b.map((y) => x + y));
    }
    if (ts.isConditionalExpression(no)) {
      const a = textosDe(no.whenTrue, fundo + 1);
      const b = textosDe(no.whenFalse, fundo + 1);
      return a && b ? [...a, ...b] : null;
    }
    if (ts.isTemplateExpression(no)) {
      let acc = [no.head.text];
      for (const span of no.templateSpans) {
        const e = textosDe(span.expression, fundo + 1);
        if (!e) return null;
        acc = acc.flatMap((x) => e.map((y) => x + y + span.literal.text));
      }
      return acc;
    }
    if (ts.isPropertyAccessExpression(no) || ts.isIdentifier(no)) {
      const alvo = constantes.get(no.getText().replace(/^this\./, ''));
      if (alvo) return textosDe(alvo, fundo + 1);
      // Parâmetro tipado com união de literais: `campo: 'pesoKg' | 'cinturaCm'`.
      if (ts.isIdentifier(no)) {
        const fn = funcaoQueContem(no);
        const param = fn?.parameters.find((p) => ts.isIdentifier(p.name) && p.name.text === no.text);
        if (param?.type) {
          const tipos = ts.isUnionTypeNode(param.type) ? [...param.type.types] : [param.type];
          const literais = tipos.map((t) =>
            ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal) ? t.literal.text : null,
          );
          if (literais.length > 0 && literais.every((x): x is string => x !== null)) return literais;
        }
      }
    }
    return null;
  };

  /**
   * Só o texto FIXO de uma expressão, com `§` no lugar de cada `${…}`.
   *
   * Serve a `.or('criadoEm.lt.${quando},id.lt.${cursor}')`, em que os valores
   * são de execução mas os nomes de coluna não são.
   */
  const fragmentos = (no: ts.Node): string[] => {
    const saida: string[] = [];
    const visitar = (n: ts.Node): void => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) saida.push(n.text);
      else if (ts.isTemplateExpression(n)) {
        saida.push([n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join('§'));
      } else ts.forEachChild(n, visitar);
    };
    visitar(no);
    return saida;
  };

  // --- os literais de objeto que uma escrita grava ---
  interface Escrita {
    chaves: string[];
    temSpread: boolean;
  }
  const escritasDe = (no: ts.Node | undefined, fundo = 0): Escrita[] | null => {
    if (!no || fundo > 6) return null;
    if (ts.isParenthesizedExpression(no) || ts.isAsExpression(no)) return escritasDe(no.expression, fundo + 1);

    if (ts.isObjectLiteralExpression(no)) {
      const chaves: string[] = [];
      let temSpread = false;
      for (const prop of no.properties) {
        if (ts.isSpreadAssignment(prop)) temSpread = true;
        else if (prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))) chaves.push(prop.name.text);
      }
      return [{ chaves, temSpread }];
    }

    // `const campos = {}; campos.nome = …;` — o objeto montado aos poucos.
    if (ts.isIdentifier(no)) {
      const fn = funcaoQueContem(no) as ts.FunctionLikeDeclaration | null;
      if (!fn?.body) return null;
      let inicial: ts.ObjectLiteralExpression | null = null;
      const extras: string[] = [];
      const varrer = (n: ts.Node): void => {
        if (
          ts.isVariableDeclaration(n) &&
          ts.isIdentifier(n.name) &&
          n.name.text === no.text &&
          n.initializer &&
          ts.isObjectLiteralExpression(n.initializer)
        ) {
          inicial = n.initializer;
        }
        if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
          const l = n.left;
          if (ts.isPropertyAccessExpression(l) && ts.isIdentifier(l.expression) && l.expression.text === no.text) {
            extras.push(l.name.text);
          } else if (
            ts.isElementAccessExpression(l) &&
            ts.isIdentifier(l.expression) &&
            l.expression.text === no.text &&
            ts.isStringLiteral(l.argumentExpression)
          ) {
            extras.push(l.argumentExpression.text);
          }
        }
        ts.forEachChild(n, varrer);
      };
      varrer(fn.body);
      if (!inicial) return null;
      const lit: ts.ObjectLiteralExpression = inicial;
      const base = escritasDe(lit, fundo + 1);
      if (!base) return null;
      return [{ chaves: [...base[0].chaves, ...extras], temSpread: base[0].temSpread }];
    }

    if (ts.isArrayLiteralExpression(no)) {
      const todas: Escrita[] = [];
      for (const e of no.elements) {
        if (ts.isSpreadElement(e)) return null;
        const o = escritasDe(e, fundo + 1);
        if (!o) return null;
        todas.push(...o);
      }
      return todas;
    }

    // `lista.map((x) => ({ … }))` — vale o objeto que o callback devolve.
    if (ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression) && no.expression.name.text === 'map') {
      const cb = no.arguments[0];
      if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) {
        if (!ts.isBlock(cb.body)) return escritasDe(cb.body, fundo + 1);
        const devolvidos: ts.Expression[] = [];
        const achar2 = (n: ts.Node): void => {
          if (ts.isReturnStatement(n) && n.expression) devolvidos.push(n.expression);
          else if (!ts.isFunctionLike(n)) ts.forEachChild(n, achar2);
        };
        ts.forEachChild(cb.body, achar2);
        const todas: Escrita[] = [];
        for (const d of devolvidos) {
          const o = escritasDe(d, fundo + 1);
          if (!o) return null;
          todas.push(...o);
        }
        return todas.length > 0 ? todas : null;
      }
    }
    return null;
  };

  // --- conferência de uma árvore de select ---
  const entreTabelas = (a: string, b: string): ConstraintFk[] =>
    [...constraints.values()].filter((c) => (c.tabela === a && c.alvo === b) || (c.tabela === b && c.alvo === a));

  const conferirSelect = (
    itens: ItemDoSelect[],
    tabela: string,
    no: ts.Node,
    aliases: Map<string, string>,
    contexto: string,
    dentroDeEmbed: boolean,
  ): void => {
    for (const it of itens) {
      if (it.tipo === 'coluna') {
        // `Tabela(count)` é o agregado de contagem do PostgREST, e não coluna.
        if (it.nome === 'count' && dentroDeEmbed) continue;
        if (!ehColuna(esquema, tabela, it.nome)) {
          achar(no, tabela, 'COLUNA', `${contexto}: "${it.nome}" não é coluna de ${tabela}`);
        }
      } else if (it.tipo === 'embed') {
        const alvo = it.relacao;
        if (!esquema.has(alvo)) {
          achar(no, tabela, 'EMBED', `${contexto}: embed "${alvo}" não é uma tabela`);
          continue;
        }
        aliases.set(it.alias ?? alvo, alvo);
        const ligacoes = entreTabelas(tabela, alvo);
        const dicasDeNome = it.dicas.filter((d) => d !== 'inner' && d !== 'left');
        estatistica.dicas += dicasDeNome.length;

        // Cada dica que nomeia uma constraint tem de ser uma que liga ESTAS duas.
        for (const dica of dicasDeNome) {
          const c = constraints.get(dica);
          if (c) {
            const liga = (c.tabela === tabela && c.alvo === alvo) || (c.tabela === alvo && c.alvo === tabela);
            if (!liga) {
              achar(no, tabela, 'DICA', `${contexto}: a constraint "${dica}" liga ${c.tabela}→${c.alvo}, e não ${tabela}↔${alvo}`);
            }
          } else if (!ehColuna(esquema, tabela, dica) && !ehColuna(esquema, alvo, dica)) {
            achar(no, tabela, 'DICA', `${contexto}: "${dica}" não é constraint nem coluna de ${tabela}/${alvo}`);
          }
        }

        if (ligacoes.length === 0) {
          // Muitos-para-muitos por tabela de junção: o PostgREST resolve sozinho,
          // mas só se a junção tem chave estrangeira SAINDO dela para as DUAS.
          // A primeira versão aceitava qualquer tabela ligada às duas em qualquer
          // direção — e deixou passar um embed sem relação nenhuma, que a amostra
          // ruim "embed sem chave estrangeira" acusou.
          const aponta = (de: string, para: string): boolean =>
            [...constraints.values()].some((c) => c.tabela === de && c.alvo === para);
          const juncao = [...esquema.keys()].some((j) => j !== tabela && j !== alvo && aponta(j, tabela) && aponta(j, alvo));
          if (!juncao) achar(no, tabela, 'EMBED', `${contexto}: não há chave estrangeira entre ${tabela} e ${alvo}`);
        } else if (ligacoes.length > 1 && dicasDeNome.length === 0 && tabela !== alvo) {
          achar(
            no,
            tabela,
            'AMBIGUO',
            `${contexto}: ${tabela}↔${alvo} tem ${ligacoes.length} chaves (${ligacoes.map((l) => l.nome).join(', ')}) e o embed não diz qual`,
          );
        }
        conferirSelect(it.filhos, alvo, no, new Map(), `${contexto} > ${alvo}`, true);
      }
    }
  };

  const conferirColunaDeFiltro = (
    no: ts.Node,
    tabela: string,
    metodo: string,
    bruto: string,
    aliases: Map<string, string>,
  ): void => {
    const nome = bruto.split('->')[0];
    // `.not('feedback', 'is', null)` filtra pela PRESENÇA do embed `feedback`.
    if (aliases.has(nome)) return;
    if (nome.includes('.')) {
      const [al, col] = nome.split('.');
      const alvo = aliases.get(al);
      if (!alvo) achar(no, tabela, 'COLUNA', `${metodo}("${nome}"): "${al}" não é embed deste select`);
      else if (!ehColuna(esquema, alvo, col)) achar(no, tabela, 'COLUNA', `${metodo}("${nome}"): "${col}" não é coluna de ${alvo}`);
      return;
    }
    if (!ehColuna(esquema, tabela, nome)) {
      achar(no, tabela, 'COLUNA', `${metodo}("${nome}"): não é coluna de ${tabela}`);
    }
  };

  // --- varredura das cadeias ---
  const conferirRpc = (no: ts.CallExpression): void => {
    estatistica.rpcs++;
    const nomes = textosDe(no.arguments[0]);
    if (!nomes) {
      // O embrulho `async rpc(nome, args) { return this.db.rpc(nome, args) }` é
      // genérico por natureza: quem tem nome estático são os chamadores dele.
      const fn = funcaoQueContem(no);
      const nomeDoMetodo = fn?.name && ts.isIdentifier(fn.name) ? fn.name.text : null;
      if (nomeDoMetodo !== 'rpc') {
        achar(no, '?', 'NAO_RESOLVIDO', `rpc(${no.arguments[0]?.getText().slice(0, 40)}) não tem nome estático`);
      }
      return;
    }
    if (!funcoes) return;
    for (const nome of nomes) {
      const sobrecargas = funcoes.get(nome);
      if (!sobrecargas) {
        achar(no, nome, 'RPC', `rpc("${nome}"): não existe função public.${nome} nos arquivos SQL`);
        continue;
      }
      const escritas = no.arguments[1] ? escritasDe(no.arguments[1]) : [{ chaves: [], temSpread: false }];
      if (!escritas) {
        achar(no, nome, 'NAO_RESOLVIDO', `rpc("${nome}"): os argumentos não são um objeto estático`);
      } else {
        for (const e of escritas) {
          const casa = sobrecargas.some((params) => {
            const nomesDosParams = params.map((p) => p.nome);
            const sobra = e.chaves.filter((k) => !nomesDosParams.includes(k));
            const falta = e.temSpread ? [] : params.filter((p) => !p.opcional && !e.chaves.includes(p.nome));
            return sobra.length === 0 && falta.length === 0;
          });
          if (!casa) {
            const assinaturas = sobrecargas
              .map((ps) => `(${ps.map((p) => p.nome + (p.opcional ? '?' : '')).join(', ')})`)
              .join(' | ');
            achar(no, nome, 'RPC', `rpc("${nome}", {${e.chaves.join(', ')}}) não casa com a função: ${assinaturas}`);
          }
        }
      }
      if (execucao && !podeExecutar(execucao, nome, 'authenticated')) {
        achar(no, nome, 'RPC', `rpc("${nome}"): ninguém autenticado pode executar (revoke sem grant para authenticated)`);
      }
    }
  };

  const visitar = (no: ts.Node): void => {
    if (ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression) && no.expression.name.text === 'rpc') {
      conferirRpc(no);
    }
    if (ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression) && no.expression.name.text === 'from') {
      const receptor = no.expression.expression.getText();
      if (/\.storage$/.test(receptor)) {
        estatistica.armazenamento++;
      } else if (CONSTRUTORES_NATIVOS.has(receptor)) {
        // `Buffer.from(base64, 'base64')`, `Array.from(texto, …)`: `from` do
        // JavaScript, e não do cliente do banco. Descartado pelo RECEPTOR, e não
        // por "o argumento não parece nome de tabela" — é o receptor que diz o que
        // a chamada é, e o resto deixa passar um `db.from(variavel)` de verdade.
      } else {
        const tabelas = textosDe(no.arguments[0]);
        if (!tabelas) {
          achar(no, '?', 'NAO_RESOLVIDO', `from(${no.arguments[0]?.getText().slice(0, 40)}) não tem nome estático`);
        } else {
          conferirCadeia(no, tabelas);
        }
      }
    }
    ts.forEachChild(no, visitar);
  };

  const conferirCadeia = (inicio: ts.CallExpression, tabelas: string[]): void => {
    const passos: Array<{ metodo: string; args: readonly ts.Expression[]; no: ts.CallExpression }> = [];
    let atual: ts.Node = inicio;
    for (;;) {
      const pai: ts.Node = atual.parent;
      if (
        ts.isPropertyAccessExpression(pai) &&
        pai.expression === atual &&
        ts.isCallExpression(pai.parent) &&
        pai.parent.expression === pai
      ) {
        passos.push({ metodo: pai.name.text, args: pai.parent.arguments, no: pai.parent });
        atual = pai.parent;
      } else break;
    }

    for (const tabela of tabelas) {
      estatistica.cadeias++;
      if (!esquema.has(tabela)) {
        achar(inicio, tabela, 'TABELA', `from("${tabela}"): não é uma tabela do esquema`);
        continue;
      }
      const aliases = new Map<string, string>();

      /*
        Cada operação que a cadeia faz precisa de uma política que a cubra. Sem
        ela o RLS nega EM SILÊNCIO — o `delete` não apaga ninguém e o `update`
        devolve zero linhas, sem erro —, e o `99-fechar-portas.sql` ainda revoga
        o `grant` da operação que não tem política. `upsert` é insert E update.
      */
      if (politicas) {
        const ops = new Set<'select' | 'insert' | 'update' | 'delete'>();
        for (const p of passos) {
          if (p.metodo === 'select' || p.metodo === 'insert' || p.metodo === 'update' || p.metodo === 'delete') ops.add(p.metodo);
          if (p.metodo === 'upsert') {
            ops.add('insert');
            ops.add('update');
          }
        }
        for (const op of ops) {
          estatistica.operacoes++;
          if (!politicaCobre(politicas, tabela, op)) {
            achar(inicio, tabela, 'POLITICA', `${op} em ${tabela}: nenhuma política cobre este comando (o RLS nega em silêncio)`);
          }
        }
      }

      for (const p of passos.filter((x) => x.metodo === 'select')) {
        estatistica.selects++;
        const textos = p.args.length > 0 ? textosDe(p.args[0]) : ['*'];
        if (!textos) {
          achar(p.no, tabela, 'NAO_RESOLVIDO', `select(${p.args[0].getText().replace(/\s+/g, ' ').slice(0, 50)}) não tem texto estático`);
          continue;
        }
        for (const t of textos) conferirSelect(lerSelect(t), tabela, p.no, aliases, 'select', false);
      }

      for (const p of passos) {
        if (p.metodo === 'or' && p.args.length > 0) {
          estatistica.filtros++;
          for (const f of fragmentos(p.args[0])) {
            for (const m of f.matchAll(/(?:^|[,(])\s*([A-Za-z_][\w.]*)\.(?:eq|neq|gt|gte|lt|lte|like|ilike|is|in|not|cs|cd)\./g)) {
              conferirColunaDeFiltro(p.no, tabela, 'or', m[1], aliases);
            }
          }
          continue;
        }
        if (!FILTROS.has(p.metodo) || p.args.length === 0) continue;
        estatistica.filtros++;
        const nomes = textosDe(p.args[0]);
        if (!nomes) {
          achar(p.no, tabela, 'NAO_RESOLVIDO', `${p.metodo}(${p.args[0].getText().slice(0, 40)}) não tem nome estático`);
          continue;
        }
        const ref =
          p.metodo === 'order' && p.args[1] ? /referencedTable\s*:\s*['"]([^'"]+)['"]/.exec(p.args[1].getText()) : null;
        for (const n of nomes) {
          if (ref) {
            const alvo = aliases.get(ref[1]) ?? ref[1];
            if (!ehColuna(esquema, alvo, n.split('->')[0])) {
              achar(p.no, tabela, 'COLUNA', `order em ${ref[1]}: "${n}" não é coluna de ${alvo}`);
            }
          } else conferirColunaDeFiltro(p.no, tabela, p.metodo, n, aliases);
        }
      }

      for (const p of passos) {
        if (!['insert', 'update', 'upsert'].includes(p.metodo) || p.args.length === 0) continue;
        const escritas = escritasDe(p.args[0]);
        if (!escritas) {
          achar(p.no, tabela, 'NAO_RESOLVIDO', `${p.metodo}(${p.args[0].getText().replace(/\s+/g, ' ').slice(0, 50)}) não tem objeto estático`);
          continue;
        }
        for (const e of escritas) {
          estatistica.escritas++;
          if (p.metodo === 'insert' || p.metodo === 'upsert') {
            const ja = escritasPorTabela.get(tabela) ?? new Set<string>();
            for (const k of e.chaves) ja.add(k);
            escritasPorTabela.set(tabela, ja);
          }
          for (const k of e.chaves) {
            if (!ehColuna(esquema, tabela, k)) achar(p.no, tabela, 'COLUNA', `${p.metodo}: "${k}" não é coluna de ${tabela}`);
          }
          if (p.metodo === 'insert' && !e.temSpread && evidencias) {
            for (const c of colunasObrigatoriasNoInsert(esquema, tabela)) {
              if (e.chaves.includes(c)) continue;
              if (!colunaTemQuemPreencha(c, evidencias.get(tabela) ?? [])) {
                achar(p.no, tabela, 'OBRIGATORIA', `insert não manda "${c}" e nenhum gatilho de before insert em ${tabela} a preenche`);
              }
            }
          }
        }
      }
    }
  };

  visitar(raiz);
  return { achados, estatistica, escritasPorTabela };
}

/**
 * As colunas que o SDK manda em cada tabela — a pergunta que `auditar-rls.ts`
 * fazia por raspagem de texto.
 *
 * Quem consome é o auditor contra o banco de verdade: para cada coluna
 * obrigatória que o SDK NÃO manda, ele exige que algum gatilho a preencha. A
 * raspagem anterior lia qualquer `palavra:` dentro de 30 linhas do `insert`, e
 * isso errava para o lado de declarar preenchida uma coluna que ninguém manda.
 */
export function colunasQueOSdkPreenche(fonte: string, esquema: Esquema): Map<string, Set<string>> {
  return analisarSdk({ arquivo: 'supabase.ts', fonte, esquema, constraints: new Map() }).escritasPorTabela;
}
