import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VivioClient } from '../src/client';

/**
 * Marcas pessoais e painel de progresso pelo SDK, sem API.
 *
 * Os dois são leitura pura: nada aqui é dado novo, tudo já existe em
 * execuções, check-ins e medidas. O que se prova é a **janela** — o painel
 * olha um período, a marca pessoal olha a vida inteira — e o que acontece nas
 * bordas dela, que é onde as duas telas discordariam sem ninguém notar.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

const DIA = 86_400_000;
/** Instante como a coluna `timestamp` o guarda: hora de UTC, sem `Z`. */
const haDias = (n: number): string => new Date(Date.now() - n * DIA).toISOString().slice(0, 23);
const diaDeHaDias = (n: number): string => new Date(Date.now() - n * DIA).toISOString().slice(0, 10);

describe.skipIf(!url || !anon || !servico)('SDK sem API: marcas e painel', () => {
  const marca = `prova-painel-${Date.now()}`;
  const alunoId = `${marca}-aluno`;
  const supino = `${marca}-supino`;
  const remada = `${marca}-remada`;
  /** Dia fixo em UTC, para as duas execuções de remada caírem no MESMO dia. */
  const diaDaRemada = diaDeHaDias(10);

  let admin: SupabaseClient;
  let personalId = '';

  const cliente = (): VivioClient =>
    new VivioClient({
      baseUrl: 'http://127.0.0.1:1',
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const personal = cliente();
  const medico = cliente();

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });
    const erro = (r: { error: unknown }, o: string): void => {
      if (r.error) throw new Error(`${o}: ${JSON.stringify(r.error)}`);
    };
    const agora = new Date().toISOString();

    personalId = (
      (await admin.from('User').select('id').eq('email', 'personal@viviofit.com.br').single())
        .data as { id: string }
    ).id;

    erro(
      await admin.from('User').insert({
        id: alunoId,
        email: `${marca}@teste.com`,
        nome: 'Aluno do Painel',
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
        profissionalId: personalId,
        tipo: 'PERSONAL',
        status: 'ATIVO',
        convidadoPorId: personalId,
        atualizadoEm: agora,
      }),
      'vinculo',
    );
    erro(
      await admin.from('Consentimento').insert([
        { id: `${marca}-ct`, alunoId, escopo: 'TREINO', finalidade: 'Prova', versaoTermo: '1' },
        {
          // O peso corporal é EVOLUCAO, não TREINO: o painel cruza os dois.
          id: `${marca}-ce`,
          alunoId,
          escopo: 'EVOLUCAO',
          finalidade: 'Prova',
          versaoTermo: '1',
        },
      ]),
      'consentimentos',
    );
    erro(
      await admin.from('Exercicio').insert([
        {
          id: supino,
          nome: 'Supino do Painel',
          grupoMuscular: 'PEITO',
          escopo: 'GLOBAL',
          atualizadoEm: agora,
        },
        {
          id: remada,
          nome: 'Remada do Painel',
          grupoMuscular: 'COSTAS',
          escopo: 'GLOBAL',
          atualizadoEm: agora,
        },
      ]),
      'exercicios',
    );

    // O plano existe só para as séries terem item; o painel não o consulta.
    erro(
      await admin.from('PlanoTreino').insert({
        id: `${marca}-plano`,
        alunoId,
        personalId,
        nome: 'Plano do Painel',
        status: 'ATIVO',
        atualizadoEm: agora,
      }),
      'plano',
    );
    erro(
      await admin
        .from('SessaoTreino')
        .insert({ id: `${marca}-sessao`, planoId: `${marca}-plano`, nome: 'A', ordem: 0 }),
      'sessao',
    );
    erro(
      await admin.from('ItemTreino').insert([
        {
          id: `${marca}-item-supino`,
          sessaoId: `${marca}-sessao`,
          exercicioId: supino,
          ordem: 0,
          series: 3,
          repsAlvo: '8-12',
        },
        {
          id: `${marca}-item-remada`,
          sessaoId: `${marca}-sessao`,
          exercicioId: remada,
          ordem: 1,
          series: 3,
          repsAlvo: '10',
        },
      ]),
      'itens',
    );

    const execucao = (
      id: string,
      iniciadoEm: string,
      duracaoSeg: number | null,
    ): Record<string, unknown> => ({
      id: `${marca}-${id}`,
      alunoId,
      sessaoId: `${marca}-sessao`,
      clienteUuid: crypto.randomUUID(),
      iniciadoEm,
      finalizadoEm: duracaoSeg === null ? null : iniciadoEm,
      duracaoSeg,
    });

    /*
      Cinco treinos, e três deles estão ali por um motivo específico:

        * `e45` é FORA da janela de 30 dias — é ele que separa as duas telas;
        * `e10a` e `e10b` caem no MESMO dia, em horas diferentes: é o caso em
          que a evolução de carga tem duas medições e um dia só;
        * `e3` não tem `finalizadoEm`: treino em andamento.
    */
    erro(
      await admin
        .from('ExecucaoTreino')
        .insert([
          execucao('e45', haDias(45), 1800),
          execucao('e20', haDias(20), 3600),
          execucao('e10a', `${diaDaRemada}T08:00:00.000`, 1800),
          execucao('e10b', `${diaDaRemada}T18:00:00.000`, 1800),
          execucao('e3', haDias(3), null),
        ]),
      'execucoes',
    );

    const serie = (
      id: string,
      execucao: string,
      exercicioId: string,
      serieNum: number,
      repsFeitas: number,
      cargaKg: number,
      tipo = 'NORMAL',
    ): Record<string, unknown> => ({
      id: `${marca}-${id}`,
      execucaoId: `${marca}-${execucao}`,
      itemTreinoId: `${marca}-item-${exercicioId === supino ? 'supino' : 'remada'}`,
      exercicioId,
      serieNum,
      repsFeitas,
      cargaKg,
      tipo,
    });

    erro(
      await admin.from('SerieExecutada').insert([
        // Há 45 dias: a maior carga da vida dele.
        serie('s1', 'e45', supino, 1, 5, 80),
        // Há 20 dias: aquecimento mais trabalho.
        serie('s2', 'e20', supino, 1, 15, 20, 'AQUECIMENTO'),
        serie('s3', 'e20', supino, 2, 10, 60),
        // Remada duas vezes no mesmo dia, com cargas diferentes.
        serie('s4', 'e10a', remada, 1, 10, 30),
        serie('s5', 'e10b', remada, 1, 10, 50),
        // Há 3 dias: e aqui ele REPETE os 80 kg de 45 dias atrás.
        serie('s6', 'e3', supino, 1, 10, 70),
        serie('s7', 'e3', supino, 2, 5, 80),
      ]),
      'series',
    );

    erro(
      await admin.from('Medida').insert([
        {
          id: `${marca}-m1`,
          alunoId,
          data: diaDeHaDias(20),
          pesoKg: 80,
          registradoPorId: personalId,
          atualizadoEm: agora,
        },
        {
          id: `${marca}-m2`,
          alunoId,
          data: diaDeHaDias(3),
          pesoKg: 78,
          registradoPorId: personalId,
          atualizadoEm: agora,
        },
      ]),
      'medidas',
    );

    await Promise.all([
      personal.auth.login({ email: 'personal@viviofit.com.br', senha: 'Senha@123' }),
      medico.auth.login({ email: 'medico@viviofit.com.br', senha: 'Senha@123' }),
    ]);
  });

  afterAll(async () => {
    await admin.from('ExecucaoTreino').delete().eq('alunoId', alunoId);
    await admin.from('Medida').delete().eq('alunoId', alunoId);
    await admin.from('PlanoTreino').delete().eq('alunoId', alunoId);
    await admin.from('Consentimento').delete().eq('alunoId', alunoId);
    await admin.from('Vinculo').delete().eq('alunoId', alunoId);
    await admin.from('User').delete().eq('id', alunoId);
    await admin.from('Exercicio').delete().in('id', [supino, remada]);
  });

  it('a marca pessoal olha a vida inteira, não a janela do painel', async () => {
    const r = await personal.recordes.meus(alunoId);
    const doSupino = r.marcas.find((m) => m.exercicioId === supino)!;

    // 80 kg foi há 45 dias — fora de qualquer janela, e ainda assim é o recorde.
    expect(doSupino.cargaMaximaKg).toBe(80);
    expect(doSupino.diasTreinados).toBe(3);
    expect(doSupino.ultimaEm).toBe(diaDeHaDias(3));
  });

  it('a data do recorde é a da conquista, não a da última repetição', async () => {
    /*
      Ele levantou 80 kg há 45 dias e repetiu há 3. Dizer "seu recorde é de
      anteontem" tira o sentido do número: o que a pessoa conquistou foi há
      mês e meio, e é essa data que mede o quanto ela andou desde então.
    */
    const r = await personal.recordes.meus(alunoId);
    const doSupino = r.marcas.find((m) => m.exercicioId === supino)!;
    expect(doSupino.cargaMaximaEm).toBe(diaDeHaDias(45));
  });

  it('a conquista mais recente vem primeiro, e não a mais pesada', async () => {
    /*
      Quem abre esta tela acabou de bater alguma coisa e quer ver aquilo. Por
      peso, o supino de 80 kg venceria sempre a remada de 50 — e a tela viraria
      um ranking de exercício em vez do progresso da pessoa.
    */
    const r = await personal.recordes.meus(alunoId);
    expect(r.total).toBe(2);
    expect(r.marcas[0]!.exercicioId).toBe(remada);
    expect(r.marcas[1]!.exercicioId).toBe(supino);
  });

  it('o aquecimento não vira recorde', async () => {
    const r = await personal.recordes.meus(alunoId);
    const doSupino = r.marcas.find((m) => m.exercicioId === supino)!;
    // 20 kg × 15 dá volume 300 numa série só; a de 70 × 10 dá 700.
    expect(doSupino.volumeMaximoSerieKg).toBe(700);
  });

  it('o painel conta só o que está dentro da janela', async () => {
    const p = await personal.progresso.painel(alunoId, 30);

    // Cinco treinos existem; quatro estão nos últimos 30 dias.
    expect(p.treino.total).toBe(4);
    // 60×10 (aquecimento fora) + 30×10 + 50×10 + (70×10 + 80×5).
    expect(p.treino.volumeKg).toBe(2500);
    expect(p.treino.diasSemTreinar).toBe(3);
  });

  it('treino em andamento não puxa a duração média para baixo', async () => {
    /*
      Sessão sem `finalizadoEm` tem duração nula. Contá-la como zero faria o
      personal ver "média de 30 minutos" para quem treina 40.
    */
    const p = await personal.progresso.painel(alunoId, 30);
    expect(p.treino.minutos).toBe(120);
    expect(p.treino.duracaoMediaMin).toBe(40);
  });

  it('a evolução de carga precisa de dois DIAS, não de duas medições', async () => {
    const p = await personal.progresso.painel(alunoId, 30);

    const doSupino = p.cargas.find((c) => c.exercicioId === supino);
    expect(doSupino).toBeDefined();
    expect(doSupino!.exercicioNome).toBe('Supino do Painel');
    expect(doSupino!.variacaoPercentual).toBeGreaterThan(0);

    /*
      A remada tem duas medições — 30 kg de manhã e 50 kg à tarde — e um dia só.
      Isso é um dia de teste de carga, não tendência: entrando, o painel
      anunciaria "+66%" e o personal ajustaria o programa por causa de uma
      tarde.
    */
    expect(p.cargas.some((c) => c.exercicioId === remada)).toBe(false);
  });

  it('a variação de peso vem das medidas, com sinal', async () => {
    const p = await personal.progresso.painel(alunoId, 30);
    expect(p.variacaoPesoKg).toBe(-2);
  });

  it('sem check-in nenhum, o painel diz "sem dado" em vez de zero', async () => {
    /*
      Zero significaria "registrou e não treinou". A tela precisa distinguir
      para não cobrar quem só não conhece o recurso.
    */
    const p = await personal.progresso.painel(alunoId, 30);
    expect(p.checkins).toBeNull();
  });

  it('quem não cuida da pessoa recebe painel vazio, e não erro', async () => {
    // Vazio e erro são coisas diferentes na tela: erro manda tentar de novo.
    const p = await medico.progresso.painel(alunoId, 30);
    expect(p.treino.total).toBe(0);
    expect(p.cargas).toEqual([]);
    expect(p.variacaoPesoKg).toBeNull();
    expect(await medico.recordes.meus(alunoId)).toEqual({ total: 0, marcas: [] });
  });
});
