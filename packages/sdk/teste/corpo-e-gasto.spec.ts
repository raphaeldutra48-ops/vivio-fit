import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroApi } from '../src/erro';
import { VivioClient } from '../src/client';

/**
 * Cardio, calorimetria e avaliação física pelo SDK, sem API.
 *
 * Cada um tem um dono de escrita diferente, e a diferença não é organização:
 *
 * - **Cardio é autorrelato.** Quem correu foi o aluno; o profissional não sabe
 *   se houve corrida.
 * - **Calorimetria vem de laboratório.** Lançam o aluno, com o laudo na mão, e
 *   o profissional que pediu — e quem digitou fica gravado.
 * - **Avaliação física é medida por alguém.** Dobra cutânea e bioimpedância
 *   dependem de quem opera o aparelho.
 *
 * E o caso que mais importa neste arquivo: a CALORIA de cada atividade só vai
 * para quem pode ver o corpo. `kcal = MET × 3,5 × peso / 200 × min` se inverte
 * com uma divisão, e tipo, intensidade e duração vêm na mesma resposta —
 * entregar a caloria a quem só tem TREINO seria entregar o peso por caminho
 * indireto, e o aluno teria autorizado uma coisa e revelado outra.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK sem API: corpo e gasto', () => {
  const marca = `prova-corpo-${Date.now()}`;
  const emailAluno = `${marca}@teste.com`;

  let admin: SupabaseClient;
  let alunoId = '';
  let personalId = '';
  let nutriId = '';
  let cardioId = '';

  const cliente = (): VivioClient =>
    new VivioClient({
      baseUrl: 'http://127.0.0.1:1',
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const aluno = cliente();
  const personal = cliente();
  const nutri = cliente();

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });
    const agora = new Date().toISOString();
    const idDe = async (email: string): Promise<string> =>
      ((await admin.from('User').select('id').eq('email', email).single()).data as { id: string })
        .id;
    personalId = await idDe('personal@viviofit.com.br');
    nutriId = await idDe('nutri@viviofit.com.br');

    const nova = await admin.auth.admin.createUser({
      email: emailAluno,
      password: 'Senha@123',
      email_confirm: true,
      user_metadata: { nome: 'Aluno do Gasto', papel: 'ALUNO' },
    });
    if (nova.error) throw new Error(`conta: ${nova.error.message}`);
    alunoId = nova.data.user!.id;

    await admin.from('Vinculo').insert(
      [
        [personalId, 'PERSONAL'],
        [nutriId, 'NUTRICIONISTA'],
      ].map(([id, tipo], i) => ({
        id: `${marca}-v${i}`,
        alunoId,
        profissionalId: id,
        tipo,
        status: 'ATIVO',
        convidadoPorId: id,
        atualizadoEm: agora,
      })),
    );

    /*
      Consentimentos assimétricos de propósito.

      O cardio é de escopo TREINO: os DOIS precisam dele para ver a atividade.
      O peso é de escopo EVOLUCAO, e só a nutricionista o tem. É exatamente
      essa diferença que o teste da caloria mede — se os dois tivessem os
      mesmos escopos, ele não mediria nada.
    */
    await admin.from('Consentimento').insert([
      {
        id: `${marca}-c1`,
        alunoId,
        escopo: 'TREINO',
        profissionalId: personalId,
        finalidade: 'Prova',
        versaoTermo: '1',
      },
      {
        id: `${marca}-c2`,
        alunoId,
        escopo: 'TREINO',
        profissionalId: nutriId,
        finalidade: 'Prova',
        versaoTermo: '1',
      },
      {
        id: `${marca}-c3`,
        alunoId,
        escopo: 'EVOLUCAO',
        profissionalId: nutriId,
        finalidade: 'Prova',
        versaoTermo: '1',
      },
    ]);

    /*
      Um peso registrado: sem ele nenhuma caloria pode ser estimada, e todos os
      casos abaixo passariam com `null` por falta de dado, não por regra.

      Data fixa e antiga de propósito. Com "hoje", a avaliação de setembro
      cairia num dia ANTERIOR sempre que o teste rodasse depois das 21h de
      Brasília — `toISOString()` já estaria no dia seguinte, em UTC — e o peso
      que a avaliação repõe deixaria de ser o mais recente.
    */
    await admin.from('Medida').insert({
      id: `${marca}-m`,
      alunoId,
      data: '2026-01-05',
      pesoKg: 80,
      fonte: 'MANUAL',
      registradoPorId: alunoId,
      atualizadoEm: agora,
    });

    await Promise.all([
      aluno.auth.login({ email: emailAluno, senha: 'Senha@123' }),
      personal.auth.login({ email: 'personal@viviofit.com.br', senha: 'Senha@123' }),
      nutri.auth.login({ email: 'nutri@viviofit.com.br', senha: 'Senha@123' }),
    ]);
  });

  afterAll(async () => {
    await admin.from('AtividadeCardio').delete().eq('alunoId', alunoId);
    await admin.from('CalorimetriaIndireta').delete().eq('alunoId', alunoId);
    await admin.from('AvaliacaoFisica').delete().eq('alunoId', alunoId);
    await admin.from('Medida').delete().eq('alunoId', alunoId);
    await admin.from('Consentimento').delete().eq('alunoId', alunoId);
    await admin.from('Vinculo').delete().eq('alunoId', alunoId);
    await admin.from('PerfilAluno').delete().eq('userId', alunoId);
    await admin.from('User').delete().eq('id', alunoId);
    await admin.auth.admin.deleteUser(alunoId);
  });

  it('o aluno registra a própria corrida, com a caloria estimada', async () => {
    const c = await aluno.cardio.registrar(alunoId, {
      tipo: 'CORRIDA',
      intensidade: 'MODERADA',
      duracaoMin: 30,
      distanciaKm: 5,
      data: '2026-09-10',
    });
    cardioId = c.id;

    expect(c.duracaoMin).toBe(30);
    expect(c.distanciaKm).toBe(5);
    // O dia é o dia: `date` no banco, sem hora para o fuso empurrar.
    expect(c.data).toBe('2026-09-10');
    expect(c.caloriasEstimadas).toBeGreaterThan(0);
  });

  it('o profissional não registra cardio no nome do aluno', async () => {
    // Autorrelato: o personal não sabe se houve corrida, e um treino lançado
    // por ele viraria adesão que ninguém cumpriu.
    const erro = await personal.cardio
      .registrar(alunoId, {
        tipo: 'CORRIDA',
        intensidade: 'INTENSA',
        duracaoMin: 60,
        data: '2026-09-10',
      })
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);
    expect(erro).toBeInstanceOf(ErroApi);
  });

  it('a caloria só vai para quem pode ver o corpo', async () => {
    const dias = 3650;

    // A nutricionista tem EVOLUCAO: alcança o peso, e a estimativa sai.
    const dela = await nutri.cardio.listar(alunoId, dias);
    expect(dela).toHaveLength(1);
    expect(dela[0]!.caloriasEstimadas).toBeGreaterThan(0);

    /*
      O personal tem TREINO, e só. Ele vê a atividade — precisa ver, é o treino
      que ele acompanha — e a caloria chega nula, porque o peso não chega a ele.
      A regra não está nesta consulta: está na política de `Medida`.
    */
    const dele = await personal.cardio.listar(alunoId, dias);
    expect(dele).toHaveLength(1);
    expect(dele[0]!.duracaoMin).toBe(30);
    expect(dele[0]!.caloriasEstimadas).toBeNull();
  });

  it('apagar cardio é carimbo, e só o titular apaga', async () => {
    const erro = await personal.cardio
      .remover(alunoId, cardioId)
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);
    expect(erro?.status).toBe(404);

    await aluno.cardio.remover(alunoId, cardioId);
    expect(await aluno.cardio.listar(alunoId, 3650)).toHaveLength(0);

    const { data } = await admin
      .from('AtividadeCardio')
      .select('deletadoEm')
      .eq('id', cardioId)
      .single();
    expect((data as { deletadoEm: string | null }).deletadoEm).not.toBeNull();
  });

  it('a calorimetria é da nutricionista e do aluno; o personal nem lê', async () => {
    const e = await nutri.calorimetrias.registrar(alunoId, {
      data: '2026-06-01',
      tmbMedidaKcal: 1620,
      pesoNoExameKg: 80,
      equipamento: 'Analisador de gases',
    });
    expect(e.tmbMedidaKcal).toBe(1620);
    // Quem digitou fica gravado — o dado é de laboratório, não de percepção.
    expect(e.registradoPor.id).toBe(nutriId);
    expect(e.validade.valida).toBe(true);

    // O personal não vê calorimetria: a política de leitura é por papel.
    expect(await personal.calorimetrias.listar(alunoId)).toHaveLength(0);

    const erro = await personal.calorimetrias
      .registrar(alunoId, { data: '2026-06-02', tmbMedidaKcal: 1500 })
      .then(() => null)
      .catch((err: unknown) => err as ErroApi);
    expect(erro).toBeInstanceOf(ErroApi);
  });

  it('a avaliação física é do profissional, e ela repõe a medida do dia', async () => {
    /*
      Quem mede é quem tem EVOLUCAO: a avaliação É composição corporal, e o
      personal deste teste só acompanha o treino. Não é sobre o diploma dele —
      com consentimento de EVOLUCAO ele mediria igual.
    */
    const a = await nutri.avaliacoes.registrar(alunoId, {
      data: new Date('2026-09-11'),
      metodo: 'BIOIMPEDANCIA',
      pesoKg: 78,
      alturaCm: 175,
      percentualGordura: 18,
    });

    expect(a.resultado.percentualGordura).toBe(18);
    expect(a.resultado.massaGordaKg).toBeCloseTo(14.04, 2);
    expect(a.avaliador.id).toBe(nutriId);
    expect(a.resultado.imc).toBeCloseTo(25.5, 1);

    /*
      É essa parte que faz a avaliação valer: os gráficos de composição leem de
      `Medida`, e sem o upsert a adipometria de hoje não apareceria na curva.
    */
    const { data } = await admin
      .from('Medida')
      .select('pesoKg,percentualGordura,fonte')
      .eq('alunoId', alunoId)
      .eq('data', '2026-09-11')
      .single();
    const medida = data as { pesoKg: string; percentualGordura: string; fonte: string };
    expect(Number(medida.pesoKg)).toBe(78);
    expect(Number(medida.percentualGordura)).toBe(18);
    expect(medida.fonte).toBe('BIOIMPEDANCIA');
  });

  it('sem consentimento de EVOLUCAO o profissional não avalia', async () => {
    // O personal tem TREINO: acompanha o treino e não mede o corpo.
    const erro = await personal.avaliacoes
      .registrar(alunoId, {
        data: new Date('2026-09-14'),
        metodo: 'BIOIMPEDANCIA',
        pesoKg: 78,
        percentualGordura: 20,
      })
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);
    expect(erro?.status).toBe(403);
  });

  it('o aluno não se autoavalia: quem mede é quem opera o aparelho', async () => {
    /*
      Dobra cutânea exige adipômetro e mão treinada; bioimpedância exige a
      balança. Aberto, o histórico ganharia números de composição sem ninguém
      por trás deles — números que viram meta, prescrição e conversa sobre o
      corpo da pessoa.
    */
    const erro = await aluno.avaliacoes
      .registrar(alunoId, {
        data: new Date('2026-09-12'),
        metodo: 'BIOIMPEDANCIA',
        pesoKg: 70,
        percentualGordura: 10,
      })
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);
    expect(erro).toBeInstanceOf(ErroApi);
  });

  it('dobra faltando é recusada antes de virar número no histórico', async () => {
    const erro = await nutri.avaliacoes
      .registrar(alunoId, {
        data: new Date('2026-09-13'),
        metodo: 'ADIPOMETRIA',
        protocolo: 'POLLOCK_7',
        sexo: 'M',
        idade: 30,
        pesoKg: 78,
        // Faltam cinco das sete: o somatório sairia menor e o percentual baixo
        // demais — plausível e errado, que é pior do que recusar.
        dobras: { PEITORAL: 10, ABDOMINAL: 20 },
      })
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);

    expect(erro?.status).toBe(409);
    expect(erro?.message).toContain('Faltam dobras');
  });

  it('o resumo de calorias separa musculação de cardio', async () => {
    const r = await aluno.cardio.calorias(alunoId, 3650);
    expect(r.pesoUsadoKg).toBe(78);
    // Sem atividade na janela (a única foi apagada): zero, e não um travessão.
    // "Você não queimou nada" é um fato; `null` se lê como "não carregou".
    expect(r.cardio.sessoes).toBe(0);
    expect(r.cardio.kcal).toBe(0);
  });
});
