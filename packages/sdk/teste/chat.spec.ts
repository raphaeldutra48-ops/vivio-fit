import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroApi } from '../src/erro';
import { VivioClient } from '../src/client';

/**
 * Conversa pelo SDK, sem API.
 *
 * O achado deste grupo: a política pedia o consentimento de MENSAGENS para
 * QUALQUER conversa — e o texto que o aluno lê ao decidir esse escopo é
 * "Permitir que os profissionais que me acompanham troquem mensagens ENTRE SI
 * sobre o meu acompanhamento".
 *
 * Ou seja, MENSAGENS autoriza a conversa da EQUIPE CLÍNICA, onde o aluno não
 * participa. Um aluno que lesse aquele texto e dissesse "não quero que falem
 * de mim entre si" perderia o próprio chat com quem o treina, tendo consentido
 * coisa nenhuma a respeito disso.
 *
 * O aluno deste arquivo NÃO tem consentimento de MENSAGENS de propósito.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK sem API: conversa', () => {
  const marca = `prova-chat-${Date.now()}`;
  const emailDoAluno = `${marca}@teste.com`;

  let admin: SupabaseClient;
  let alunoId = '';
  let personalId = '';
  let medicoId = '';
  let conversaId = '';

  const cliente = (): VivioClient =>
    new VivioClient({
      baseUrl: 'http://127.0.0.1:1',
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const personal = cliente();
  const aluno = cliente();
  const medico = cliente();

  const capturar = async (promessa: Promise<unknown>): Promise<ErroApi> => {
    const caiu = await promessa.then(() => null).catch((e: unknown) => e);
    if (!(caiu instanceof ErroApi)) throw new Error(`esperava recusa, veio ${JSON.stringify(caiu)}`);
    return caiu;
  };

  const erro = (r: { error: unknown }, o: string): void => {
    if (r.error) throw new Error(`${o}: ${JSON.stringify(r.error)}`);
  };

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });
    const agora = new Date().toISOString();

    const idDe = async (email: string): Promise<string> =>
      ((await admin.from('User').select('id').eq('email', email).single()).data as { id: string })
        .id;
    const ids = await Promise.all(
      ['personal@viviofit.com.br', 'medico@viviofit.com.br'].map(idDe),
    );
    personalId = ids[0]!;
    medicoId = ids[1]!;

    const criada = await admin.auth.admin.createUser({
      email: emailDoAluno,
      password: 'Senha@123',
      email_confirm: true,
      user_metadata: { nome: 'Aluna da Conversa', papel: 'ALUNO' },
    });
    if (criada.error) throw new Error(`conta: ${criada.error.message}`);
    alunoId = criada.data.user!.id;

    /*
      Vínculo ATIVO com o personal e NENHUM consentimento: o direito de
      conversar vem do vínculo — aceitar um profissional já é aceitar falar com
      ele. O médico fica sem vínculo, para provar o outro lado.
    */
    erro(
      await admin.from('Vinculo').insert({
        id: `${marca}-v`,
        alunoId,
        profissionalId: personalId,
        tipo: 'PERSONAL',
        status: 'ATIVO',
        convidadoPorId: personalId,
        atualizadoEm: agora,
      }),
      'vinculo',
    );

    await Promise.all([
      personal.auth.login({ email: 'personal@viviofit.com.br', senha: 'Senha@123' }),
      aluno.auth.login({ email: emailDoAluno, senha: 'Senha@123' }),
      medico.auth.login({ email: 'medico@viviofit.com.br', senha: 'Senha@123' }),
    ]);
  });

  afterAll(async () => {
    const conversas =
      ((await admin.from('Conversa').select('id').eq('alunoId', alunoId)).data as
        | { id: string }[]
        | null) ?? [];
    const ids = conversas.map((c) => c.id);
    if (ids.length > 0) {
      await admin.from('Mensagem').delete().in('conversaId', ids);
      await admin.from('ParticipanteConversa').delete().in('conversaId', ids);
      await admin.from('Conversa').delete().in('id', ids);
    }
    await admin.from('Vinculo').delete().eq('alunoId', alunoId);
    await admin.from('PerfilAluno').delete().eq('userId', alunoId);
    await admin.from('User').delete().eq('id', alunoId);
    if (alunoId) await admin.auth.admin.deleteUser(alunoId);
  });

  it('o vínculo ativo basta: a conversa abre sem consentimento de MENSAGENS', async () => {
    /*
      A prova do achado. Com a política antiga, este teste falharia — e falharia
      pedindo ao aluno uma autorização cujo texto fala de outra coisa.
    */
    const c = await personal.chat.abrir(alunoId);
    conversaId = c.id;

    expect(c.tipo).toBe('ALUNO_PROFISSIONAL');
    expect(c.alunoId).toBe(alunoId);
    expect(c.contraparte?.id).toBe(alunoId);
    expect(c.ultimaMensagem).toBeNull();
    expect(c.naoLidas).toBe(0);

    // E o aluno também a vê, com o profissional do outro lado.
    const dele = await aluno.chat.listarConversas();
    expect(dele.map((x) => x.id)).toContain(conversaId);
    expect(dele.find((x) => x.id === conversaId)!.contraparte?.id).toBe(personalId);
  });

  it('abrir de novo devolve a mesma caixa de entrada', async () => {
    // Duas caixas para a mesma dupla dividiriam a conversa em duas metades, e
    // cada lado responderia numa.
    const outra = await aluno.chat.abrir(personalId);
    expect(outra.id).toBe(conversaId);
  });

  it('sem vínculo não há conversa', async () => {
    const caiu = await capturar(medico.chat.abrir(alunoId));
    expect(caiu.codigo).toBe('ACESSO_NEGADO');
    // E ele não enxerga a que existe.
    expect(await medico.chat.listarConversas()).toEqual([]);
  });

  it('a mensagem chega do lado certo da tela para cada um', async () => {
    const enviada = await personal.chat.enviar(conversaId, {
      clienteUuid: crypto.randomUUID(),
      corpo: 'Bom dia! Como foi o treino?',
    });

    expect(enviada.corpo).toBe('Bom dia! Como foi o treino?');
    expect(enviada.minha).toBe(true);
    expect(enviada.autor.papel).toBe('PERSONAL');

    // `minha` é do ponto de vista de quem PERGUNTA: a mesma mensagem vai para
    // a direita de um e para a esquerda do outro.
    const paraOAluno = await aluno.chat.mensagens(conversaId);
    expect(paraOAluno.dados[0]!.id).toBe(enviada.id);
    expect(paraOAluno.dados[0]!.minha).toBe(false);
  });

  it('reenviar a mesma mensagem não vira duas bolhas', async () => {
    // Toque duplo, rede oscilando, fila offline: o `clienteUuid` é o mesmo.
    const uuid = crypto.randomUUID();
    const corpo = 'Foi bem, obrigado!';
    const primeira = await aluno.chat.enviar(conversaId, { clienteUuid: uuid, corpo });
    const repetida = await aluno.chat.enviar(conversaId, { clienteUuid: uuid, corpo: 'outra coisa' });

    expect(repetida.id).toBe(primeira.id);
    // E devolveu o que está gravado, não o que o reenvio dizia.
    expect(repetida.corpo).toBe(corpo);

    const todas = await personal.chat.mensagens(conversaId);
    expect(todas.dados.filter((m) => m.clienteUuid === uuid)).toHaveLength(1);
  });

  it('o não lido conta o que o outro mandou depois da última vez que abri', async () => {
    // O personal ainda não abriu desde a resposta do aluno.
    const antes = (await personal.chat.listarConversas()).find((c) => c.id === conversaId)!;
    expect(antes.naoLidas).toBe(1);
    expect(antes.ultimaMensagem?.corpo).toBe('Foi bem, obrigado!');

    await personal.chat.marcarVista(conversaId);
    const depois = (await personal.chat.listarConversas()).find((c) => c.id === conversaId)!;
    expect(depois.naoLidas).toBe(0);

    // A própria mensagem nunca conta como não lida.
    await personal.chat.enviar(conversaId, {
      clienteUuid: crypto.randomUUID(),
      corpo: 'Combinado.',
    });
    const aindaZero = (await personal.chat.listarConversas()).find((c) => c.id === conversaId)!;
    expect(aindaZero.naoLidas).toBe(0);
  });

  it('ninguém marca a conversa como vista pelo outro', async () => {
    /*
      Se desse, a conversa do outro apareceria lida sem ele ter aberto — e ele
      perderia a única marca de que havia algo novo.
    */
    const bruto = createClient(url!, anon!, { auth: { persistSession: false } });
    await bruto.auth.signInWithPassword({ email: emailDoAluno, password: 'Senha@123' });

    const antes = (await personal.chat.listarConversas()).find((c) => c.id === conversaId)!;
    expect(antes.naoLidas).toBe(0);

    const tentou = await bruto
      .from('ParticipanteConversa')
      .update({ vistoEm: new Date().toISOString() })
      .eq('conversaId', conversaId)
      .eq('userId', personalId)
      .select('userId');
    expect(tentou.data ?? []).toEqual([]);

    /*
      E o inverso: o aluno não abriu a conversa nenhuma vez, então continua
      com as duas mensagens do personal por ler. Se o carimbo dele tivesse
      sido mexido por fora, elas sumiriam da bolinha sem ele ter visto nada.
    */
    const dele = (await aluno.chat.listarConversas()).find((c) => c.id === conversaId)!;
    expect(dele.naoLidas).toBe(2);
  });

  it('mensagem enviada não se edita nem se apaga por fora', async () => {
    // Ela é o que a outra pessoa leu.
    const bruto = createClient(url!, anon!, { auth: { persistSession: false } });
    await bruto.auth.signInWithPassword({
      email: 'personal@viviofit.com.br',
      password: 'Senha@123',
    });
    const alvo = (await personal.chat.mensagens(conversaId)).dados[0]!;

    expect((await bruto.from('Mensagem').update({ corpo: 'reescrita' }).eq('id', alvo.id)).error)
      .not.toBeNull();
    expect((await bruto.from('Mensagem').delete().eq('id', alvo.id)).error).not.toBeNull();
  });

  it('escrever em conversa alheia não passa', async () => {
    const bruto = createClient(url!, anon!, { auth: { persistSession: false } });
    await bruto.auth.signInWithPassword({
      email: 'medico@viviofit.com.br',
      password: 'Senha@123',
    });
    const r = await bruto.from('Mensagem').insert({
      id: `${marca}-intruso`,
      conversaId,
      autorId: medicoId,
      corpo: 'Oi',
      clienteUuid: crypto.randomUUID(),
    });
    expect(r.error).not.toBeNull();
  });

  it('a paginação por cursor não repete nem pula mensagem', async () => {
    /*
      Numa conversa que recebe mensagem enquanto se rola, paginar por página
      traria de novo o que já apareceu. O cursor é a última já mostrada.
    */
    const uuids = Array.from({ length: 5 }, () => crypto.randomUUID());
    for (const [i, uuid] of uuids.entries()) {
      await personal.chat.enviar(conversaId, { clienteUuid: uuid, corpo: `linha ${i}` });
    }

    const pagina1 = await personal.chat.mensagens(conversaId, { limit: 3 });
    expect(pagina1.dados).toHaveLength(3);
    expect(pagina1.proximoCursor).not.toBeNull();

    const pagina2 = await personal.chat.mensagens(conversaId, {
      limit: 3,
      cursor: pagina1.proximoCursor!,
    });
    const ids = [...pagina1.dados, ...pagina2.dados].map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    // E vem do mais recente para o mais antigo.
    expect(pagina1.dados[0]!.enviadaEm >= pagina1.dados[2]!.enviadaEm).toBe(true);
  });
});
