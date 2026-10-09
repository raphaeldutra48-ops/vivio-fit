import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analisarSdk,
  colunasObrigatoriasNoInsert,
  colunasQueOSdkPreenche,
  evidenciasDeGatilhos,
  lerConstraints,
  lerEsquema,
  lerExecucao,
  lerFuncoes,
  lerPoliticas,
  lerSelect,
  podeExecutar,
  type Achado,
  type TipoDeAchado,
} from './sdk-x-esquema';

/**
 * O SDK confrontado com o esquema — sem banco.
 *
 * Duas partes, e a ordem importa. A primeira prova que o **conferidor sabe
 * acusar**, com um esquema de brinquedo e trechos de SDK certos e errados
 * passando pelo mesmo caminho da varredura de verdade. A segunda aplica o
 * conferidor ao repositório.
 *
 * Sem a primeira, a segunda não vale nada: "nenhum achado" é também a resposta
 * de uma checagem quebrada. Este projeto já aprovou tudo sem olhar três vezes —
 * um regex que perdeu a barra invertida, um critério que aceitava o que devia
 * recusar, um byte de controle no lugar de `\b` — e todas as três passavam na
 * varredura do repositório inteiro, porque o repositório estava limpo.
 */

// ---------------------------------------------------------------------------
// 1. O conferidor sabe acusar
// ---------------------------------------------------------------------------

/*
  Brinquedo com a ambiguidade que importa: `Plano` tem DUAS chaves para `User`
  (dono e revisor). Um embed `User(...)` a partir de `Plano` é ambíguo para o
  PostgREST, que responde PGRST201 em execução.
*/
const ESQUEMA_DE_BRINQUEDO = lerEsquema(`
model User {
  id           String   @id @default(cuid())
  nome         String
  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt
  planos       Plano[]  @relation("Dono")
  revisados    Plano[]  @relation("Revisor")
}

/// Um comentário em bloco com prosa não pode virar coluna.
/*
  Texto que guardar consegue cobrir: nada disto é campo.
*/
model Plano {
  id           String   @id @default(cuid())
  nome         String
  donoId       String
  revisorId    String?
  dono         User     @relation("Dono", fields: [donoId], references: [id])
  revisor      User?    @relation("Revisor", fields: [revisorId], references: [id])
  itens        Item[]
  etiquetas    PlanoEtiqueta[]
  atualizadoEm DateTime @updatedAt
}

model Etiqueta {
  id     String @id @default(cuid())
  nome   String
  planos PlanoEtiqueta[]
}

model PlanoEtiqueta {
  planoId    String
  etiquetaId String
  plano      Plano    @relation(fields: [planoId], references: [id])
  etiqueta   Etiqueta @relation(fields: [etiquetaId], references: [id])
}

model Item {
  id      String @id @default(cuid())
  planoId String
  plano   Plano  @relation(fields: [planoId], references: [id])
  nome    String
  ativo   Boolean @default(true)
}
`);

const CONSTRAINTS_DE_BRINQUEDO = lerConstraints([
  `
ALTER TABLE "Plano" ADD CONSTRAINT "Plano_donoId_fkey" FOREIGN KEY ("donoId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "Plano" ADD CONSTRAINT "Plano_revisorId_fkey" FOREIGN KEY ("revisorId") REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "Item" ADD CONSTRAINT "Item_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "Plano"("id") ON DELETE CASCADE;
ALTER TABLE "PlanoEtiqueta" ADD CONSTRAINT "PlanoEtiqueta_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "Plano"("id");
ALTER TABLE "PlanoEtiqueta" ADD CONSTRAINT "PlanoEtiqueta_etiquetaId_fkey" FOREIGN KEY ("etiquetaId") REFERENCES "Etiqueta"("id");
`,
]);

/** Quem preenche `atualizadoEm` em Plano — o que torna o insert sem a coluna legítimo. */
const GATILHO_DO_PLANO = new Map<string, string[]>([
  ['Plano', ['create trigger t before insert on public."Plano" execute function public.f();', 'new."atualizadoEm" := now();']],
]);

/** Roda o conferidor sobre UM trecho, embrulhado como método de uma classe de SDK. */
function conferir(trecho: string, comGatilhos = true): Achado[] {
  const fonte = `
    class Motor {
      static readonly CAMPOS_PLANO = 'id,nome';
      constructor(private db: any) {}
      async metodo(campo: 'nome' | 'donoId', lado: string, quando: string, palavras: string[], ids: string[]) {
        ${trecho}
      }
    }`;
  return analisarSdk({
    arquivo: 'amostra.ts',
    fonte,
    esquema: ESQUEMA_DE_BRINQUEDO,
    constraints: CONSTRAINTS_DE_BRINQUEDO,
    evidencias: comGatilhos ? GATILHO_DO_PLANO : undefined,
  }).achados;
}

const tipos = (a: Achado[]): TipoDeAchado[] => a.map((x) => x.tipo);

describe('amostras RUINS: cada erro de digitação é acusado, com o tipo certo', () => {
  const RUINS: Array<[string, string, TipoDeAchado]> = [
    ['tabela com letras trocadas', `await this.db.from('Plnao').select('id');`, 'TABELA'],
    ['coluna com letras trocadas no select', `await this.db.from('Plano').select('id,nmoe');`, 'COLUNA'],
    ['coluna inexistente dentro de um embed', `await this.db.from('Item').select('id,plano:Plano(id,nmoe)');`, 'COLUNA'],
    ['coluna inexistente em eq', `await this.db.from('Item').select('id').eq('plnaoId', 'x');`, 'COLUNA'],
    ['coluna inexistente em order', `await this.db.from('Item').select('id').order('criadoEm');`, 'COLUNA'],
    ['coluna inexistente em is', `await this.db.from('Item').select('id').is('deletadoEm', null);`, 'COLUNA'],
    ['filtro em embed que não está no select', `await this.db.from('Item').select('id').eq('plano.nome', 'x');`, 'COLUNA'],
    ['coluna inexistente no filtro de embed', `await this.db.from('Item').select('id,plano:Plano(id)').eq('plano.nmoe', 'x');`, 'COLUNA'],
    ['coluna inexistente em or()', `await this.db.from('Item').select('id').or('nome.eq.a,corr.eq.b');`, 'COLUNA'],
    ['chave inexistente em insert', `await this.db.from('Item').insert({ id: 'x', planoId: 'p', nome: 'a', cor: 'azul' });`, 'COLUNA'],
    ['chave inexistente em update', `await this.db.from('Item').update({ nmoe: 'a' }).eq('id', 'x');`, 'COLUNA'],
    ['chave inexistente no objeto montado aos poucos', `const c: Record<string, unknown> = {}; c.nmoe = 1; await this.db.from('Item').update(c).eq('id', 'x');`, 'COLUNA'],
    ['chave inexistente no callback de map', `await this.db.from('Item').insert(ids.map((i) => ({ id: i, planoId: 'p', nome: 'a', cor: 'x' })));`, 'COLUNA'],
    ['count fora de embed não é agregado, é coluna', `await this.db.from('Plano').select('id,count');`, 'COLUNA'],
    ['embed para tabela inexistente', `await this.db.from('Plano').select('id,x:Itens(id)');`, 'EMBED'],
    ['embed sem chave estrangeira entre as tabelas', `await this.db.from('Item').select('id,u:User(id)');`, 'EMBED'],
    ['embed sem junção: Item não chega a Etiqueta nem por tabela intermediária', `await this.db.from('Item').select('id,e:Etiqueta(id)');`, 'EMBED'],
    ['embed ambíguo: duas chaves para User e nenhuma dica', `await this.db.from('Plano').select('id,u:User(id)');`, 'AMBIGUO'],
    ['dica com o nome de uma constraint que liga outras tabelas', `await this.db.from('Plano').select('id,u:User!Item_planoId_fkey(id)');`, 'DICA'],
    ['dica com nome de constraint que não existe', `await this.db.from('Plano').select('id,u:User!Plano_donoId_fkex(id)');`, 'DICA'],
    ['insert sem coluna obrigatória e sem quem a preencha', `await this.db.from('Item').insert({ id: 'x', planoId: 'p' });`, 'OBRIGATORIA'],
    ['insert sem atualizadoEm numa tabela SEM gatilho', `await this.db.from('User').insert({ id: 'x', nome: 'a' });`, 'OBRIGATORIA'],
    ['nome de tabela dinâmico', `const t = ids[0]; await this.db.from(t).select('id');`, 'NAO_RESOLVIDO'],
    ['select dinâmico', `await this.db.from('Plano').select(palavras[0]);`, 'NAO_RESOLVIDO'],
    ['filtro de coluna dinâmico', `await this.db.from('Plano').select('id').eq(palavras[0], 'x');`, 'NAO_RESOLVIDO'],
    ['escrita que não é objeto estático', `await this.db.from('Item').update(ids[0]).eq('id', 'x');`, 'NAO_RESOLVIDO'],
  ];

  for (const [nome, trecho, esperado] of RUINS) {
    it(nome, () => {
      const achados = conferir(trecho);
      expect(tipos(achados), JSON.stringify(achados.map((a) => a.mensagem))).toContain(esperado);
    });
  }

  it('o relatório diz a linha e a tabela, e não só que algo está errado', () => {
    const [achado] = conferir(`await this.db.from('Plano').select('id,nmoe');`);
    expect(achado!.tabela).toBe('Plano');
    expect(achado!.linha).toBeGreaterThan(0);
    expect(achado!.mensagem).toMatch(/nmoe/);
  });
});

describe('amostras BOAS: o que é válido NÃO é acusado', () => {
  const BOAS: Array<[string, string]> = [
    ['select simples e filtros certos', `await this.db.from('Item').select('id,nome').eq('planoId', 'p').order('nome').is('ativo', null);`],
    ['embed desambiguado pela constraint', `await this.db.from('Plano').select('id,dono:User!Plano_donoId_fkey(id,nome)');`],
    ['os dois embeds, cada um com a sua constraint', `await this.db.from('Plano').select('id,dono:User!Plano_donoId_fkey(id),rev:User!Plano_revisorId_fkey(id)');`],
    ['embed por chave que não é ambígua', `await this.db.from('Plano').select('id,itens:Item(id,nome)');`],
    ['embed para o lado do pai, com a constraint na outra direção', `await this.db.from('Item').select('id,plano:Plano(id)');`],
    ['!inner junto da constraint', `await this.db.from('Plano').select('id,dono:User!Plano_donoId_fkey!inner(id)');`],
    ['agregado count dentro de embed', `await this.db.from('Plano').select('id,itens:Item(count)');`],
    ['filtro por presença do embed, que é o alias', `await this.db.from('Item').select('id,plano:Plano!inner(id)').not('plano', 'is', null);`],
    ['filtro de coluna do embed pelo alias', `await this.db.from('Item').select('id,plano:Plano(id,nome)').eq('plano.nome', 'x');`],
    ['select por constante estática da classe', `await this.db.from('Plano').select(Motor.CAMPOS_PLANO);`],
    ['select por template com a constante', `await this.db.from('Plano').select(\`\${Motor.CAMPOS_PLANO},itens:Item(count)\`);`],
    ['select montado por concatenação', `await this.db.from('Plano').select('id,' + 'nome');`],
    ['coluna por parâmetro tipado com união de literais', `await this.db.from('Plano').select(campo).not(campo, 'is', null);`],
    ['ramos de um condicional', `await this.db.from('Plano').select('id').eq(lado === 'a' ? 'donoId' : 'revisorId', 'x');`],
    ['or() com valores de execução e colunas fixas', `await this.db.from('Item').select('id').or(\`nome.lt.\${quando},and(nome.eq.\${quando},id.lt.\${lado})\`);`],
    ['or() montado por map/join', `await this.db.from('Item').select('id').or(palavras.map((p) => \`nome.ilike.%\${p}%\`).join(','));`],
    ['insert completo, com o gatilho preenchendo atualizadoEm', `await this.db.from('Plano').insert({ id: 'x', nome: 'a', donoId: 'u' });`],
    ['insert por map de callback', `await this.db.from('Item').insert(ids.map((i) => ({ id: i, planoId: 'p', nome: 'a' })));`],
    ['insert por map com bloco e return', `await this.db.from('Item').insert(ids.map((i) => { return { id: i, planoId: 'p', nome: 'a' }; }));`],
    ['insert com spread: as chaves que faltam podem vir dele', `await this.db.from('Item').insert({ ...ids, id: 'x' });`],
    ['update com objeto montado aos poucos', `const c: Record<string, unknown> = {}; if (lado) c.nome = 1; await this.db.from('Item').update(c).eq('id', 'x');`],
    ['upsert com a lista inteira', `await this.db.from('Item').upsert([{ id: 'a', planoId: 'p', nome: 'x' }]);`],
    ['muitos-para-muitos pela tabela de junção, que tem as duas chaves SAINDO dela', `await this.db.from('Plano').select('id,e:Etiqueta(id,nome)');`],
    ['Buffer.from é do JavaScript, e não do banco', `const b = Buffer.from('abc', 'base64'); return b;`],
    ['Array.from também', `return Array.from(ids, (c) => c);`],
    ['balde de armazenamento não é tabela', `await this.db.storage.from('fotos').upload('a', 'b');`],
    ['order em tabela referenciada', `await this.db.from('Plano').select('id,itens:Item(id,nome)').order('nome', { referencedTable: 'itens' });`],
  ];

  for (const [nome, trecho] of BOAS) {
    it(nome, () => {
      const achados = conferir(trecho);
      expect(achados.map((a) => `${a.tipo}: ${a.mensagem}`)).toEqual([]);
    });
  }

  it('sem evidência de gatilho, a regra das obrigatórias não é conferida', () => {
    // É o que `evidencias` ausente significa: o chamador não tem os SQLs. Dizer
    // "sem quem preencha" sem ter olhado seria acusar no escuro.
    const achados = conferir(`await this.db.from('Item').insert({ id: 'x', planoId: 'p' });`, false);
    expect(tipos(achados)).not.toContain('OBRIGATORIA');
  });
});

describe('o esquema de brinquedo foi lido como se espera', () => {
  it('prosa de comentário em bloco não vira coluna', () => {
    const colunas = [...ESQUEMA_DE_BRINQUEDO.get('Plano')!.keys()];
    expect(colunas).not.toContain('Texto');
    expect(colunas).not.toContain('guardar');
    expect(colunas).toContain('revisorId');
  });

  it('obrigatória é a que não tem default DO BANCO: cuid() e @updatedAt contam', () => {
    // `now()` e `@default(true)` existem no Postgres; `cuid()` é do cliente
    // Prisma e `@updatedAt` também — pelo PostgREST ninguém os gera.
    expect(colunasObrigatoriasNoInsert(ESQUEMA_DE_BRINQUEDO, 'Item').sort()).toEqual(['id', 'nome', 'planoId']);
    expect(colunasObrigatoriasNoInsert(ESQUEMA_DE_BRINQUEDO, 'User').sort()).toEqual(['atualizadoEm', 'id', 'nome']);
  });

  it('DROP CONSTRAINT e DROP TABLE tiram a constraint da lista', () => {
    const c = lerConstraints([
      `ALTER TABLE "A" ADD CONSTRAINT "A_b_fkey" FOREIGN KEY ("b") REFERENCES "B"("id");
       ALTER TABLE "C" ADD CONSTRAINT "C_b_fkey" FOREIGN KEY ("b") REFERENCES "B"("id");`,
      `ALTER TABLE "A" DROP CONSTRAINT "A_b_fkey";`,
      `DROP TABLE "C";`,
    ]);
    expect([...c.keys()]).toEqual([]);
  });

  it('o select é lido na ordem: alias, hint, filhos', () => {
    const [item] = lerSelect('dono:User!Plano_donoId_fkey!inner(id,nome)');
    expect(item).toMatchObject({ tipo: 'embed', alias: 'dono', relacao: 'User', dicas: ['Plano_donoId_fkey', 'inner'] });
  });

  it('gatilho que só dispara em UPDATE não conta como quem preenche no insert', () => {
    const ev = evidenciasDeGatilhos([
      `create function public.f() returns trigger language plpgsql as $f$ begin new."atualizadoEm" := now(); return new; end; $f$;
       create trigger t before update on public."Plano" for each row execute function public.f();`,
    ]);
    expect(ev.has('Plano')).toBe(false);
  });

  it('gatilho genérico: a coluna vem como ARGUMENTO da declaração', () => {
    const ev = evidenciasDeGatilhos([
      `create function public.governar() returns trigger language plpgsql as $f$ begin return new; end; $f$;
       create trigger g before insert on public."Plano" for each row execute function public.governar('donoId');`,
    ]);
    expect(ev.get('Plano')!.join('\n')).toContain(`'donoId'`);
  });
});

describe('colunasQueOSdkPreenche: o que o SDK manda, sem a raspagem de texto', () => {
  /*
    Cada caso aqui é um que o raspador anterior (`palavra:` dentro de 30 linhas
    do insert) errava, ou acertava por sorte.
  */
  const lerChaves = (corpo: string, tabela: string): string[] => {
    const fonte = `class M { constructor(private db: any) {} async f(a: any, eu: string) { ${corpo} } }`;
    return [...(colunasQueOSdkPreenche(fonte, ESQUEMA_DE_BRINQUEDO).get(tabela) ?? [])].sort();
  };

  it('atalho de objeto NA MESMA LINHA conta como enviado', () => {
    // `{ donoId: eu, nome, id }`: o raspador só reconhecia atalho sozinho na
    // linha, e acusaria "nome" como sem quem preencha sem razão.
    expect(lerChaves(`const nome = 'a'; const id = 'x'; await this.db.from('Plano').insert({ donoId: eu, nome, id });`, 'Plano')).toEqual(['donoId', 'id', 'nome']);
  });

  it('palavra com dois-pontos num COMENTÁRIO não conta como coluna enviada', () => {
    const chaves = lerChaves(
      `await this.db.from('Item').insert({
         // Nota: o planoId vem do contexto
         id: 'x',
         nome: 'a',
       });`,
      'Item',
    );
    expect(chaves).toEqual(['id', 'nome']);
    expect(chaves).not.toContain('Nota');
  });

  it('o ramo de um ternário não vira coluna', () => {
    expect(lerChaves(`await this.db.from('Item').insert({ id: a ? 'x' : 'y', nome: 'a' });`, 'Item')).toEqual(['id', 'nome']);
  });

  it('chave de objeto ANINHADO não conta como coluna da tabela', () => {
    expect(lerChaves(`await this.db.from('Item').insert({ id: 'x', nome: { dentro: 1 } });`, 'Item')).toEqual(['id', 'nome']);
  });

  it('update não entra: só insert e upsert dizem o que a primeira gravação manda', () => {
    expect(lerChaves(`await this.db.from('Item').update({ nome: 'a' }).eq('id', 'x');`, 'Item')).toEqual([]);
  });

  it('atribuição a TABELA CERTA mesmo com outra .from(...) logo acima', () => {
    // O raspador atribuía o insert ao `.from()` mais próximo nas 40 linhas
    // anteriores, e errava a tabela quando uma consulta curta vinha antes.
    const chaves = lerChaves(
      `await this.db.from('User').select('id').eq('id', eu);
       await this.db.from('Item').insert({ id: 'x', planoId: 'p', nome: 'a' });`,
      'Item',
    );
    expect(chaves).toEqual(['id', 'nome', 'planoId']);
    expect(lerChaves(`await this.db.from('User').select('id'); await this.db.from('Item').insert({ id: 'x' });`, 'User')).toEqual([]);
  });
});

describe('RPC: nome da função, nome de cada argumento e quem pode executar', () => {
  const SQL_DAS_FUNCOES = `
    /* create function public.fantasma(p_x text) — exemplo dentro de comentário */
    create or replace function public.convidar(p_email text, p_nota text default null)
      returns uuid language plpgsql as $f$ begin return null; end; $f$;
    grant execute on function public.convidar(text, text) to authenticated;
    revoke execute on function public.convidar(text, text) from anon, public;

    create or replace function public.listar() returns setof text language sql as $f$ select 'a' $f$;

    create or replace function public.fechada(p_id text, out resultado text)
      returns text language sql as $f$ select 'a' $f$;
    revoke execute on function public.fechada(text) from authenticated, anon, public;

    create or replace function public.reaberta(p_id text) returns text language sql as $f$ select 'a' $f$;
    revoke execute on function public.reaberta(text) from authenticated, anon, public;
    grant execute on function public.reaberta(text) to authenticated;

    create or replace function public.sobrecarga(p_a text) returns text language sql as $f$ select 'a' $f$;
    create or replace function public.sobrecarga(p_a text, p_b text) returns text language sql as $f$ select 'a' $f$;
  `;
  const FUNCOES = lerFuncoes([SQL_DAS_FUNCOES]);
  const EXECUCAO = lerExecucao([SQL_DAS_FUNCOES]);

  const chamar = (trecho: string): Achado[] =>
    analisarSdk({
      arquivo: 'amostra.ts',
      fonte: `class M { constructor(private db: any) {} async rpc(nome: string, args: any) { return this.db.rpc(nome, args); } async f(eu: string, extra: any) { ${trecho} } }`,
      esquema: ESQUEMA_DE_BRINQUEDO,
      constraints: CONSTRAINTS_DE_BRINQUEDO,
      funcoes: FUNCOES,
      execucao: EXECUCAO,
    }).achados;

  const RPC_RUINS: Array<[string, string, string]> = [
    ['função que não existe', `await this.rpc('convidr', { p_email: eu });`, 'não existe função'],
    ['função citada só dentro de comentário SQL não existe', `await this.rpc('fantasma', { p_x: eu });`, 'não existe função'],
    ['argumento com o nome trocado', `await this.rpc('convidar', { p_emial: eu });`, 'não casa'],
    ['argumento a mais', `await this.rpc('convidar', { p_email: eu, p_outro: 1 });`, 'não casa'],
    ['argumento obrigatório que falta', `await this.rpc('convidar', { p_nota: 'x' });`, 'não casa'],
    ['função sem argumentos chamada com argumento', `await this.rpc('listar', { p_x: 1 });`, 'não casa'],
    ['função com revoke de authenticated e sem grant', `await this.rpc('fechada', { p_id: eu });`, 'ninguém autenticado'],
    ['nome da função dinâmico fora do embrulho', `await this.db.rpc(extra.nome, { p_email: eu });`, 'não tem nome estático'],
    ['argumentos que não são objeto estático', `await this.rpc('convidar', extra.args);`, 'não são um objeto estático'],
  ];
  for (const [nome, trecho, mensagem] of RPC_RUINS) {
    it(`RUIM: ${nome}`, () => {
      const achados = chamar(trecho);
      expect(achados.map((a) => a.mensagem).join('\n')).toContain(mensagem);
    });
  }

  const RPC_BOAS: Array<[string, string]> = [
    ['todos os argumentos', `await this.rpc('convidar', { p_email: eu, p_nota: 'x' });`],
    ['o opcional omitido', `await this.rpc('convidar', { p_email: eu });`],
    ['sem argumentos, para função sem parâmetros', `await this.rpc('listar');`],
    ['tipo genérico na chamada', `await this.rpc<string>('convidar', { p_email: eu });`],
    ['direto no cliente, sem o embrulho', `await this.db.rpc('convidar', { p_email: eu });`],
    ['argumentos com spread: as obrigatórias podem vir dele', `await this.rpc('convidar', { ...extra });`],
    ['função que teve o grant devolvido depois do revoke', `await this.rpc('reaberta', { p_id: eu });`],
    ['qualquer das sobrecargas serve', `await this.rpc('sobrecarga', { p_a: eu }); await this.rpc('sobrecarga', { p_a: eu, p_b: eu });`],
  ];
  for (const [nome, trecho] of RPC_BOAS) {
    it(`BOA: ${nome}`, () => {
      expect(chamar(trecho).map((a) => `${a.tipo}: ${a.mensagem}`)).toEqual([]);
    });
  }

  it('o embrulho genérico rpc(nome, args) não é acusado por ter nome dinâmico', () => {
    // O corpo do embrulho (`this.db.rpc(nome, args)`) é genérico por natureza.
    expect(chamar('return 1;')).toEqual([]);
  });

  it('parâmetro OUT não conta como argumento que o chamador manda', () => {
    expect(FUNCOES.get('fechada')![0]!.map((p) => p.nome)).toEqual(['p_id']);
  });

  it('sobrecarga: as duas assinaturas são guardadas', () => {
    expect(FUNCOES.get('sobrecarga')).toHaveLength(2);
  });

  describe('a varredura dinâmica que fecha todas as funções', () => {
    /*
      `99-fechar-portas.sql` percorre `pg_proc` e revoga `execute` de public e
      anon por SQL dinâmico. Uma leitura de comandos soltos não a enxerga — e
      sem modelá-la, uma função NOVA sem revoke escrito apareceria como aberta
      ao anon quando o laço a fecha ao aplicar o arquivo.
    */
    const SQL_COM_VARREDURA = `
      create function public.solta(p_x text) returns text language sql as $f$ select 'a' $f$;
      create function public.so_do_app(p_x text) returns text language sql as $f$ select 'a' $f$;
      create function public.interna(p_x text) returns text language sql as $f$ select 'a' $f$;
      create function public.publica(p_x text) returns text language sql as $f$ select 'a' $f$;
      revoke execute on function public.interna(text) from authenticated, public, anon;

      do $v$
      declare f record;
      begin
        for f in select 1 loop
          execute format('revoke execute on function public.%I(%s) from public, anon', f.nome, f.args);
        end loop;
      end;
      $v$;
      grant execute on function public.publica(text) to anon;
    `;
    const fs = lerFuncoes([SQL_COM_VARREDURA]);
    const ex = lerExecucao([SQL_COM_VARREDURA], fs);

    it('função sem nenhum comando escrito nasce FECHADA ao anon', () => {
      expect(podeExecutar(ex, 'solta', 'anon')).toBe(false);
    });

    it('a varredura devolve ao authenticated o que ele alcançava antes', () => {
      expect(podeExecutar(ex, 'solta', 'authenticated')).toBe(true);
      expect(podeExecutar(ex, 'so_do_app', 'authenticated')).toBe(true);
    });

    it('e NÃO reabre o que outro arquivo tirou do app de propósito', () => {
      // O defeito histórico da primeira versão do arquivo 99: dar grant a TODA
      // função reabriu nove que os arquivos 00, 11, 12, 20, 25 e 38 tinham
      // fechado. A pergunta é feita ANTES de revogar.
      expect(podeExecutar(ex, 'interna', 'authenticated')).toBe(false);
    });

    it('o grant explícito DEPOIS da varredura abre — é como as exceções funcionam', () => {
      expect(podeExecutar(ex, 'publica', 'anon')).toBe(true);
    });

    it('sem passar as funções, a varredura não é modelada, e a função solta fica aberta', () => {
      // O contrário também precisa ser verdade: o modelo só liga o laço quando
      // sabe quais funções existem. Sem isso, "fechada" seria chute.
      const sem = lerExecucao([SQL_COM_VARREDURA]);
      expect(podeExecutar(sem, 'solta', 'anon')).toBe(true);
    });

    it('revoke só de ANON não fecha: PUBLIC continua dando o acesso', () => {
      /*
        O equívoco que o arquivo 99 documenta: o 11 escrevia `revoke … from anon`
        e a porta seguia aberta, porque `anon` recebe o acesso por `PUBLIC`. A
        primeira versão desta prova repetiu o erro e tratava esse revoke como
        fechamento.
      */
      const so_anon = `
        create function public.engana(p_x text) returns text language sql as $f$ select 'a' $f$;
        revoke execute on function public.engana(text) from anon;
      `;
      expect(podeExecutar(lerExecucao([so_anon]), 'engana', 'anon')).toBe(true);
    });

    it('revoke de PUBLIC fecha, e o grant direto reabre só para quem recebeu', () => {
      const fechada = `
        create function public.f(p_x text) returns text language sql as $f$ select 'a' $f$;
        revoke execute on function public.f(text) from public;
        grant execute on function public.f(text) to authenticated;
      `;
      const e = lerExecucao([fechada]);
      expect(podeExecutar(e, 'f', 'anon')).toBe(false);
      expect(podeExecutar(e, 'f', 'authenticated')).toBe(true);
    });

    it('revoke citado em COMENTÁRIO não vale como comando', () => {
      const comComentario = `
        create function public.alvo(p_x text) returns text language sql as $f$ select 'a' $f$;
        /* o arquivo 11 escrevia: revoke execute on function public.alvo(text) from anon; e isso não fazia nada */
      `;
      expect(podeExecutar(lerExecucao([comComentario]), 'alvo', 'anon')).toBe(true);
    });
  });

  it('o privilégio é o estado FINAL, na ordem dos comandos', () => {
    expect(podeExecutar(EXECUCAO, 'convidar', 'authenticated')).toBe(true);
    expect(podeExecutar(EXECUCAO, 'convidar', 'anon')).toBe(false);
    expect(podeExecutar(EXECUCAO, 'fechada', 'authenticated')).toBe(false);
    expect(podeExecutar(EXECUCAO, 'reaberta', 'authenticated')).toBe(true);
    // Sem comando nenhum, o Postgres deixa PUBLIC executar.
    expect(podeExecutar(EXECUCAO, 'listar', 'anon')).toBe(true);
  });
});

describe('política: toda operação que o SDK faz tem política que a cubra', () => {
  const SQL_DAS_POLITICAS = `
    create policy plano_le on public."Plano" for select using (true);
    create policy plano_escreve on public."Plano" for insert with check (true);
    drop policy if exists item_tudo on public."Item";
    create policy item_tudo on public."Item" for all using (true);
    create policy velha on public."User" for update using (true);
    drop policy if exists velha on public."User";
    /* create policy fantasma on public."Etiqueta" for all using (true); */
    -- create policy outra on public."Etiqueta" for delete using (true);
  `;
  const POLITICAS = lerPoliticas([SQL_DAS_POLITICAS]);

  const conferirPolitica = (trecho: string): Achado[] =>
    analisarSdk({
      arquivo: 'amostra.ts',
      fonte: `class M { constructor(private db: any) {} async f() { ${trecho} } }`,
      esquema: ESQUEMA_DE_BRINQUEDO,
      constraints: CONSTRAINTS_DE_BRINQUEDO,
      politicas: POLITICAS,
    }).achados.filter((a) => a.tipo === 'POLITICA');

  const RUINS: Array<[string, string, RegExp]> = [
    ['delete numa tabela só com política de select e insert', `await this.db.from('Plano').delete().eq('id', 'x');`, /delete em Plano/],
    ['update sem política de update', `await this.db.from('Plano').update({ nome: 'a' }).eq('id', 'x');`, /update em Plano/],
    ['upsert exige insert E update: falta o update', `await this.db.from('Plano').upsert({ id: 'x', nome: 'a', donoId: 'u' });`, /update em Plano/],
    ['leitura de tabela sem nenhuma política', `await this.db.from('User').select('id');`, /select em User/],
    ['política que foi derrubada depois não vale', `await this.db.from('User').update({ nome: 'a' }).eq('id', 'x');`, /update em User/],
    ['política escrita só em comentário não existe', `await this.db.from('Etiqueta').select('id');`, /select em Etiqueta/],
  ];
  for (const [nome, trecho, msg] of RUINS) {
    it(`RUIM: ${nome}`, () => {
      const achados = conferirPolitica(trecho);
      expect(achados.map((a) => a.mensagem).join('\n')).toMatch(msg);
    });
  }

  const BOAS: Array<[string, string]> = [
    ['select e insert onde há política para os dois', `await this.db.from('Plano').select('id'); await this.db.from('Plano').insert({ id: 'x', nome: 'a', donoId: 'u' });`],
    ['qualquer comando onde a política é for all', `await this.db.from('Item').select('id'); await this.db.from('Item').delete().eq('id', 'x'); await this.db.from('Item').update({ nome: 'a' }).eq('id', 'x');`],
    ['upsert com política de insert e update (all cobre os dois)', `await this.db.from('Item').upsert({ id: 'x', planoId: 'p', nome: 'a' });`],
    ['o balde de armazenamento não pede política de tabela', `await this.db.storage.from('fotos').remove(['a']);`],
  ];
  for (const [nome, trecho] of BOAS) {
    it(`BOA: ${nome}`, () => {
      expect(conferirPolitica(trecho).map((a) => a.mensagem)).toEqual([]);
    });
  }

  it('lerPoliticas: a recriada depois do drop vale, a derrubada não', () => {
    const vivas = lerPoliticas([
      `create policy a on public."T" for select using (true); drop policy a on public."T"; create policy a on public."T" for delete using (true);`,
    ]);
    expect(vivas).toEqual([{ tabela: 'T', comando: 'delete' }]);
  });

  it('sem `politicas`, a regra não é conferida (o chamador não tem os SQLs)', () => {
    const achados = analisarSdk({
      arquivo: 'a.ts',
      fonte: `class M { constructor(private db: any) {} async f() { await this.db.from('Plano').delete().eq('id', 'x'); } }`,
      esquema: ESQUEMA_DE_BRINQUEDO,
      constraints: CONSTRAINTS_DE_BRINQUEDO,
    }).achados;
    expect(achados.filter((a) => a.tipo === 'POLITICA')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. O repositório de verdade
// ---------------------------------------------------------------------------

const RAIZ = join(__dirname, '..', '..', '..');
const SDK = join(RAIZ, 'packages', 'sdk', 'src');
const MIGRACOES = join(__dirname, 'migrations');
const RLS = join(__dirname, 'rls');

const esquema = lerEsquema(readFileSync(join(__dirname, 'schema.prisma'), 'utf8'));
const constraints = lerConstraints(
  readdirSync(MIGRACOES)
    .filter((d) => statSync(join(MIGRACOES, d)).isDirectory())
    .sort()
    .map((d) => readFileSync(join(MIGRACOES, d, 'migration.sql'), 'utf8')),
);
const sqlsDoRls = readdirSync(RLS)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(RLS, f), 'utf8'));
const evidencias = evidenciasDeGatilhos(sqlsDoRls);
const funcoes = lerFuncoes(sqlsDoRls);
const execucao = lerExecucao(sqlsDoRls, funcoes);
const politicas = lerPoliticas(sqlsDoRls);

const arquivosDoSdk = readdirSync(SDK).filter((f) => f.endsWith('.ts') && !/\.(spec|test)\./.test(f));
const analises = arquivosDoSdk.map((f) => {
  const fonte = readFileSync(join(SDK, f), 'utf8');
  return { f, fonte, ...analisarSdk({ arquivo: f, fonte, esquema, constraints, evidencias, funcoes, execucao, politicas }) };
});
const todosOsAchados = analises.flatMap((a) => a.achados);
const soma = (k: 'cadeias' | 'selects' | 'filtros' | 'escritas' | 'dicas' | 'rpcs' | 'operacoes' | 'armazenamento'): number =>
  analises.reduce((n, a) => n + a.estatistica[k], 0);

describe('o SDK de verdade confrontado com o esquema', () => {
  it('NENHUMA tabela, coluna, embed, dica ou escrita do SDK diverge do esquema', () => {
    const relatorio = todosOsAchados.map((a) => `${a.arquivo}:${a.linha} [${a.tabela}] ${a.tipo} — ${a.mensagem}`);
    expect(relatorio).toEqual([]);
  });

  it('o conferidor OLHOU para o SDK: a cobertura não colapsou', () => {
    /*
      A garantia contra o pior erro desta família: o conferidor quebrar de um
      jeito que não acusa nada. Os pisos vêm da medição de 09/10 (196 cadeias,
      162 selects, 343 filtros, 70 escritas, 51 dicas, 31 rpcs, 251 operações)
      com uma folga de uns 5%. Se o SDK encolher de verdade, quem encolhe baixa o
      piso sabendo por quê; se o conferidor passar a ignorar cadeias, aqui cai.
    */
    expect(soma('cadeias')).toBeGreaterThanOrEqual(185);
    expect(soma('selects')).toBeGreaterThanOrEqual(150);
    expect(soma('filtros')).toBeGreaterThanOrEqual(320);
    expect(soma('escritas')).toBeGreaterThanOrEqual(65);
    expect(soma('dicas')).toBeGreaterThanOrEqual(48);
    expect(soma('rpcs')).toBeGreaterThanOrEqual(30);
    expect(soma('operacoes')).toBeGreaterThanOrEqual(235);
  });

  it('há políticas lidas do SQL, e em quantidade que explica as 120 operações', () => {
    // Sem isto, `lerPoliticas` quebrada devolveria lista vazia e a regra
    // acusaria TUDO — o inverso, política demais, aprovaria tudo.
    expect(politicas.length).toBeGreaterThanOrEqual(130);
    expect(new Set(politicas.map((p) => p.tabela)).size).toBeGreaterThanOrEqual(50);
  });

  it('toda chamada `rpc(` do SDK foi lida — recontada por outro caminho', () => {
    // A recontagem é por regex e conta o embrulho e as chamadas, com ou sem
    // argumento de tipo (`rpc<string>(`). O conferidor passa pela AST.
    const fonte = analises.map((a) => a.fonte).join('\n');
    const porRegex = [...fonte.matchAll(/\.rpc(?:<[^()]*>)?\(/g)].length;
    expect(porRegex).toBeGreaterThanOrEqual(30);
    expect(soma('rpcs')).toBeGreaterThanOrEqual(porRegex);
  });

  it('NENHUMA função do esquema é alcançável por anon, exceto as duas da página pública', () => {
    /*
      O invariante de segurança do arquivo 99, escrito como teste: depois de
      todos os arquivos aplicados em ordem — incluindo a varredura dinâmica que
      fecha o que ninguém lembrou de fechar —, a lista do que o `anon` executa é
      curta e nominal. Uma função nova nasce fechada; abrir é ato explícito, e
      esta lista é onde ele aparece.

      Vale para as 103 funções, e não só para as 30 que o SDK chama: é a função
      que ninguém chama de dentro do app que um atacante procura.
    */
    expect(funcoes.size).toBeGreaterThanOrEqual(100);
    const abertas = [...funcoes.keys()].filter((f) => podeExecutar(execucao, f, 'anon')).sort();
    expect(abertas).toEqual(['enviar_pedido_de_contato', 'pagina_publica']);
  });

  it('as funções que o SDK chama como anônimo são exatamente as da página pública', () => {
    /*
      A postura de segurança escrita em teste: só o formulário público fala com o
      banco sem sessão. Se uma terceira função aparecer executável por `anon`
      entre as que o SDK chama, ou se uma destas dessas duas fechar, a lista
      muda — e quem muda é obrigado a ler isto.
    */
    const fonte = analises.map((a) => a.fonte).join('\n');
    const chamadas = new Set([...fonte.matchAll(/\.rpc(?:<[^()]*>)?\(\s*'(\w+)'/g)].map((m) => m[1]!));
    const aoAlcanceDoAnon = [...chamadas].filter((f) => podeExecutar(execucao, f, 'anon')).sort();
    expect(aoAlcanceDoAnon).toEqual(['enviar_pedido_de_contato', 'pagina_publica']);
  });

  it('todo `.from(` com nome estático do SDK foi lido — recontado por outro caminho', () => {
    /*
      Recontagem independente, por regex: cada `.from('Nome')` com nome começando
      em maiúscula (tabela, não balde) que NÃO é `.storage.from`. O conferidor
      tem de ter visto pelo menos tantas.
    */
    const fonte = analises.map((a) => a.fonte).join('\n');
    const porRegex = [...fonte.matchAll(/(\.storage)?\s*\.from\(\s*'([A-Z][A-Za-z]*)'\s*\)/g)].filter((m) => m[1] === undefined).length;
    expect(porRegex).toBeGreaterThan(0);
    expect(soma('cadeias')).toBeGreaterThanOrEqual(porRegex);
  });

  it('os baldes de armazenamento foram vistos e descartados, e não tomados por tabela', () => {
    expect(soma('armazenamento')).toBeGreaterThan(0);
    expect(todosOsAchados.filter((a) => a.tipo === 'TABELA')).toEqual([]);
  });

  it('todo `fkey` que o SDK cita existe nas migrações, depois de todos os DROPs', () => {
    // Redundante com o conferidor de dicas de propósito: esta lê o texto do SDK
    // por regex, o conferidor lê pela AST. Se as duas discordarem, uma está cega.
    const fonte = analises.map((a) => a.fonte).join('\n');
    const citadas = new Set([...fonte.matchAll(/!([A-Za-z]+_[A-Za-z]+_fkey)/g)].map((m) => m[1]));
    expect(citadas.size).toBeGreaterThan(20);
    const faltando = [...citadas].filter((c) => !constraints.has(c));
    expect(faltando).toEqual([]);
  });

  it('toda chave estrangeira do schema.prisma existe nas migrações com o nome que o Prisma daria', () => {
    /*
      O PostgREST resolve o embed pela constraint do BANCO, e o banco vem das
      migrações — não do schema. Se alguém declara uma relação no schema e esquece
      de gerar a migração, tudo compila, o Prisma Client funciona, e o embed
      falha em produção com PGRST200.
    */
    const faltando: string[] = [];
    for (const [tabela, campos] of esquema) {
      for (const campo of campos.values()) {
        if (campo.colunasFk.length === 0) continue;
        const nome = `${tabela}_${campo.colunasFk.join('_')}_fkey`;
        const c = constraints.get(nome);
        if (!c || c.alvo !== campo.tipo) faltando.push(`${nome} (${tabela} → ${campo.tipo})`);
      }
    }
    expect(faltando).toEqual([]);
  });

  it('toda constraint das migrações aponta para uma tabela que ainda existe no esquema', () => {
    const orfas = [...constraints.values()]
      .filter((c) => !esquema.has(c.tabela) || !esquema.has(c.alvo))
      .map((c) => `${c.nome} (${c.tabela} → ${c.alvo})`);
    expect(orfas).toEqual([]);
  });

  it('há evidência de gatilho lida do SQL, e não uma tabela vazia', () => {
    // Sem isto, `OBRIGATORIA` aprovaria tudo se a leitura dos SQLs quebrasse:
    // sem gatilho nenhum a regra acusaria TUDO, mas o contrário também é um modo
    // de falha — evidência vazia com a regra desligada.
    expect(evidencias.size).toBeGreaterThanOrEqual(20);
    expect(evidencias.get('Medida')!.join('\n')).toContain('new."atualizadoEm" :=');
  });
});
