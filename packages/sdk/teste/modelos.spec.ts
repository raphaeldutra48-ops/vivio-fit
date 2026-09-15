import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroApi } from '../src/erro';
import { VivioClient } from '../src/client';

/**
 * Modelos do profissional pelo SDK, sem API: anamnese, prescrição e o catálogo
 * de prescritíveis.
 *
 * O caso que manda aqui é a **competência profissional**. No Brasil a
 * prescrição de medicamento é privativa do médico (CRM); o nutricionista
 * prescreve suplemento e fitoterápico dentro da área dele (CFN). Essa tabela
 * vivia só em `@vivio/contracts` — do lado do cliente, onde um `insert` pelo
 * console do navegador passa por cima. Permitir o contrário seria facilitar
 * exercício ilegal da profissão, e é a única regra deste arquivo que não é
 * sobre organização.
 *
 * O resto persegue o de sempre: a biblioteca de um não encosta na do outro, e a
 * ordem gravada é a ordem que volta — um questionário embaralhado pergunta o
 * fim antes do começo.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK sem API: modelos do profissional', () => {
  const marca = `prova-modelo-${Date.now()}`;
  let admin: SupabaseClient;
  let nutriId = '';
  let modeloId = '';
  let suplementoId = '';
  let medicamentoGlobalId = '';

  const cliente = (): VivioClient =>
    new VivioClient({
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const nutri = cliente();
  const medico = cliente();

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });
    nutriId = (
      (await admin.from('User').select('id').eq('email', 'nutri@viviofit.com.br').single())
        .data as { id: string }
    ).id;

    // Um medicamento no catálogo GLOBAL: é o que o nutricionista alcança para
    // ler e não pode pôr numa prescrição.
    medicamentoGlobalId = `${marca}-med`;
    await admin.from('ItemPrescritivel').insert({
      id: medicamentoGlobalId,
      nome: `Losartana ${marca}`,
      tipo: 'MEDICAMENTO',
      escopo: 'GLOBAL',
      atualizadoEm: new Date().toISOString(),
    });

    await Promise.all([
      nutri.auth.login({ email: 'nutri@viviofit.com.br', senha: 'Senha@123' }),
      medico.auth.login({ email: 'medico@viviofit.com.br', senha: 'Senha@123' }),
    ]);
  });

  afterAll(async () => {
    await admin.from('ItemModeloPrescricao').delete().eq('modeloId', modeloId);
    await admin.from('ModeloPrescricao').delete().ilike('nome', `%${marca}%`);
    await admin.from('ItemPrescritivel').delete().ilike('nome', `%${marca}%`);
    await admin.from('PerguntaAnamnese').delete().ilike('texto', `%${marca}%`);
    await admin.from('ModeloAnamnese').delete().ilike('nome', `%${marca}%`);
  });

  // --- competência ----------------------------------------------------------

  it('o nutricionista não cadastra medicamento; suplemento, sim', async () => {
    const erro = await nutri.prescritiveis
      .criar({ nome: `Remédio ${marca}`, tipo: 'MEDICAMENTO' })
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);
    expect(erro?.status).toBe(403);

    // O par que precisa continuar passando: dentro da área dele, cadastra.
    const s = await nutri.prescritiveis.criar({
      nome: `Creatina ${marca}`,
      tipo: 'SUPLEMENTO',
      apresentacao: 'pote 300 g',
    });
    suplementoId = s.id;
    // Escopo e dono não vêm do corpo do pedido: quem os define é o gatilho.
    expect(s.escopo).toBe('PRIVADO');
    expect(s.criadoPorId).toBe(nutriId);
  });

  it('a recusa vale no banco, e não só na tela', async () => {
    /*
      Pelo SDK a conferência acontece antes de sair. Este teste vai pelo
      PostgREST cru, que é o caminho de quem abre o console do navegador — e é o
      único lugar onde a regra tem de valer de verdade.
    */
    const sessao = await nutri.supabase.db.auth.getSession();
    const r = await fetch(`${url}/rest/v1/ItemPrescritivel`, {
      method: 'POST',
      headers: {
        apikey: anon!,
        Authorization: `Bearer ${sessao.data.session!.access_token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        nome: `Direto ${marca}`,
        tipo: 'MEDICAMENTO',
        atualizadoEm: new Date().toISOString(),
      }),
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
  });

  it('o médico monta o modelo com medicamento; o nutricionista não', async () => {
    const doMedico = await medico.modelosPrescricao.criar({
      nome: `Hipertensão ${marca}`,
      itens: [
        { prescritivelId: medicamentoGlobalId, dose: 50, unidade: 'mg', frequencia: '1x ao dia', horarios: [] },
      ],
    });
    expect(doMedico.totalItens).toBe(1);
    expect(doMedico.itens[0]!.prescritivel.nome).toBe(`Losartana ${marca}`);
    expect(doMedico.itens[0]!.dose).toBe(50);

    /*
      Um modelo é uma prescrição pronta esperando um nome. Sem esta recusa, o
      nutricionista montaria o modelo com medicamento hoje e o emitiria amanhã.
    */
    const erro = await nutri.modelosPrescricao
      .criar({
        nome: `Contrabando ${marca}`,
        itens: [{ prescritivelId: medicamentoGlobalId, horarios: [] }],
      })
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);
    expect(erro).toBeInstanceOf(ErroApi);

    // E o que ele pode prescrever entra normalmente.
    const dele = await nutri.modelosPrescricao.criar({
      nome: `Suplementação ${marca}`,
      itens: [{ prescritivelId: suplementoId, dose: 5, unidade: 'g', horarios: ['08:00'] }],
    });
    modeloId = dele.id;
    expect(dele.itens[0]!.horarios).toEqual(['08:00']);
  });

  it('o modelo do outro não aparece na lista de ninguém', async () => {
    const dela = (await nutri.modelosPrescricao.listar()).map((m) => m.nome);
    expect(dela).toContain(`Suplementação ${marca}`);
    expect(dela).not.toContain(`Hipertensão ${marca}`);
  });

  // --- anamnese -------------------------------------------------------------

  it('o questionário volta na ordem gravada, com as opções só onde cabem', async () => {
    const m = await nutri.modelosAnamnese.criar({
      nome: `Triagem ${marca}`,
      perguntas: [
        { texto: `Come fora quantas vezes ${marca}`, tipo: 'NUMERO', opcoes: [], obrigatoria: true },
        {
          texto: `Qual refeição pula ${marca}`,
          tipo: 'ESCOLHA_UNICA',
          opcoes: ['Café', 'Almoço', 'Jantar'],
          obrigatoria: false,
        },
        // Opção em pergunta que não é de escolha é descartada: guardá-la
        // confunde quem lê o dado depois.
        { texto: `Observações ${marca}`, tipo: 'TEXTO_LONGO', opcoes: ['sobra'], obrigatoria: false },
      ],
    });

    expect(m.totalPerguntas).toBe(3);
    expect(m.perguntas.map((p) => p.ordem)).toEqual([0, 1, 2]);
    expect(m.perguntas[0]!.texto).toBe(`Come fora quantas vezes ${marca}`);
    expect(m.perguntas[1]!.opcoes).toEqual(['Café', 'Almoço', 'Jantar']);
    expect(m.perguntas[2]!.opcoes).toEqual([]);
  });

  it('salvar troca as perguntas inteiras, sem deixar órfã', async () => {
    const [antes] = await nutri.modelosAnamnese.listar();
    const depois = await nutri.modelosAnamnese.atualizar(antes!.id, {
      nome: `Triagem curta ${marca}`,
      perguntas: [{ texto: `Só uma ${marca}`, tipo: 'TEXTO', opcoes: [], obrigatoria: true }],
    });

    expect(depois.nome).toBe(`Triagem curta ${marca}`);
    expect(depois.totalPerguntas).toBe(1);

    const { count } = await admin
      .from('PerguntaAnamnese')
      .select('id', { count: 'exact', head: true })
      .eq('modeloId', antes!.id);
    expect(count).toBe(1);
  });

  it('o modelo de anamnese de outro profissional não se lê nem se edita', async () => {
    const [meu] = await nutri.modelosAnamnese.listar();
    expect(await medico.modelosAnamnese.listar()).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ id: meu!.id })]),
    );

    const erro = await medico.modelosAnamnese
      .atualizar(meu!.id, {
        nome: 'sequestrado',
        perguntas: [{ texto: 'x', tipo: 'TEXTO', opcoes: [], obrigatoria: false }],
      })
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);
    expect(erro?.status).toBe(404);
  });

  it('remover é carimbo: some da lista e a anamnese aplicada continua legível', async () => {
    const [meu] = await nutri.modelosAnamnese.listar();
    await nutri.modelosAnamnese.remover(meu!.id);
    expect((await nutri.modelosAnamnese.listar()).map((m) => m.id)).not.toContain(meu!.id);

    const { data } = await admin
      .from('ModeloAnamnese')
      .select('deletadoEm')
      .eq('id', meu!.id)
      .single();
    expect((data as { deletadoEm: string | null }).deletadoEm).not.toBeNull();
  });
});
