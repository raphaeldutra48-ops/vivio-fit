import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroApi } from '../src/erro';
import { VivioClient } from '../src/client';

/**
 * Os grupos do SDK que já não passam pela API, exercitados PELO SDK.
 *
 * Os testes de RLS que vivem em `apps/api` entram pelo Postgres ou pelo
 * `supabase-js` cru. Este entra pelo `VivioClient` — a mesma classe que as 158
 * chamadas das telas usam — e por isso é o único que prova o contrato inteiro:
 * que o método existe, que devolve a forma que a tela espera, e que o erro
 * chega como `ErroApi` e não cru do `supabase-js`.
 *
 * `baseUrl` aponta para lugar nenhum de propósito. Se algum destes métodos
 * ainda tocasse a API, a chamada morreria em conexão recusada em vez de passar
 * despercebida.
 *
 * Vive aqui, e não em `apps/api`, porque o que está sob teste é o SDK — e ele
 * precisa continuar existindo depois que a API for demolida.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK sem API: vínculo e consentimento', () => {
  const marca = `prova-sdk-${Date.now()}`;
  const alunoEmail = `${marca}@teste.com`;
  const alunoId = `${marca}-aluno`;
  let vinculoId = '';
  let idNoAuth = '';

  /** Cliente com a chave de serviço: monta e desmonta o cenário. */
  let admin: SupabaseClient;

  const cabecalhosAuth = (): Record<string, string> => ({
    apikey: servico!,
    Authorization: `Bearer ${servico!}`,
    'Content-Type': 'application/json',
  });

  /** Um cliente por pessoa: cada um com a própria sessão, como no app. */
  const clientePara = (): VivioClient =>
    new VivioClient({
      baseUrl: 'http://127.0.0.1:1',
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const personal = clientePara();
  const aluno = clientePara();

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });

    await admin.from('User').insert({
      id: alunoId,
      email: alunoEmail,
      nome: 'Aluno do SDK',
      papel: 'ALUNO',
      status: 'ATIVA',
      atualizadoEm: new Date().toISOString(),
    });

    /*
      A conta do Auth vem pela API de administração, e não pelo `signUp`
      público: o público manda e-mail de confirmação de verdade, e teste não
      escreve na caixa de ninguém. O gatilho de cadastro reencontra o `User`
      acima pelo e-mail em vez de criar um segundo.
    */
    const r = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: cabecalhosAuth(),
      body: JSON.stringify({ email: alunoEmail, password: 'Senha@123', email_confirm: true }),
    });
    const criado = (await r.json()) as { id?: string };
    if (!criado.id) throw new Error(`Auth recusou: ${JSON.stringify(criado)}`);
    idNoAuth = criado.id;

    await personal.auth.login({ email: 'personal@viviofit.com.br', senha: 'Senha@123' });
    await aluno.auth.login({ email: alunoEmail, senha: 'Senha@123' });
  });

  afterAll(async () => {
    await admin.from('Consentimento').delete().eq('alunoId', alunoId);
    await admin.from('Vinculo').delete().eq('alunoId', alunoId);
    await admin.from('User').delete().eq('id', alunoId);
    // A conta do Auth sai junto, ou o e-mail fica ocupado para sempre.
    if (idNoAuth) {
      await fetch(`${url}/auth/v1/admin/users/${idNoAuth}`, {
        method: 'DELETE',
        headers: cabecalhosAuth(),
      });
    }
  });

  it('o profissional convida e recebe o vínculo já montado', async () => {
    const v = await personal.vinculos.convidar(alunoEmail);
    vinculoId = v.id;
    expect(v.status).toBe('PENDENTE');
    expect(v.tipo).toBe('PERSONAL');
    // A contraparte é quem está do outro lado EM RELAÇÃO A QUEM PERGUNTA.
    expect(v.contraparte.email).toBe(alunoEmail);
    // Quem convidou não está esperando resposta de si mesmo.
    expect(v.aguardandoMinhaResposta).toBe(false);
  });

  it('para o aluno, o mesmo vínculo mostra o profissional e pede resposta', async () => {
    const meus = await aluno.vinculos.meusProfissionais();
    const v = meus.find((x) => x.id === vinculoId);
    expect(v).toBeDefined();
    expect(v!.contraparte.email).toBe('personal@viviofit.com.br');
    expect(v!.aguardandoMinhaResposta).toBe(true);
  });

  it('o erro do banco chega como ErroApi, e não cru', async () => {
    // As telas fazem `catch (e) { if (e instanceof ErroApi) ... }` em dezenas
    // de lugares; deixar vazar o erro do `supabase-js` quebraria todas.
    await expect(personal.vinculos.convidar(alunoEmail)).rejects.toBeInstanceOf(ErroApi);
  });

  it('o aluno aceita, e a carteira do profissional passa a contá-lo', async () => {
    const v = await aluno.vinculos.aceitar(vinculoId);
    expect(v.status).toBe('ATIVO');
    expect(v.iniciadoEm).not.toBeNull();

    const carteira = await personal.vinculos.meusAlunos('ATIVO');
    expect(carteira.some((x) => x.id === vinculoId)).toBe(true);
  });

  it('o aluno concede consentimento, com a finalidade vinda do contrato', async () => {
    const c = await aluno.consentimentos.conceder({ escopo: 'TREINO' });
    expect(c.escopo).toBe('TREINO');
    /*
      A finalidade é o texto que ele leu ao aceitar — a prova de finalidade
      específica que a LGPD pede. Vem de `FINALIDADE_POR_ESCOPO`, no contrato:
      deixar o cliente escolhê-la faria a prova valer nada, porque qualquer um
      poderia gravar "autorizo tudo" no lugar do termo real.
    */
    expect(c.finalidade.length).toBeGreaterThan(20);
    expect(c.revogadoEm).toBeNull();
    // Sem profissional = vale para a equipe inteira.
    expect(c.profissional).toBeNull();

    expect((await aluno.consentimentos.listar()).some((x) => x.id === c.id)).toBe(true);
  });

  it('revogar some da lista, mas a linha continua lá', async () => {
    const [c] = await aluno.consentimentos.listar();
    await aluno.consentimentos.revogar(c!.id);

    expect((await aluno.consentimentos.listar()).some((x) => x.id === c!.id)).toBe(false);
    // A prova de que existiu, e de quando deixou de valer, não se apaga.
    const antigo = (await aluno.consentimentos.listar(true)).find((x) => x.id === c!.id);
    expect(antigo?.revogadoEm).not.toBeNull();
  });

  it('qualquer lado encerra o vínculo', async () => {
    const v = await personal.vinculos.encerrar(vinculoId);
    expect(v.status).toBe('ENCERRADO');
    expect(v.encerradoEm).not.toBeNull();
  });
});
