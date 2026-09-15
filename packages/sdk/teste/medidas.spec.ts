import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroApi } from '../src/erro';
import { VivioClient } from '../src/client';

/**
 * Medida corporal pelo SDK, sem API.
 *
 * O CÁLCULO das séries já tem teste próprio em `@vivio/contracts`, com onze
 * casos e sem banco nenhum. O que falta provar é a outra metade — a BUSCA:
 * que a ordem chega crescente (a variação sai do primeiro e do último ponto,
 * então ordem errada inverte o sinal), que a medida apagada não entra, e que o
 * `numeric` que o PostgREST devolve como TEXTO vira número antes de virar
 * gráfico.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK sem API: medida corporal', () => {
  const marca = `prova-medida-${Date.now()}`;
  const alunoId = `${marca}-aluno`;
  let admin: SupabaseClient;

  const cliente = (): VivioClient =>
    new VivioClient({
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const personal = cliente();
  const nutri = cliente();

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });
    const idDe = async (email: string): Promise<string> =>
      ((await admin.from('User').select('id').eq('email', email).single()).data as { id: string })
        .id;
    const [pId, nId] = await Promise.all(
      ['personal@viviofit.com.br', 'nutri@viviofit.com.br'].map(idDe),
    );

    await admin.from('User').insert({
      id: alunoId,
      email: `${marca}@teste.com`,
      nome: 'Aluno de Medida',
      papel: 'ALUNO',
      status: 'ATIVA',
      atualizadoEm: new Date().toISOString(),
    });
    await admin.from('Vinculo').insert([
      {
        id: `${marca}-v1`,
        alunoId,
        profissionalId: pId,
        tipo: 'PERSONAL',
        status: 'ATIVO',
        convidadoPorId: pId,
        atualizadoEm: new Date().toISOString(),
      },
      {
        id: `${marca}-v2`,
        alunoId,
        profissionalId: nId,
        tipo: 'NUTRICIONISTA',
        status: 'ATIVO',
        convidadoPorId: nId,
        atualizadoEm: new Date().toISOString(),
      },
    ]);
    // Só EVOLUCAO, e só para o personal: é o que separa quem lê de quem não lê.
    await admin.from('Consentimento').insert({
      id: `${marca}-c`,
      alunoId,
      escopo: 'EVOLUCAO',
      profissionalId: pId,
      finalidade: 'Prova',
      versaoTermo: '1',
    });

    await Promise.all([
      personal.auth.login({ email: 'personal@viviofit.com.br', senha: 'Senha@123' }),
      nutri.auth.login({ email: 'nutri@viviofit.com.br', senha: 'Senha@123' }),
    ]);
  });

  afterAll(async () => {
    await admin.from('Medida').delete().eq('alunoId', alunoId);
    await admin.from('Consentimento').delete().eq('alunoId', alunoId);
    await admin.from('Vinculo').delete().eq('alunoId', alunoId);
    await admin.from('User').delete().eq('id', alunoId);
  });

  it('registra e lê de volta como NÚMERO, não como texto', async () => {
    /*
      O Postgres devolve `numeric` como texto pelo PostgREST. Se escapasse
      assim para a tela, um `peso > 80` compararia string com número — o que em
      JavaScript funciona por coerção e falha calado no primeiro peso de três
      dígitos, onde `"100" < "82.50"` é verdadeiro.
    */
    const m = await personal.medidas.registrar(alunoId, {
      data: new Date('2026-01-10'),
      pesoKg: 82.5,
      percentualGordura: 24,
      cinturaCm: 95,
      fonte: 'MANUAL',
    });
    expect(typeof m.pesoKg).toBe('number');
    expect(m.pesoKg).toBe(82.5);
    expect(m.data).toBe('2026-01-10');
  });

  it('a evolução vem em ordem crescente, e o sinal da variação depende disso', async () => {
    await personal.medidas.registrar(alunoId, {
      data: new Date('2026-02-10'),
      pesoKg: 80,
      percentualGordura: 22,
      cinturaCm: 91,
      fonte: 'MANUAL',
    });

    const e = await personal.medidas.evolucao(alunoId);
    expect(e.de).toBe('2026-01-10');
    expect(e.ate).toBe('2026-02-10');
    expect(e.totalMedicoes).toBe(2);

    const peso = e.series.find((s) => s.metrica === 'PESO');
    // Ordem invertida daria +2.5 e pintaria de vermelho quem emagreceu.
    expect(peso?.variacao).toBe(-2.5);
    expect(peso?.evoluiuBem).toBe(false);

    const cintura = e.series.find((s) => s.metrica === 'CINTURA');
    expect(cintura?.variacao).toBe(-4);
    // Para cintura, cair é progresso.
    expect(cintura?.evoluiuBem).toBe(true);
  });

  it('a listagem vem da mais recente para a mais antiga', async () => {
    // Ordem contrária à da evolução, de propósito: uma é histórico, a outra é
    // gráfico.
    const lista = await personal.medidas.listar(alunoId);
    expect(lista.map((m) => m.data)).toEqual(['2026-02-10', '2026-01-10']);
  });

  it('medida apagada não conta em lugar nenhum', async () => {
    await admin
      .from('Medida')
      .update({ deletadoEm: new Date().toISOString() })
      .eq('alunoId', alunoId)
      .eq('data', '2026-01-10');

    expect(await personal.medidas.listar(alunoId)).toHaveLength(1);
    const e = await personal.medidas.evolucao(alunoId);
    expect(e.totalMedicoes).toBe(1);
    // Com um ponto só, não há variação a exibir.
    expect(e.series.find((s) => s.metrica === 'PESO')?.variacao).toBeNull();
  });

  it('quem não tem consentimento de EVOLUCAO não vê nada — e não recebe erro', async () => {
    /*
      Com RLS, falta de consentimento é lista VAZIA, não 403. Quem precisa
      distinguir "não autorizou" de "não tem medida" pergunta em separado, e é
      isso que devolve às telas o aviso que a política silencia.
    */
    expect(await nutri.medidas.listar(alunoId)).toEqual([]);
    const e = await nutri.medidas.evolucao(alunoId);
    expect(e.totalMedicoes).toBe(0);
    expect(e.series).toEqual([]);
  });

  it('quem não atende o aluno não escreve medida nele', async () => {
    await expect(
      nutri.medidas.registrar(alunoId, { data: new Date(), pesoKg: 70, fonte: 'MANUAL' }),
    ).rejects.toBeInstanceOf(ErroApi);
  });

  it('pesar de novo no mesmo dia CORRIGE, e a correção fica gravada', async () => {
    /*
      A tabela tem única por (aluno, data): o segundo peso do dia é conserto do
      primeiro, não uma segunda medição. O SDK grava com `upsert`, e o caminho
      do conflito é um UPDATE.

      Este teste existe porque esse caminho passou muito tempo sem política de
      UPDATE: só o INSERT tinha regra, e corrigir o peso do dia devolvia "Você
      não tem acesso a este conteúdo" — sobre a própria medida que a pessoa
      tinha acabado de gravar. A mensagem apontava para consentimento e
      vínculo, que estavam certos.

      A conferência é no BANCO, e não na resposta do `upsert`: derrubar só a
      política e deixar o `grant` de pé é a mutação que reproduz o defeito, e é
      o banco que distingue "corrigiu" de "criou uma segunda linha".
    */
    const dia = '2026-05-20';
    await personal.medidas.registrar(alunoId, {
      data: new Date(dia),
      pesoKg: 92,
      cinturaCm: 98,
      fonte: 'MANUAL',
    });
    await personal.medidas.registrar(alunoId, {
      data: new Date(dia),
      pesoKg: 82,
      cinturaCm: 94,
      fonte: 'MANUAL',
    });

    const noBanco =
      ((await admin.from('Medida').select('pesoKg,cinturaCm').eq('alunoId', alunoId).eq('data', dia))
        .data as { pesoKg: string; cinturaCm: string }[] | null) ?? [];

    // Uma linha só: corrigiu, não duplicou.
    expect(noBanco).toHaveLength(1);
    expect(Number(noBanco[0]!.pesoKg)).toBe(82);
    expect(Number(noBanco[0]!.cinturaCm)).toBe(94);

    const listada = (await personal.medidas.listar(alunoId)).find((m) => m.data === dia);
    expect(listada?.pesoKg).toBe(82);
  });
});
