import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VivioClient } from '../src/client';

/**
 * Lembretes, aparelhos e notificações pelo SDK, sem API.
 *
 * Este grupo não tem vínculo nem consentimento no meio: a que horas alguém
 * quer ser cutucado, em que aparelho, e o que já foi avisado a ele não
 * interessa a quem o acompanha.
 *
 * O DISPARO continua na API — `lembretes.scheduler.ts` varre o que está na
 * hora e manda para o Expo. É servidor, não cliente. O que saiu daqui é a
 * metade que o app usa, e por isso `Notificacao` tem UPDATE e não tem INSERT:
 * quem cria aviso é quem dispara.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK sem API: lembretes', () => {
  const marca = `prova-lembrete-${Date.now()}`;
  const emailA = `${marca}-a@teste.com`;
  const emailB = `${marca}-b@teste.com`;
  const tokenDoAparelho = `ExponentPushToken[${marca}]`;

  let admin: SupabaseClient;
  let alunoA = '';
  let alunoB = '';
  let notificacaoId = '';
  /** Uma segunda que NUNCA é lida: é ela que prova a política de quem marca. */
  let naoLidaId = '';

  const cliente = (): VivioClient =>
    new VivioClient({
      baseUrl: 'http://127.0.0.1:1',
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const a = cliente();
  const b = cliente();

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });

    const criar = async (email: string, nome: string): Promise<string> => {
      const r = await admin.auth.admin.createUser({
        email,
        password: 'Senha@123',
        email_confirm: true,
        user_metadata: { nome, papel: 'ALUNO' },
      });
      if (r.error) throw new Error(`conta ${email}: ${r.error.message}`);
      return r.data.user!.id;
    };
    alunoA = await criar(emailA, 'Aluna A');
    alunoB = await criar(emailB, 'Aluno B');

    // Quem cria notificação é quem dispara — aqui, a chave de serviço.
    notificacaoId = `${marca}-n1`;
    const r = await admin.from('Notificacao').insert({
      id: notificacaoId,
      userId: alunoA,
      tipo: 'AGUA',
      titulo: 'Hora de beber água',
      corpo: 'Você está em 40% da meta de hoje.',
      referenteA: new Date().toISOString().slice(0, 10),
      agendadaPara: new Date().toISOString(),
      enviadaEm: new Date().toISOString(),
    });
    if (r.error) throw new Error(`notificacao: ${JSON.stringify(r.error)}`);

    naoLidaId = `${marca}-n2`;
    const r2 = await admin.from('Notificacao').insert({
      id: naoLidaId,
      userId: alunoA,
      tipo: 'TREINO',
      titulo: 'Treino de hoje',
      corpo: 'Treino A te espera.',
      referenteA: new Date().toISOString().slice(0, 10),
      agendadaPara: new Date().toISOString(),
      enviadaEm: new Date().toISOString(),
    });
    if (r2.error) throw new Error(`notificacao 2: ${JSON.stringify(r2.error)}`);

    await Promise.all([
      a.auth.login({ email: emailA, senha: 'Senha@123' }),
      b.auth.login({ email: emailB, senha: 'Senha@123' }),
    ]);
  });

  afterAll(async () => {
    for (const id of [alunoA, alunoB]) {
      await admin.from('Notificacao').delete().eq('userId', id);
      await admin.from('TokenDispositivo').delete().eq('userId', id);
      await admin.from('ConfiguracaoLembrete').delete().eq('alunoId', id);
      await admin.from('PerfilAluno').delete().eq('userId', id);
      await admin.from('User').delete().eq('id', id);
      await admin.auth.admin.deleteUser(id);
    }
  });

  it('o lembrete é por tipo, e definir de novo reescreve', async () => {
    const primeiro = await a.lembretes.definir({
      tipo: 'AGUA',
      horarios: ['09:00', '15:00'],
      diasDaSemana: [1, 2, 3, 4, 5],
      canais: ['PUSH'],
      ativo: true,
    });
    expect(primeiro.horarios).toEqual(['09:00', '15:00']);
    expect(primeiro.diasDaSemana).toEqual([1, 2, 3, 4, 5]);

    // Um por tipo: a segunda chamada não cria uma segunda linha de água.
    const segundo = await a.lembretes.definir({
      tipo: 'AGUA',
      horarios: ['10:00'],
      diasDaSemana: [6, 7],
      canais: ['PUSH'],
      ativo: false,
    });
    expect(segundo.id).toBe(primeiro.id);
    expect(segundo.horarios).toEqual(['10:00']);
    expect(segundo.ativo).toBe(false);

    expect(await a.lembretes.listar()).toHaveLength(1);
  });

  it('o lembrete de um não aparece para o outro', async () => {
    // A que horas alguém quer ser cutucado não interessa a mais ninguém.
    expect(await b.lembretes.listar()).toEqual([]);
  });

  it('o aparelho muda de dono quando a conta muda', async () => {
    /*
      Celular emprestado, troca de login: o mesmo token migra. Sem reatribuir,
      o dono anterior continuaria recebendo os lembretes de quem está com o
      aparelho na mão agora.
    */
    await a.lembretes.registrarDispositivo({ token: tokenDoAparelho, plataforma: 'ANDROID' });
    const depoisDeA = await admin
      .from('TokenDispositivo')
      .select('userId,ativo')
      .eq('token', tokenDoAparelho)
      .single();
    expect((depoisDeA.data as { userId: string }).userId).toBe(alunoA);

    await b.lembretes.registrarDispositivo({ token: tokenDoAparelho, plataforma: 'ANDROID' });
    const depoisDeB = await admin
      .from('TokenDispositivo')
      .select('userId,ativo')
      .eq('token', tokenDoAparelho)
      .single();
    expect((depoisDeB.data as { userId: string }).userId).toBe(alunoB);
    // Uma linha só: reatribuiu, não duplicou.
    const todas = await admin.from('TokenDispositivo').select('id').eq('token', tokenDoAparelho);
    expect(todas.data).toHaveLength(1);
  });

  it('sair carimba, e não apaga', async () => {
    /*
      Apagar perderia a informação de que aquele aparelho já esteve nesta
      conta — que é o que permite entender um push que chegou onde não devia.
    */
    await b.lembretes.removerDispositivo(tokenDoAparelho);
    const linha = await admin
      .from('TokenDispositivo')
      .select('ativo')
      .eq('token', tokenDoAparelho)
      .single();
    expect((linha.data as { ativo: boolean }).ativo).toBe(false);
  });

  it('a notificação chega ao dono, e só a ele', async () => {
    const dela = await a.lembretes.notificacoes();
    expect(dela.map((n) => n.id)).toContain(notificacaoId);
    expect(dela.find((n) => n.id === notificacaoId)!.lidaEm).toBeNull();

    expect(await b.lembretes.notificacoes()).toEqual([]);
  });

  it('lida uma vez, lida para sempre', async () => {
    await a.lembretes.marcarComoLida(notificacaoId);
    const primeira = (await a.lembretes.notificacoes()).find((n) => n.id === notificacaoId)!;
    expect(primeira.lidaEm).not.toBeNull();

    // Reabrir a lista não pode reescrever quando a pessoa viu o aviso.
    await a.lembretes.marcarComoLida(notificacaoId);
    const segunda = (await a.lembretes.notificacoes()).find((n) => n.id === notificacaoId)!;
    expect(segunda.lidaEm).toBe(primeira.lidaEm);
  });

  it('o app não escreve na própria caixa de avisos', async () => {
    /*
      Quem cria notificação é quem dispara. Um cliente que pudesse inserir
      faria a tela mostrar aviso que ninguém enviou — e, pior, reescreveria o
      texto de um que foi enviado de verdade.
    */
    const bruto = createClient(url!, anon!, { auth: { persistSession: false } });
    await bruto.auth.signInWithPassword({ email: emailA, password: 'Senha@123' });

    /*
      Dia diferente do aviso semeado de propósito: a tabela tem única por
      (usuário, tipo, dia), e repetir o mesmo dia faria a recusa vir da chave
      duplicada — o teste passaria sem nunca encostar na política.
    */
    const inseriu = await bruto.from('Notificacao').insert({
      id: `${marca}-falsa`,
      userId: alunoA,
      tipo: 'AGUA',
      titulo: 'Aviso inventado',
      corpo: 'Ninguém mandou isto.',
      referenteA: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
      agendadaPara: new Date().toISOString(),
    });
    expect(inseriu.error?.code).toBe('42501');
    expect(
      (await admin.from('Notificacao').select('id').eq('id', `${marca}-falsa`)).data ?? [],
    ).toEqual([]);

    // E o texto do que existe não se reescreve.
    await bruto
      .from('Notificacao')
      .update({ titulo: 'Outro título', corpo: 'Outro corpo' })
      .eq('id', notificacaoId);
    const guardada = (await a.lembretes.notificacoes()).find((n) => n.id === notificacaoId)!;
    expect(guardada.titulo).toBe('Hora de beber água');
  });

  it('ninguém marca como lido o aviso do outro', async () => {
    const lidaOriginal = (
      (await admin.from('Notificacao').select('lidaEm').eq('id', naoLidaId).single())
        .data as { lidaEm: string | null }
    ).lidaEm;

    const bruto = createClient(url!, anon!, { auth: { persistSession: false } });
    await bruto.auth.signInWithPassword({ email: emailB, password: 'Senha@123' });
    await bruto
      .from('Notificacao')
      .update({ lidaEm: new Date().toISOString() })
      .eq('id', naoLidaId);

    /*
      Quem confere é o ADMIN, e não a resposta do `update`.

      `.select()` depois de um update devolve as linhas que QUEM PEDIU pode
      ler — e B não lê o aviso de A. Resposta vazia ali não distingue "não
      mudou nada" de "mudou e não posso ver", e um teste que olhasse só para
      ela ficaria verde com a política aberta.
    */
    const noBanco = await admin
      .from('Notificacao')
      .select('lidaEm')
      .eq('id', naoLidaId)
      .single();
    // Continua sem ler: era nula antes, e é nula depois.
    expect((noBanco.data as { lidaEm: string | null }).lidaEm).toBe(lidaOriginal);
    expect(lidaOriginal).toBeNull();
  });
});
