import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { urlDoBanco } from '../conexao';

/**
 * Cadastro sem API: a conta nasce no Supabase Auth e o gatilho faz o resto.
 *
 * O que está sob teste é `criar_usuario_vivio`, e o ponto mais importante dele
 * não é criar a linha — é DESCONFIAR do metadado. `raw_user_meta_data` é o que
 * o navegador mandou no `signUp`: qualquer pessoa pode escrever
 * `{"papel":"ADMIN"}` ali, e o gatilho é a única coisa entre isso e uma conta
 * de administrador.
 *
 * Usa a API de administração do Auth em vez do `signUp` público de propósito:
 * `signUp` manda e-mail de confirmação de verdade, e teste não deve escrever
 * na caixa de ninguém.
 */
const urlSupabase = process.env.SUPABASE_URL;
const chaveServico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!urlSupabase || !chaveServico)('cadastro por gatilho', () => {
  const p = new PrismaClient({
    datasourceUrl: urlDoBanco(),
  });
  const marca = `prova-cad-${Date.now()}`;
  const criados: string[] = [];

  const cabecalhos = {
    apikey: chaveServico!,
    Authorization: `Bearer ${chaveServico!}`,
    'Content-Type': 'application/json',
  };

  /** Cria a conta no Auth e devolve o id. O gatilho corre logo depois. */
  async function criarNoAuth(email: string, meta: Record<string, unknown>): Promise<string> {
    const r = await fetch(`${urlSupabase}/auth/v1/admin/users`, {
      method: 'POST',
      headers: cabecalhos,
      body: JSON.stringify({
        email,
        password: 'Senha-de-prova-123',
        email_confirm: false,
        user_metadata: meta,
      }),
    });
    const j = (await r.json()) as { id?: string };
    if (!j.id) throw new Error(`Auth recusou: ${JSON.stringify(j)}`);
    criados.push(j.id);
    return j.id;
  }

  const apagarDoAuth = (id: string): Promise<Response> =>
    fetch(`${urlSupabase}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: cabecalhos });

  const confirmarEmail = (id: string): Promise<Response> =>
    fetch(`${urlSupabase}/auth/v1/admin/users/${id}`, {
      method: 'PUT',
      headers: cabecalhos,
      body: JSON.stringify({ email_confirm: true }),
    });

  afterAll(async () => {
    for (const id of criados) await apagarDoAuth(id);
    await p.perfilAluno.deleteMany({ where: { user: { email: { startsWith: marca } } } });
    await p.perfilProfissional.deleteMany({ where: { user: { email: { startsWith: marca } } } });
    await p.user.deleteMany({ where: { email: { startsWith: marca } } });
    await p.$disconnect();
  });

  it('o aluno nasce completo, com perfil e com o id do Auth', async () => {
    const email = `${marca}-aluno@teste.com`;
    const idAuth = await criarNoAuth(email, {
      nome: '  Joana da Prova  ',
      telefone: '11999990000',
      papel: 'ALUNO',
      dataNascimento: '1995-03-10',
      alturaCm: '168',
      objetivo: 'HIPERTROFIA',
    });

    const u = await p.user.findUniqueOrThrow({ where: { email }, include: { perfilAluno: true } });
    // O mesmo id dos dois lados é o que um dia deixa o hook de token ser
    // apagado em vez de mantido para sempre.
    expect(u.id).toBe(idAuth);
    expect(u.nome).toBe('Joana da Prova');
    expect(u.papel).toBe('ALUNO');
    expect(u.status).toBe('ATIVA');
    expect(u.perfilAluno?.alturaCm).toBe(168);
    expect(u.perfilAluno?.objetivo).toBe('HIPERTROFIA');
    expect(u.perfilAluno?.dataNascimento.toISOString().slice(0, 10)).toBe('1995-03-10');
  });

  it('o profissional nasce esperando a conferência do conselho', async () => {
    const email = `${marca}-pro@teste.com`;
    await criarNoAuth(email, {
      nome: 'Dr. Prova',
      papel: 'MEDICO',
      registroConselho: '123456',
      ufRegistro: 'sp',
      especialidades: ['Endocrinologia', 'Clínica'],
    });

    const u = await p.user.findUniqueOrThrow({
      where: { email },
      include: { perfilProfissional: true },
    });
    expect(u.papel).toBe('MEDICO');
    // Ninguém vira médico preenchendo formulário.
    expect(u.status).toBe('PENDENTE_VERIFICACAO');
    expect(u.perfilProfissional?.ufRegistro).toBe('SP');
    expect(u.perfilProfissional?.especialidades).toEqual(['Endocrinologia', 'Clínica']);
  });

  it('pedir papel ADMIN no metadado não faz ninguém admin', async () => {
    // O teste que mais importa deste arquivo.
    const email = `${marca}-admin@teste.com`;
    await criarNoAuth(email, { nome: 'Esperto', papel: 'ADMIN' });
    const u = await p.user.findUniqueOrThrow({ where: { email } });
    expect(u.papel).toBe('ALUNO');
  });

  it('papel inventado também cai para ALUNO', async () => {
    const email = `${marca}-nada@teste.com`;
    await criarNoAuth(email, { nome: 'Qualquer', papel: 'SUPERVISOR' });
    const u = await p.user.findUniqueOrThrow({ where: { email } });
    expect(u.papel).toBe('ALUNO');
  });

  it('recadastrar o mesmo e-mail reencontra o usuário em vez de duplicar', async () => {
    /*
      Cenário real: a conta do Auth some — a pessoa apagou, ou o suporte apagou
      — e ela se cadastra de novo. O histórico dela mora no `User`; criar um
      segundo deixaria treino, medida e exame órfãos do primeiro. E o metadado
      do segundo cadastro não pode reescrever nada.
    */
    const email = `${marca}-volta@teste.com`;
    const id1 = await criarNoAuth(email, { nome: 'Primeira Vez', papel: 'ALUNO' });
    const antes = await p.user.findUniqueOrThrow({ where: { email } });
    await apagarDoAuth(id1);

    await criarNoAuth(email, { nome: 'Impostora', papel: 'ADMIN' });
    const depois = await p.user.findMany({ where: { email } });
    expect(depois).toHaveLength(1);
    expect(depois[0]!.id).toBe(antes.id);
    expect(depois[0]!.nome).toBe('Primeira Vez');
    expect(depois[0]!.papel).toBe('ALUNO');
  });

  it('confirmar o e-mail ativa o aluno', async () => {
    const email = `${marca}-conf@teste.com`;
    const id = await criarNoAuth(email, { nome: 'Confirmada', papel: 'ALUNO' });
    // Aluno já nasce ATIVA por decisão de produto; forço PENDENTE para ver o
    // gatilho de confirmação agir de fato.
    await p.user.update({ where: { email }, data: { status: 'PENDENTE_VERIFICACAO' } });

    await confirmarEmail(id);

    const u = await p.user.findUniqueOrThrow({ where: { email } });
    expect(u.status).toBe('ATIVA');
    expect(u.emailVerifEm).not.toBeNull();
  });

  it('confirmar o e-mail NÃO libera o profissional', async () => {
    // Para ele o que falta não é provar o e-mail: é o admin conferir o
    // registro no conselho.
    const email = `${marca}-pro2@teste.com`;
    const id = await criarNoAuth(email, {
      nome: 'Dr. Espera',
      papel: 'PERSONAL',
      registroConselho: '999',
      ufRegistro: 'rj',
    });

    await confirmarEmail(id);

    const u = await p.user.findUniqueOrThrow({ where: { email } });
    expect(u.status).toBe('PENDENTE_VERIFICACAO');
  });
});
