import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroApi } from '../src/erro';
import { VivioClient } from '../src/client';

/**
 * Check-in diário pelo SDK, sem API.
 *
 * A conta do painel já tem teste próprio em `@vivio/contracts`, sem banco. O
 * que falta provar aqui é a REGRA — a janela retroativa de três dias, que
 * agora vive num gatilho.
 *
 * Ela não é detalhe: sem janela, preencher três meses de uma vez transforma a
 * adesão num número que a pessoa ESCREVE em vez de um que ela vive, e é desse
 * número que o personal tira a decisão de ligar. Quem tem interesse em
 * contornar isso é exatamente quem escreve o pedido — por isso a regra desceu
 * para o banco.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK sem API: check-in diário', () => {
  const marca = `prova-checkin-${Date.now()}`;
  const alunoId = `${marca}-aluno`;
  const email = `${marca}@teste.com`;
  let admin: SupabaseClient;
  let idNoAuth = '';

  const cliente = (): VivioClient =>
    new VivioClient({
      baseUrl: 'http://127.0.0.1:1',
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const aluno = cliente();
  const personal = cliente();

  const cabecalhos = (): Record<string, string> => ({
    apikey: servico!,
    Authorization: `Bearer ${servico!}`,
    'Content-Type': 'application/json',
  });

  /** O dia em UTC, que é como a coluna `@db.Date` guarda. */
  const diaUtc = (recuo = 0): string =>
    new Date(Date.now() - recuo * 86_400_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });
    const pId = (
      (await admin.from('User').select('id').eq('email', 'personal@viviofit.com.br').single())
        .data as { id: string }
    ).id;

    await admin.from('User').insert({
      id: alunoId,
      email,
      nome: 'Aluno de Check-in',
      papel: 'ALUNO',
      status: 'ATIVA',
      atualizadoEm: new Date().toISOString(),
    });
    await admin.from('Vinculo').insert({
      id: `${marca}-v`,
      alunoId,
      profissionalId: pId,
      tipo: 'PERSONAL',
      status: 'ATIVO',
      convidadoPorId: pId,
      atualizadoEm: new Date().toISOString(),
    });
    await admin.from('Consentimento').insert({
      id: `${marca}-c`,
      alunoId,
      escopo: 'EVOLUCAO',
      finalidade: 'Prova',
      versaoTermo: '1',
    });

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
    await admin.from('CheckinDiario').delete().eq('alunoId', alunoId);
    await admin.from('Consentimento').delete().eq('alunoId', alunoId);
    await admin.from('Vinculo').delete().eq('alunoId', alunoId);
    await admin.from('User').delete().eq('id', alunoId);
    if (idNoAuth) {
      await fetch(`${url}/auth/v1/admin/users/${idNoAuth}`, {
        method: 'DELETE',
        headers: cabecalhos(),
      });
    }
  });

  it('o aluno registra o dia', async () => {
    const c = await aluno.checkins.registrar(alunoId, {
      data: diaUtc(),
      treinou: true,
      energia: 4,
      teveDor: false,
    });
    expect(c.data).toBe(diaUtc());
    expect(c.treinou).toBe(true);
    expect(c.energia).toBe(4);
  });

  it('registrar de novo no mesmo dia CORRIGE, não duplica', async () => {
    // Quem marcou "não treinei" de manhã e treinou à noite precisa consertar.
    const c = await aluno.checkins.registrar(alunoId, {
      data: diaUtc(),
      treinou: false,
      energia: 2,
      teveDor: true,
      localDor: 'Lombar',
    });
    expect(c.treinou).toBe(false);
    expect(c.localDor).toBe('Lombar');
    expect(await aluno.checkins.listar(alunoId)).toHaveLength(1);
  });

  it('local de dor sem dor é limpo pelo banco', async () => {
    /*
      Dor sem local é aceitável — nem sempre a pessoa sabe dizer onde. Local sem
      dor é contradição, e ficaria guardado para sempre. Some no gatilho em vez
      de depender de a tela lembrar de limpar o campo ao desmarcar.
    */
    const c = await aluno.checkins.registrar(alunoId, {
      data: diaUtc(),
      treinou: true,
      energia: 5,
      teveDor: false,
      localDor: 'Lombar',
    });
    expect(c.teveDor).toBe(false);
    expect(c.localDor).toBeNull();
  });

  it('ontem e anteontem passam', async () => {
    // Esquecer de registrar ontem é comum; proibir seria irritante.
    for (const recuo of [1, 2]) {
      const c = await aluno.checkins.registrar(alunoId, {
        data: diaUtc(recuo),
        treinou: true,
        energia: 3,
        teveDor: false,
      });
      expect(c.data).toBe(diaUtc(recuo));
    }
  });

  it('preencher o mês passado é recusado', async () => {
    // A regra que o aluno tem interesse em burlar, e por isso mora no banco.
    await expect(
      aluno.checkins.registrar(alunoId, {
        data: diaUtc(30),
        treinou: true,
        energia: 5,
        teveDor: false,
      }),
    ).rejects.toBeInstanceOf(ErroApi);
  });

  it('check-in de um dia que ainda não veio é recusado', async () => {
    await expect(
      aluno.checkins.registrar(alunoId, {
        data: diaUtc(-5),
        treinou: true,
        energia: 5,
        teveDor: false,
      }),
    ).rejects.toBeInstanceOf(ErroApi);
  });

  it('o personal lê o painel, com a adesão sobre dias registrados', async () => {
    const r = await personal.checkins.resumo(alunoId, 30);
    // Três dias registrados: hoje (não treinou, corrigido depois para treinou),
    // ontem e anteontem.
    expect(r.comCheckin).toBe(3);
    expect(r.dias).toBe(30);
    // O denominador é `comCheckin`, e não 30.
    expect(r.aderencia).toBe(Math.round((r.treinou / r.comCheckin) * 100));
    expect(r.diasSemCheckin).toBe(0);
  });

  it('quem não atende o aluno não registra por ele', async () => {
    const outro = cliente();
    await outro.auth.login({ email: 'nutri@viviofit.com.br', senha: 'Senha@123' });
    await expect(
      outro.checkins.registrar(alunoId, {
        data: diaUtc(),
        treinou: true,
        energia: 1,
        teveDor: false,
      }),
    ).rejects.toBeInstanceOf(ErroApi);
  });
});
