import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VivioClient } from '../src/client';

/**
 * "Quem viu meus dados", pelo SDK, sem API.
 *
 * É direito do titular pela LGPD, e a regra dura é quem NÃO vê: nem o
 * profissional que gerou o acesso, nem o admin. Só o próprio aluno.
 *
 * O que este arquivo mais persegue é a paginação. Ela trocou de mecânica —
 * o cursor do Prisma não existe no PostgREST, e virou keyset por `criadoEm`
 * com o id como desempate — mantendo o mesmo FORMATO de cursor. Errar aqui não
 * dá erro: dá linha repetida ou linha pulada, calada, no meio de uma lista que
 * a pessoa está lendo para conferir quem mexeu no prontuário dela.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK sem API: quem viu meus dados', () => {
  const marca = `prova-audit-${Date.now()}`;
  const alunoId = `${marca}-aluno`;
  const email = `${marca}@teste.com`;
  let admin: SupabaseClient;
  let idNoAuth = '';
  let personalId = '';

  const aluno = new VivioClient({
    supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
  });
  const personal = new VivioClient({
    supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
  });

  const cabecalhos = (): Record<string, string> => ({
    apikey: servico!,
    Authorization: `Bearer ${servico!}`,
    'Content-Type': 'application/json',
  });

  /** Um instante distinto por linha, e duas no MESMO instante de propósito. */
  const QUANTOS = 7;

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });
    personalId = (
      (await admin.from('User').select('id').eq('email', 'personal@viviofit.com.br').single())
        .data as { id: string }
    ).id;

    await admin.from('User').insert({
      id: alunoId,
      email,
      nome: 'Aluno de Auditoria',
      papel: 'ALUNO',
      status: 'ATIVA',
      atualizadoEm: new Date().toISOString(),
    });

    const base = Date.parse('2026-03-01T12:00:00.000Z');
    const linhas = Array.from({ length: QUANTOS }, (_, i) => ({
      id: `${marca}-l${i}`,
      atorId: personalId,
      alunoId,
      acao: 'LER',
      recursoTipo: 'PlanoTreino',
      escopo: i % 2 === 0 ? 'TREINO' : 'NUTRICAO',
      /*
        As duas últimas compartilham o instante. É o caso que o desempate por
        id existe para resolver — e num app real ele é comum, porque um mesmo
        carregamento de tela grava vários acessos de uma vez.
      */
      criadoEm: new Date(base + (i === QUANTOS - 1 ? QUANTOS - 2 : i) * 60_000).toISOString(),
    }));
    const inseriu = await admin.from('LogAuditoria').insert(linhas);
    /*
      Conferir o erro do preparo, e não só o resultado do teste.

      A primeira versão deste arquivo mandava `acao: 'LEITURA'`, que não existe
      no enum — o insert falhava calado, e as asserções encontravam uma lista
      vazia. Cenário que não é montado prova o quê? Nada, e parece defeito do
      código sob teste.
    */
    if (inseriu.error) throw new Error(`preparo falhou: ${inseriu.error.message}`);

    // Um acesso do PRÓPRIO aluno, que não deve poluir a lista dele.
    const meu = await admin.from('LogAuditoria').insert({
      id: `${marca}-eu`,
      atorId: alunoId,
      alunoId,
      acao: 'LER',
      recursoTipo: 'PlanoTreino',
      escopo: 'TREINO',
      criadoEm: new Date(base + 999_000).toISOString(),
    });
    if (meu.error) throw new Error(`preparo falhou: ${meu.error.message}`);

    const r = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: cabecalhos(),
      body: JSON.stringify({ email, password: 'Senha@123', email_confirm: true }),
    });
    const criado = (await r.json()) as { id?: string };
    if (!criado.id) throw new Error(`Auth recusou: ${JSON.stringify(criado)}`);
    idNoAuth = criado.id;

    await aluno.auth.login({ email, senha: 'Senha@123' });
    await personal.auth.login({ email: 'personal@viviofit.com.br', senha: 'Senha@123' });
  });

  afterAll(async () => {
    await admin.from('LogAuditoria').delete().eq('alunoId', alunoId);
    await admin.from('User').delete().eq('id', alunoId);
    if (idNoAuth) {
      await fetch(`${url}/auth/v1/admin/users/${idNoAuth}`, {
        method: 'DELETE',
        headers: cabecalhos(),
      });
    }
  });

  it('o aluno vê os acessos, do mais recente para o mais antigo', async () => {
    const r = await aluno.auditoria.meusAcessos({ limit: 100 });
    expect(r.dados).toHaveLength(QUANTOS);
    expect(r.dados[0]!.ator.nome).toBeTruthy();
    expect(r.dados[0]!.ator.papel).toBe('PERSONAL');

    const datas = r.dados.map((d) => d.criadoEm);
    expect([...datas].sort().reverse()).toEqual(datas);
  });

  it('o próprio acesso do aluno não polui a lista', async () => {
    const r = await aluno.auditoria.meusAcessos({ limit: 100 });
    expect(r.dados.some((d) => d.id === `${marca}-eu`)).toBe(false);
  });

  it('a paginação não repete nem pula — nem no empate de instante', async () => {
    /*
      A prova que importa. Duas linhas compartilham `criadoEm`; sem o desempate
      por id, a página seguinte devolveria uma delas de novo, ou nenhuma.
    */
    const vistos: string[] = [];
    let cursor: string | null = null;
    for (let volta = 0; volta < 10; volta += 1) {
      const pagina: { dados: { id: string }[]; proximoCursor: string | null } =
        await aluno.auditoria.meusAcessos({ limit: 2, ...(cursor ? { cursor } : {}) });
      vistos.push(...pagina.dados.map((d) => d.id));
      cursor = pagina.proximoCursor;
      if (!cursor) break;
    }

    expect(vistos).toHaveLength(QUANTOS);
    expect(new Set(vistos).size).toBe(QUANTOS);

    // E a ordem paginada é a mesma da lista inteira.
    const inteira = await aluno.auditoria.meusAcessos({ limit: 100 });
    expect(vistos).toEqual(inteira.dados.map((d) => d.id));
  });

  it('filtra por escopo', async () => {
    const r = await aluno.auditoria.meusAcessos({ escopo: 'NUTRICAO', limit: 100 });
    expect(r.dados.length).toBeGreaterThan(0);
    expect(r.dados.every((d) => d.escopo === 'NUTRICAO')).toBe(true);
  });

  it('cursor que não existe mais devolve a primeira página, e não erro', async () => {
    // A linha pode ter saído entre uma página e outra; derrubar a tela por
    // isso seria pior do que recomeçar.
    const r = await aluno.auditoria.meusAcessos({ cursor: 'nao-existe', limit: 3 });
    expect(r.dados).toHaveLength(3);
  });

  it('o profissional NÃO vê a auditoria que ele mesmo gerou', async () => {
    /*
      É a regra dura da tela: o profissional não confere se foi notado. Sem
      isso, "quem viu meus dados" viraria "quem viu meus dados, e ele sabe que
      você olhou".
    */
    const r = await personal.auditoria.meusAcessos({ limit: 100 });
    expect(r.dados.some((d) => d.id.startsWith(marca))).toBe(false);
  });
});
