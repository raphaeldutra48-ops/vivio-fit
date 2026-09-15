import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VivioClient } from '../src/client';

/**
 * O comparativo de evolução pelo SDK, sem API.
 *
 * É o documento que a pessoa leva para casa, e por isso o que ele NÃO afirma
 * importa tanto quanto o que afirma:
 *
 * - Sem um dos lados, a diferença é `null` — nunca zero. Zero significaria "não
 *   mudou", que é uma afirmação sobre o corpo de alguém.
 * - A foto entra quando o aluno liberou, e quem decide isso é a política, a
 *   mesma da tela de evolução. Um comparativo bonito não fura a escolha dela.
 * - O "antes" é a medida mais recente DENTRO da janela do alvo, e não a mais
 *   antiga que existir: senão um aluno de dois anos de casa compararia hoje com
 *   o primeiro dia, o que não é um comparativo de 60 dias.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

describe.skipIf(!url || !anon || !servico)('SDK sem API: comparativo', () => {
  const marca = `prova-comp-${Date.now()}`;
  const emailAluno = `${marca}@teste.com`;

  let admin: SupabaseClient;
  let alunoId = '';
  let personalId = '';
  let chaveDaFoto = '';

  const cliente = (): VivioClient =>
    new VivioClient({
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const aluno = cliente();
  const personal = cliente();

  const dia = (n: number): string =>
    new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });
    const agora = new Date().toISOString();
    personalId = (
      (await admin.from('User').select('id').eq('email', 'personal@viviofit.com.br').single())
        .data as { id: string }
    ).id;

    const nova = await admin.auth.admin.createUser({
      email: emailAluno,
      password: 'Senha@123',
      email_confirm: true,
      user_metadata: { nome: `Aluno do comparativo ${marca}`, papel: 'ALUNO' },
    });
    if (nova.error) throw new Error(`conta: ${nova.error.message}`);
    alunoId = nova.data.user!.id;

    await admin.from('Vinculo').insert({
      id: `${marca}-v`,
      alunoId,
      profissionalId: personalId,
      tipo: 'PERSONAL',
      status: 'ATIVO',
      convidadoPorId: personalId,
      atualizadoEm: agora,
    });
    await admin.from('Consentimento').insert({
      id: `${marca}-c`,
      alunoId,
      escopo: 'EVOLUCAO',
      profissionalId: personalId,
      finalidade: 'Prova',
      versaoTermo: '1',
    });

    /*
      Três medidas: a de hoje, a de ~60 dias atrás (o "antes" que deve ser
      escolhido) e uma bem antiga. A antiga existe justamente para o teste poder
      falhar se a busca pegar a mais velha em vez da mais próxima do alvo.
    */
    await admin.from('Medida').insert(
      [
        { d: dia(0), peso: 78, gordura: 18, cintura: 84 },
        { d: dia(58), peso: 84, gordura: 24, cintura: 92 },
        { d: dia(400), peso: 95, gordura: 31, cintura: 105 },
      ].map((m, i) => ({
        id: `${marca}-m${i}`,
        alunoId,
        data: m.d,
        pesoKg: m.peso,
        percentualGordura: m.gordura,
        cinturaCm: m.cintura,
        fonte: 'MANUAL',
        registradoPorId: alunoId,
        atualizadoEm: agora,
      })),
    );

    await Promise.all([
      aluno.auth.login({ email: emailAluno, senha: 'Senha@123' }),
      personal.auth.login({ email: 'personal@viviofit.com.br', senha: 'Senha@123' }),
    ]);
  });

  afterAll(async () => {
    if (chaveDaFoto) {
      await admin.storage.from('evolucao').remove([chaveDaFoto.replace('evolucao/', '')]);
    }
    await admin.from('FotoEvolucao').delete().eq('alunoId', alunoId);
    await admin.from('Medida').delete().eq('alunoId', alunoId);
    await admin.from('Consentimento').delete().eq('alunoId', alunoId);
    await admin.from('Vinculo').delete().eq('alunoId', alunoId);
    await admin.from('PerfilAluno').delete().eq('userId', alunoId);
    await admin.from('User').delete().eq('id', alunoId);
    await admin.auth.admin.deleteUser(alunoId);
  });

  it('o "antes" é a medida próxima do alvo, não a mais antiga que existir', async () => {
    const c = await personal.comparativo.montar(alunoId, 60);

    expect(c.aluno.id).toBe(alunoId);
    expect(c.agora.pesoKg).toBe(78);
    // 84 (58 dias atrás), e não 95 (400 dias atrás).
    expect(c.antes.pesoKg).toBe(84);
    expect(c.antes.data).toBe(dia(58));
  });

  it('a diferença sai com sinal, e cada medida com a sua', async () => {
    const c = await personal.comparativo.montar(alunoId, 60);

    expect(c.diferenca.pesoKg).toBe(-6);
    expect(c.diferenca.percentualGordura).toBe(-6);
    expect(c.diferenca.cinturaCm).toBe(-8);
    /*
      Quadril não foi medido em nenhum dos dois lados: a diferença é `null`, e
      não zero. Zero diria "o quadril não mudou" — uma afirmação sobre o corpo
      da pessoa que ninguém mediu.
    */
    expect(c.diferenca.quadrilCm).toBeNull();
    expect(c.agora.quadrilCm).toBeNull();
  });

  it('janela sem medida devolve o lado vazio, e não a medida mais próxima', async () => {
    // 200 dias atrás não há nada dentro da tolerância de 21 dias.
    const c = await personal.comparativo.montar(alunoId, 200);
    expect(c.antes.data).toBeNull();
    expect(c.antes.pesoKg).toBeNull();
    expect(c.diferenca.pesoKg).toBeNull();
    // E o lado de hoje continua cheio: o documento não some por causa do outro.
    expect(c.agora.pesoKg).toBe(78);
  });

  it('a foto só entra quando o aluno liberou', async () => {
    chaveDaFoto = await aluno.midia.enviar('FOTO_EVOLUCAO', new Blob([PNG]), 'image/png');
    await aluno.fotos.registrar(alunoId, {
      chave: chaveDaFoto,
      mimeType: 'image/png',
      tamanhoBytes: PNG.byteLength,
      data: new Date(),
      angulo: 'FRENTE',
      visivelPara: [],
    });

    // Sem liberação: o documento sai só com os números.
    const fechado = await personal.comparativo.montar(alunoId, 60);
    expect(fechado.agora.fotos).toHaveLength(0);
    // A titular vê a própria foto, sempre.
    expect((await aluno.comparativo.montar(alunoId, 60)).agora.fotos).toHaveLength(1);

    const [foto] = await aluno.fotos.listar(alunoId);
    await aluno.fotos.definirVisibilidade(alunoId, foto!.id, ['PERSONAL']);

    const aberto = await personal.comparativo.montar(alunoId, 60);
    expect(aberto.agora.fotos).toHaveLength(1);
    expect(aberto.agora.fotos[0]!.angulo).toBe('FRENTE');
    expect((await fetch(aberto.agora.fotos[0]!.url)).status).toBe(200);
  });

  it('sem treino no período, o bloco de treino é nulo — não zerado', async () => {
    const c = await personal.comparativo.montar(alunoId, 60);
    // "Nenhum treino no período" e "não olhamos o treino" se leem diferente num
    // documento que a pessoa leva para casa.
    expect(c.treino).toBeNull();
  });
});
