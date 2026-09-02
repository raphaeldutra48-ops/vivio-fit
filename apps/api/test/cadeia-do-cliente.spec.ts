import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

/**
 * A cadeia inteira do lado do cliente, sem API nenhuma no meio.
 *
 *   login no Auth -> hook põe `vivio_id` no token -> PostgREST -> políticas
 *
 * Os outros testes de RLS entram pelo Postgres direto, com `set local role`.
 * Este entra pela porta que o app usa de verdade, e por isso é o único que
 * prova os elos entre as pontas: que o hook roda no login, que o PostgREST
 * repassa a claim, e que os GRANTs deixam o `authenticated` chegar às funções
 * que as políticas chamam.
 *
 * Foi ele que pegou a revogação que quebrou toda a escrita — e quase não
 * pegou: a asserção de recusa continuava verde. Por isso aqui tem sempre um
 * par, o que pode e o que não pode.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;

describe.skipIf(!url || !anon)('a cadeia do cliente, sem API', () => {
  const p = new PrismaClient({
    datasourceUrl: process.env.SUPABASE_DIRECT_URL ?? process.env.DATABASE_URL,
  });
  let nutri: SupabaseClient;
  let medico: SupabaseClient;
  let tokenNutri = '';
  let ana = '';
  let bruno = '';

  async function entrar(email: string): Promise<{ c: SupabaseClient; token: string }> {
    const c = createClient(url!, anon!, { auth: { persistSession: false } });
    const { data, error } = await c.auth.signInWithPassword({ email, password: 'Senha@123' });
    if (error || !data.session) throw new Error(`login de ${email}: ${error?.message}`);
    return { c, token: data.session.access_token };
  }

  const claims = (t: string): Record<string, unknown> =>
    JSON.parse(Buffer.from(t.split('.')[1]!, 'base64').toString('utf8')) as Record<string, unknown>;

  beforeAll(async () => {
    ana = (await p.user.findUniqueOrThrow({ where: { email: 'ana@exemplo.com' } })).id;
    bruno = (await p.user.findUniqueOrThrow({ where: { email: 'bruno@exemplo.com' } })).id;
    const n = await entrar('nutri@viviofit.com.br');
    nutri = n.c;
    tokenNutri = n.token;
    medico = (await entrar('medico@viviofit.com.br')).c;
  });

  afterAll(async () => {
    await p.$disconnect();
  });

  it('o hook põe o nosso id e o papel no token', async () => {
    // Sem isto nada mais funciona: `auth.uid()` faria `::uuid` num cuid e
    // derrubaria a consulta em vez de devolver falso.
    const c = claims(tokenNutri);
    expect(typeof c.vivio_id).toBe('string');
    expect(c.vivio_id).not.toBe('');
    expect(c.vivio_papel).toBe('NUTRICIONISTA');
  });

  it('a política filtra a leitura pelo PostgREST', async () => {
    const daAna = await nutri.from('PlanoDieta').select('id').eq('alunoId', ana);
    expect(daAna.error).toBeNull();
    expect(daAna.data!.length).toBeGreaterThan(0);

    // O Bruno tem vínculo e não consentiu NUTRICAO: some, sem erro.
    const doBruno = await nutri.from('PlanoDieta').select('id').eq('alunoId', bruno);
    expect(doBruno.data).toEqual([]);
  });

  it('a pergunta de consentimento explica a lista vazia', async () => {
    /*
      Com RLS não há 403: falta de consentimento vira lista vazia, e as doze
      telas que mostram "peça autorização" ficariam mudas. Elas perguntam.
    */
    const daAna = await nutri.rpc('pode_ler_do_aluno', { p_aluno_id: ana, p_escopo: 'NUTRICAO' });
    const doBruno = await nutri.rpc('pode_ler_do_aluno', {
      p_aluno_id: bruno,
      p_escopo: 'NUTRICAO',
    });
    expect(daAna.data).toBe(true);
    expect(doBruno.data).toBe(false);
  });

  it('o app não pergunta sobre o acesso de terceiros', async () => {
    // Exposta, deixaria qualquer profissional descobrir "o colega fulano tem
    // consentimento do aluno beltrano?" — que é o que o pedido de acesso
    // existe para intermediar.
    const r = await nutri.rpc('consentimento_de', {
      p_profissional_id: ana,
      p_aluno_id: bruno,
      p_escopo: 'CLINICO',
    });
    expect(r.error).not.toBeNull();
  });

  it('a escrita passa para quem pode, e só para quem pode', async () => {
    /*
      O par. Sem a metade positiva, um GRANT revogado a mais deixa este arquivo
      verde com o app inteiro quebrado — foi exatamente o que aconteceu quando
      `pode_escrever_do_aluno` perdeu o EXECUTE.
    */
    const id = `prova-cadeia-${Date.now()}`;
    const doMedico = await medico.from('CondicaoSaude').insert({
      id,
      alunoId: ana,
      tipo: 'LESAO',
      descricao: 'Prova da cadeia',
      gravidade: 'LEVE',
      registradoPorId: (claims((await entrar('medico@viviofit.com.br')).token).vivio_id as string),
    });
    expect(doMedico.error).toBeNull();

    const daNutri = await nutri.from('CondicaoSaude').insert({
      id: `${id}-2`,
      alunoId: ana,
      tipo: 'LESAO',
      descricao: 'Nao devia',
      gravidade: 'LEVE',
      registradoPorId: claims(tokenNutri).vivio_id as string,
    });
    expect(daNutri.error).not.toBeNull();

    await p.alertaClinico.deleteMany({ where: { condicaoId: id } });
    await p.condicaoSaude.deleteMany({ where: { id: { in: [id, `${id}-2`] } } });
  });
});
