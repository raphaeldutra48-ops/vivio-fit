import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { VivioClient } from '../src/client';

/**
 * A leitura pelo SDK volta a aparecer em "quem viu meus dados".
 *
 * O interceptor da API anotava cada acesso; com o SDK lendo direto do banco,
 * de 11/09 em diante nada foi anotado e a tela do titular parou no tempo. O que
 * este arquivo prova é o fio inteiro: a tela do profissional lê, o SDK avisa,
 * o banco decide LER ou NEGADO pela sessão, e o aluno enxerga.
 *
 * A anotação não é esperada pela leitura (não pode atrasá-la nem derrubá-la),
 * então as asserções aguardam a linha aparecer em vez de contar com ela na hora.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK: a leitura entra na trilha', () => {
  const marca = `prova-leitura-${Date.now()}`;
  const email = `${marca}@teste.com`;
  let admin: SupabaseClient;
  let idNoAuth = '';
  let alunoId = '';
  let personalId = '';

  const cliente = (): VivioClient =>
    new VivioClient({ supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false } });
  const aluno = cliente();
  const personal = cliente();

  const linhas = async (atorId: string) => {
    const r = await admin
      .from('LogAuditoria')
      .select('acao,recursoTipo,escopo,atorId')
      .eq('alunoId', alunoId)
      .eq('atorId', atorId);
    if (r.error) throw new Error(r.error.message);
    return r.data as { acao: string; recursoTipo: string; escopo: string; atorId: string }[];
  };

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });
    const agora = new Date().toISOString();
    personalId = (
      (await admin.from('User').select('id').eq('email', 'personal@viviofit.com.br').single())
        .data as { id: string }
    ).id;

    const nova = await admin.auth.admin.createUser({
      email,
      password: 'Senha@123',
      email_confirm: true,
      user_metadata: { nome: `Aluno ${marca}`, papel: 'ALUNO' },
    });
    if (nova.error) throw new Error(`conta: ${nova.error.message}`);
    idNoAuth = nova.data.user!.id;
    alunoId = idNoAuth;

    const vinculo = await admin.from('Vinculo').insert({
      id: `${marca}-v`,
      alunoId,
      profissionalId: personalId,
      tipo: 'PERSONAL',
      status: 'ATIVO',
      convidadoPorId: personalId,
      atualizadoEm: agora,
    });
    if (vinculo.error) throw new Error(`preparo: ${vinculo.error.message}`);
    // EVOLUCAO sim, CLINICO não: é o par LER / NEGADO.
    const consentimento = await admin.from('Consentimento').insert({
      id: `${marca}-c`,
      alunoId,
      escopo: 'EVOLUCAO',
      profissionalId: personalId,
      finalidade: 'Prova',
      versaoTermo: '1',
    });
    if (consentimento.error) throw new Error(`preparo: ${consentimento.error.message}`);

    await Promise.all([
      aluno.auth.login({ email, senha: 'Senha@123' }),
      personal.auth.login({ email: 'personal@viviofit.com.br', senha: 'Senha@123' }),
    ]);
  });

  afterAll(async () => {
    await admin.from('LogAuditoria').delete().eq('alunoId', alunoId);
    await admin.from('Consentimento').delete().eq('alunoId', alunoId);
    await admin.from('Vinculo').delete().eq('alunoId', alunoId);
    await admin.from('PerfilAluno').delete().eq('userId', alunoId);
    await admin.from('User').delete().eq('id', alunoId);
    if (idNoAuth) await admin.auth.admin.deleteUser(idNoAuth);
  });

  it('o profissional abrindo as medidas fica anotado como LER', async () => {
    await personal.medidas.listar(alunoId);
    await vi.waitFor(
      async () =>
        expect(await linhas(personalId)).toContainEqual(
          expect.objectContaining({ acao: 'LER', recursoTipo: 'MEDIDA', escopo: 'EVOLUCAO' }),
        ),
      { timeout: 8000, interval: 300 },
    );
  });

  it('abrir o que não foi autorizado fica anotado como NEGADO', async () => {
    // A política devolve a lista vazia; a trilha registra a tentativa.
    expect(await personal.exames.listar(alunoId)).toEqual([]);
    await vi.waitFor(
      async () =>
        expect(await linhas(personalId)).toContainEqual(
          expect.objectContaining({ acao: 'NEGADO', recursoTipo: 'EXAME', escopo: 'CLINICO' }),
        ),
      { timeout: 8000, interval: 300 },
    );
  });

  it('o aluno lendo o que é dele não entra na trilha', async () => {
    await aluno.medidas.listar(alunoId);
    await aluno.metas.listar(alunoId);
    await new Promise((r) => setTimeout(r, 1500));
    expect(await linhas(alunoId)).toEqual([]);
  });

  it('e o aluno enxerga, na tela dele, quem leu', async () => {
    const { dados } = await aluno.auditoria.meusAcessos({ limit: 50 });
    expect(dados).toContainEqual(
      expect.objectContaining({
        acao: 'LER',
        recursoTipo: 'MEDIDA',
        ator: expect.objectContaining({ id: personalId, papel: 'PERSONAL' }) as unknown,
      }),
    );
  });
});
