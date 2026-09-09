import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CriarPlanoTreinoInput } from '@vivio/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VivioClient } from '../src/client';

/**
 * Treino realizado pelo SDK, sem API.
 *
 * Este é o caminho mais quente do app: o aluno aperta "concluir" com o celular
 * na mão, no meio da academia, e o envio pode chegar duas vezes porque a fila
 * local reenvia o que não teve resposta. O que este arquivo persegue é
 * justamente o segundo envio — e o que acontece com o histórico quando ele
 * chega.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK sem API: treino realizado', () => {
  const marca = `prova-exec-${Date.now()}`;
  const alunoId = `${marca}-aluno`;
  const supino = `${marca}-supino`;
  const remada = `${marca}-remada`;

  let admin: SupabaseClient;
  let sessaoA = '';
  let sessaoB = '';
  /** itens da sessão A, na ordem: supino, remada. */
  let itemSupino = '';
  let itemRemada = '';
  let itemDaOutraSessao = '';

  const cliente = (): VivioClient =>
    new VivioClient({
      baseUrl: 'http://127.0.0.1:1',
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const personal = cliente();
  const medico = cliente();

  const plano: CriarPlanoTreinoInput = {
    nome: 'Plano de execução',
    ativar: true,
    sessoes: [
      {
        nome: 'Treino A',
        itens: [
          { exercicioId: supino, series: 3, repsAlvo: '8-12' },
          { exercicioId: remada, series: 3, repsAlvo: '10' },
        ],
      },
      { nome: 'Treino B', itens: [{ exercicioId: remada, series: 3, repsAlvo: '12' }] },
    ],
  };

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });
    const erro = (r: { error: unknown }, o: string): void => {
      if (r.error) throw new Error(`${o}: ${JSON.stringify(r.error)}`);
    };
    const agora = new Date().toISOString();

    const pId = (
      (
        await admin
          .from('User')
          .select('id')
          .eq('email', 'personal@viviofit.com.br')
          .single()
      ).data as { id: string }
    ).id;

    erro(
      await admin.from('User').insert({
        id: alunoId,
        email: `${marca}@teste.com`,
        nome: 'Aluno de Execução',
        papel: 'ALUNO',
        status: 'ATIVA',
        atualizadoEm: agora,
      }),
      'aluno',
    );
    erro(
      await admin.from('Vinculo').insert({
        id: `${marca}-v`,
        alunoId,
        profissionalId: pId,
        tipo: 'PERSONAL',
        status: 'ATIVO',
        convidadoPorId: pId,
        atualizadoEm: agora,
      }),
      'vinculo',
    );
    erro(
      await admin.from('Consentimento').insert({
        id: `${marca}-c`,
        alunoId,
        escopo: 'TREINO',
        finalidade: 'Prova',
        versaoTermo: '1',
      }),
      'consentimento',
    );
    erro(
      await admin.from('Exercicio').insert([
        {
          id: supino,
          nome: 'Supino da Execução',
          grupoMuscular: 'PEITO',
          escopo: 'GLOBAL',
          atualizadoEm: agora,
        },
        {
          id: remada,
          nome: 'Remada da Execução',
          grupoMuscular: 'COSTAS',
          escopo: 'GLOBAL',
          atualizadoEm: agora,
        },
      ]),
      'exercicios',
    );

    await Promise.all([
      personal.auth.login({ email: 'personal@viviofit.com.br', senha: 'Senha@123' }),
      medico.auth.login({ email: 'medico@viviofit.com.br', senha: 'Senha@123' }),
    ]);

    const criado = await personal.treinos.criar(alunoId, plano);
    sessaoA = criado.sessoes[0]!.id;
    sessaoB = criado.sessoes[1]!.id;
    itemSupino = criado.sessoes[0]!.itens[0]!.id;
    itemRemada = criado.sessoes[0]!.itens[1]!.id;
    itemDaOutraSessao = criado.sessoes[1]!.itens[0]!.id;
  });

  afterAll(async () => {
    await admin.from('ExecucaoTreino').delete().eq('alunoId', alunoId);
    await admin.from('PlanoTreino').delete().eq('alunoId', alunoId);
    await admin.from('Consentimento').delete().eq('alunoId', alunoId);
    await admin.from('Vinculo').delete().eq('alunoId', alunoId);
    await admin.from('User').delete().eq('id', alunoId);
    await admin.from('Exercicio').delete().in('id', [supino, remada]);
  });

  const uuidPrimeiro = crypto.randomUUID();
  const uuidSegundo = crypto.randomUUID();

  it('grava o treino inteiro e conta o volume sem o aquecimento', async () => {
    const e = await personal.execucoes.registrar(alunoId, {
      clienteUuid: uuidPrimeiro,
      sessaoId: sessaoA,
      iniciadoEm: new Date('2026-04-01T10:00:00.000Z'),
      finalizadoEm: new Date('2026-04-01T11:00:00.000Z'),
      series: [
        // Aquecimento não conta como trabalho: quem faz cinco num dia e um no
        // outro veria o volume mudar sem ter treinado diferente.
        { itemTreinoId: itemSupino, serieNum: 1, repsFeitas: 15, cargaKg: 20, tipo: 'AQUECIMENTO' },
        { itemTreinoId: itemSupino, serieNum: 2, repsFeitas: 10, cargaKg: 60, tipo: 'NORMAL' },
        { itemTreinoId: itemSupino, serieNum: 3, repsFeitas: 8, cargaKg: 60, tipo: 'NORMAL' },
        { itemTreinoId: itemRemada, serieNum: 1, repsFeitas: 10, cargaKg: 40, tipo: 'NORMAL' },
      ],
      feedback: { dificuldade: 3, teveDor: false },
    });

    expect(e.jaRegistrada).toBeFalsy();
    expect(e.sessaoNome).toBe('Treino A');
    expect(e.duracaoSeg).toBe(3600);
    expect(e.totalSeries).toBe(3);
    // 60×10 + 60×8 + 40×10 = 1480. Com o aquecimento entraria 300 a mais.
    expect(e.volumeTotalKg).toBe(1480);
    expect(typeof e.series[0]!.cargaKg).toBe('number');
    expect(e.feedback?.dificuldade).toBe(3);

    // Primeira vez nos dois exercícios: não há o que superar, e encher a tela
    // de medalha no dia em que a pessoa só experimentou o aparelho transforma
    // a conquista em ruído.
    expect(e.recordes).toEqual([]);
  });

  it('o exercício da série é o do plano, e não o que o cliente mandar', async () => {
    /*
      `exercicioId` é a chave estável do histórico — cada versão nova do plano
      cria itens novos, e o gráfico de carga se perderia a cada ajuste. Um
      envio adulterado apontando para outro exercício contaminaria a
      progressão de um com as séries do outro.
    */
    const bruto = createClient(url!, anon!, { auth: { persistSession: false } });
    await bruto.auth.signInWithPassword({
      email: 'personal@viviofit.com.br',
      password: 'Senha@123',
    });

    const uuid = crypto.randomUUID();
    const r = await bruto.rpc('registrar_execucao', {
      p_aluno_id: alunoId,
      p_dados: {
        clienteUuid: uuid,
        sessaoId: sessaoA,
        iniciadoEm: '2026-04-02T10:00:00.000Z',
        series: [
          // Item do supino, mentindo que o exercício é a remada.
          { itemTreinoId: itemSupino, serieNum: 1, repsFeitas: 5, cargaKg: 10, exercicioId: remada },
        ],
      },
    });
    expect(r.error).toBeNull();

    const gravada = await admin
      .from('SerieExecutada')
      .select('exercicioId')
      .eq('execucaoId', (r.data as { id: string }).id);
    expect((gravada.data as { exercicioId: string }[])[0]!.exercicioId).toBe(supino);

    await admin.from('ExecucaoTreino').delete().eq('clienteUuid', uuid);
  });

  it('reenviar a fila offline não duplica treino', async () => {
    /*
      A rede caiu, o app reabriu, a fila repetiu. O segundo envio tem de
      devolver o que já está gravado — e não pode ser erro: erro faria o item
      ficar na fila para sempre.
    */
    const repetido = await personal.execucoes.registrar(alunoId, {
      clienteUuid: uuidPrimeiro,
      sessaoId: sessaoA,
      iniciadoEm: new Date('2026-04-01T10:00:00.000Z'),
      series: [{ itemTreinoId: itemSupino, serieNum: 1, repsFeitas: 1, cargaKg: 1, tipo: 'NORMAL' }],
    });

    expect(repetido.jaRegistrada).toBe(true);
    // E devolveu o treino de verdade, não o que o reenvio dizia.
    expect(repetido.volumeTotalKg).toBe(1480);

    const linhas = await admin
      .from('ExecucaoTreino')
      .select('id')
      .eq('clienteUuid', uuidPrimeiro);
    expect(linhas.data).toHaveLength(1);
  });

  it('subir a carga vira medalha, com o número anterior junto', async () => {
    const e = await personal.execucoes.registrar(alunoId, {
      clienteUuid: uuidSegundo,
      sessaoId: sessaoA,
      iniciadoEm: new Date('2026-04-08T10:00:00.000Z'),
      finalizadoEm: new Date('2026-04-08T11:00:00.000Z'),
      series: [
        { itemTreinoId: itemSupino, serieNum: 1, repsFeitas: 10, cargaKg: 65, tipo: 'NORMAL' },
        { itemTreinoId: itemSupino, serieNum: 2, repsFeitas: 10, cargaKg: 65, tipo: 'NORMAL' },
        // Mesma carga da outra vez: empate não é recorde. Se empate contasse,
        // todo treino de manutenção viraria medalha e o aviso perderia sentido.
        { itemTreinoId: itemRemada, serieNum: 1, repsFeitas: 10, cargaKg: 40, tipo: 'NORMAL' },
      ],
    });

    const peso = e.recordes.find((r) => r.tipo === 'PESO' && r.exercicioId === supino);
    expect(peso).toBeDefined();
    expect(peso!.valor).toBe(65);
    // "de 60 para 65" vale mais que só "65".
    expect(peso!.anterior).toBe(60);
    expect(peso!.exercicioNome).toBe('Supino da Execução');

    expect(e.recordes.some((r) => r.exercicioId === remada)).toBe(false);
  });

  it('a coluna ANTERIOR traz a última sessão, e só ela', async () => {
    const a = await personal.execucoes.anteriores(alunoId, sessaoA);

    // Duas sessões já foram feitas; a coluna mostra a de 08/04, não as duas
    // somadas — juntar séries de dias diferentes na mesma lista não é
    // "quanto eu fiz da outra vez".
    expect(a.porExercicio[supino]).toHaveLength(2);
    expect(a.porExercicio[supino]!.every((s) => s.cargaKg === 65)).toBe(true);
    expect(a.ultimaVezEm[supino]!.slice(0, 10)).toBe('2026-04-08');

    expect(a.sugestao[supino]).toBeDefined();
    expect(a.sugestao[remada]).toBeDefined();
  });

  it('série de outra sessão é recusada, e nada fica pela metade', async () => {
    const uuid = crypto.randomUUID();
    await expect(
      personal.execucoes.registrar(alunoId, {
        clienteUuid: uuid,
        sessaoId: sessaoA,
        iniciadoEm: new Date('2026-04-15T10:00:00.000Z'),
        series: [
          { itemTreinoId: itemSupino, serieNum: 1, repsFeitas: 10, cargaKg: 60, tipo: 'NORMAL' },
          // Este item é do Treino B: aceitá-lo contaminaria o histórico de
          // carga com séries de outro plano.
          { itemTreinoId: itemDaOutraSessao, serieNum: 1, repsFeitas: 10, cargaKg: 50, tipo: 'NORMAL' },
        ],
      }),
    ).rejects.toMatchObject({ codigo: 'CONFLITO' });

    const sobrou = await admin.from('ExecucaoTreino').select('id').eq('clienteUuid', uuid);
    expect(sobrou.data ?? []).toEqual([]);
  });

  it('a tabela de execução não aceita escrita direta', async () => {
    /*
      A idempotência e o congelamento do exercício moram na função. Com a
      tabela aberta, um envio direto criaria o segundo treino que a fila
      offline existe para evitar.
    */
    const bruto = createClient(url!, anon!, { auth: { persistSession: false } });
    await bruto.auth.signInWithPassword({
      email: 'personal@viviofit.com.br',
      password: 'Senha@123',
    });

    const r = await bruto.from('ExecucaoTreino').insert({
      id: `${marca}-na-marra`,
      alunoId,
      sessaoId: sessaoA,
      clienteUuid: crypto.randomUUID(),
      iniciadoEm: new Date().toISOString(),
    });
    expect(r.error).not.toBeNull();

    // E o caminho normal continua funcionando — é a outra metade da prova.
    expect(await personal.execucoes.listar(alunoId)).not.toHaveLength(0);
  });

  it('o histórico de carga agrupa por dia e ignora o aquecimento', async () => {
    const h = await personal.execucoes.historicoDeCarga(alunoId, supino);

    expect(h.exercicioNome).toBe('Supino da Execução');
    expect(h.pontos.map((p) => p.data)).toEqual(['2026-04-01', '2026-04-08']);
    // No dia 1 houve aquecimento de 20 kg; a carga máxima é a de trabalho.
    expect(h.pontos[0]!.cargaMaximaKg).toBe(60);
    expect(h.pontos[0]!.volumeKg).toBe(1080);
    expect(h.pontos[1]!.cargaMaximaKg).toBe(65);
  });

  it('quem não cuida da pessoa não vê treino nenhum', async () => {
    expect(await medico.execucoes.listar(alunoId)).toEqual([]);
  });

  it('dor relatada segura a sugestão de subir carga', async () => {
    /*
      A guarda que vem ANTES do número: quem completou as repetições sentindo
      dor é exatamente quem não deve subir carga — e é quem a regra numérica
      sozinha mandaria subir.
    */
    await personal.execucoes.registrar(alunoId, {
      clienteUuid: crypto.randomUUID(),
      sessaoId: sessaoB,
      iniciadoEm: new Date('2026-04-20T10:00:00.000Z'),
      series: [
        { itemTreinoId: itemDaOutraSessao, serieNum: 1, repsFeitas: 12, cargaKg: 45, tipo: 'NORMAL' },
        { itemTreinoId: itemDaOutraSessao, serieNum: 2, repsFeitas: 12, cargaKg: 45, tipo: 'NORMAL' },
        { itemTreinoId: itemDaOutraSessao, serieNum: 3, repsFeitas: 12, cargaKg: 45, tipo: 'NORMAL' },
      ],
      feedback: { dificuldade: 4, teveDor: true, localDor: 'Ombro', dorTipo: 'FISGADA' },
    });

    const a = await personal.execucoes.anteriores(alunoId, sessaoB);
    // Fechou o topo da faixa nas três séries: sem a dor, a dupla progressão
    // mandaria aumentar.
    expect(a.sugestao[remada]!.acao).not.toBe('AUMENTAR');
  });
});
