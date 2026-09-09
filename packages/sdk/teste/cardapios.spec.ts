import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CriarModeloCardapioInput } from '@vivio/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroApi } from '../src/erro';
import { VivioClient } from '../src/client';

/**
 * Modelo de cardápio pelo SDK, sem API.
 *
 * O molde não é dado de aluno: nenhum paciente aparece nele, e a pergunta que
 * a política faz é sempre a mesma — "é seu?".
 *
 * O que este arquivo persegue é a INDEPENDÊNCIA. Aplicar um molde cria uma
 * dieta separada: ajustar a dieta do paciente depois não pode mexer no molde,
 * e editar o molde não pode alterar dietas já entregues. Se os dois ficassem
 * ligados, mexer no molde mudaria o cardápio de dez pessoas de uma vez, sem
 * ninguém pedir.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK sem API: modelo de cardápio', () => {
  const marca = `prova-molde-${Date.now()}`;
  const alunoId = `${marca}-aluno`;
  const aveia = `${marca}-aveia`;
  const banana = `${marca}-banana`;

  let admin: SupabaseClient;
  let modeloId = '';

  const cliente = (): VivioClient =>
    new VivioClient({
      baseUrl: 'http://127.0.0.1:1',
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const nutri = cliente();
  const personal = cliente();

  const capturar = async (promessa: Promise<unknown>): Promise<ErroApi> => {
    const caiu = await promessa.then(() => null).catch((e: unknown) => e);
    if (!(caiu instanceof ErroApi)) throw new Error(`esperava recusa, veio ${JSON.stringify(caiu)}`);
    return caiu;
  };

  const erro = (r: { error: unknown }, o: string): void => {
    if (r.error) throw new Error(`${o}: ${JSON.stringify(r.error)}`);
  };

  const molde = (nome: string): CriarModeloCardapioInput => ({
    nome,
    descricao: 'Molde da prova',
    kcalAlvo: 1800,
    refeicoes: [
      {
        nome: 'Café da manhã',
        horarioSugerido: '07:30',
        itens: [
          { alimentoId: aveia, quantidadeG: 40, observacao: 'Com leite' },
          { alimentoId: banana, quantidadeG: 100 },
        ],
      },
      { nome: 'Lanche', itens: [{ alimentoId: banana, quantidadeG: 50 }] },
    ],
  });

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });
    const agora = new Date().toISOString();

    const nutriId = (
      (await admin.from('User').select('id').eq('email', 'nutri@viviofit.com.br').single())
        .data as { id: string }
    ).id;

    erro(
      await admin.from('User').insert({
        id: alunoId,
        email: `${marca}@teste.com`,
        nome: 'Paciente do Molde',
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
        profissionalId: nutriId,
        tipo: 'NUTRICIONISTA',
        status: 'ATIVO',
        convidadoPorId: nutriId,
        atualizadoEm: agora,
      }),
      'vinculo',
    );
    erro(
      await admin.from('Consentimento').insert({
        id: `${marca}-c`,
        alunoId,
        escopo: 'NUTRICAO',
        finalidade: 'Prova',
        versaoTermo: '1',
      }),
      'consentimento',
    );
    erro(
      await admin.from('Alimento').insert([
        {
          id: aveia,
          nome: 'Aveia da prova',
          grupo: `Prova ${marca}`,
          kcal: 390,
          proteinaG: 14,
          carboidratoG: 67,
          gorduraG: 8,
          fibraG: 10,
          medidaCaseira: '2 colheres',
        },
        {
          id: banana,
          nome: 'Banana da prova',
          grupo: `Prova ${marca}`,
          kcal: 90,
          proteinaG: 1.4,
          carboidratoG: 23,
          gorduraG: 0.1,
          fibraG: 2,
        },
      ]),
      'alimentos',
    );

    await Promise.all([
      nutri.auth.login({ email: 'nutri@viviofit.com.br', senha: 'Senha@123' }),
      personal.auth.login({ email: 'personal@viviofit.com.br', senha: 'Senha@123' }),
    ]);
  });

  afterAll(async () => {
    await admin.from('PlanoDieta').delete().eq('alunoId', alunoId);
    await admin.from('Consentimento').delete().eq('alunoId', alunoId);
    await admin.from('Vinculo').delete().eq('alunoId', alunoId);
    await admin.from('User').delete().eq('id', alunoId);
    await admin.from('ModeloCardapio').delete().ilike('nome', `%${marca}%`);
    await admin.from('ModeloCardapio').delete().eq('descricao', 'Molde da prova');
    await admin.from('Alimento').delete().in('id', [aveia, banana]);
  });

  it('o molde nasce inteiro, com o total somando os itens', async () => {
    const m = await nutri.cardapios.criar(molde(`Molde ${marca}`));
    modeloId = m.id;

    expect(m.totalRefeicoes).toBe(2);
    expect(m.refeicoes.map((r) => r.nome)).toEqual(['Café da manhã', 'Lanche']);
    expect(m.refeicoes[0]!.itens[0]!.observacao).toBe('Com leite');
    // O molde mostra a medida caseira: é por ela que o nutricionista reconhece
    // a linha sem reler a quantidade.
    expect(m.refeicoes[0]!.itens[0]!.alimento.medidaCaseira).toBe('2 colheres');

    // 40 g de aveia (156 kcal) + 100 g de banana (90) + 50 g de banana (45).
    expect(m.refeicoes[0]!.macros.kcal).toBe(246);
    expect(m.macrosTotais.kcal).toBe(291);
  });

  it('molde é do nutricionista, e não de quem tem vínculo com o paciente', async () => {
    // O personal cuida do mesmo aluno e não monta cardápio nem molde.
    await expect(personal.cardapios.criar(molde('Não devia'))).rejects.toMatchObject({
      codigo: 'ACESSO_NEGADO',
    });
    expect(await personal.cardapios.listar()).toEqual([]);
  });

  it('aplicar o molde cria uma dieta INDEPENDENTE', async () => {
    /*
      É o ponto de existir um molde: ele é ponto de partida, não vínculo. Se os
      dois ficassem ligados, mexer no molde mudaria o cardápio de dez pessoas
      de uma vez, sem ninguém pedir.
    */
    const dieta = await nutri.cardapios.aplicar(alunoId, modeloId, {
      nome: 'Dieta a partir do molde',
      ativar: true,
    });

    expect(dieta.nome).toBe('Dieta a partir do molde');
    expect(dieta.status).toBe('ATIVO');
    expect(dieta.kcalAlvo).toBe(1800);
    expect(dieta.totalRefeicoes).toBe(2);
    // O mesmo cardápio, item a item — e os mesmos números.
    expect(dieta.macrosTotais.kcal).toBe(291);
    expect(dieta.refeicoes[0]!.itens[0]!.alimento.id).toBe(aveia);

    // Nenhum id em comum: são registros separados desde o nascimento.
    const idsDoMolde = (await nutri.cardapios.obter(modeloId)).refeicoes.map((r) => r.id);
    expect(dieta.refeicoes.map((r) => r.id)).not.toEqual(expect.arrayContaining(idsDoMolde));
  });

  it('sem nome, a dieta herda o do molde', async () => {
    const dieta = await nutri.cardapios.aplicar(alunoId, modeloId, { ativar: false });
    expect(dieta.nome).toBe(`Molde ${marca}`);
  });

  it('um plano entregue vira molde novo', async () => {
    const ativa = await nutri.dietas.obterAtiva(alunoId);
    const novo = await nutri.cardapios.salvarDoPlano({
      planoDietaId: ativa.id,
      nome: `Molde vindo do plano ${marca}`,
    });

    expect(novo.id).not.toBe(modeloId);
    expect(novo.totalRefeicoes).toBe(ativa.totalRefeicoes);
    expect(novo.macrosTotais.kcal).toBe(ativa.macrosTotais.kcal);
  });

  it('remover é carimbo: o molde pode ter virado dieta que está valendo', async () => {
    const descartavel = await nutri.cardapios.criar(molde(`Molde a remover ${marca}`));

    const bruto = createClient(url!, anon!, { auth: { persistSession: false } });
    await bruto.auth.signInWithPassword({ email: 'nutri@viviofit.com.br', password: 'Senha@123' });
    const apagou = await bruto.from('ModeloCardapio').delete().eq('id', descartavel.id);
    expect(apagou.error).not.toBeNull();

    await nutri.cardapios.remover(descartavel.id);
    expect((await nutri.cardapios.listar()).some((m) => m.id === descartavel.id)).toBe(false);
    // E a dieta que saiu dele continua de pé.
    expect(await nutri.dietas.obterAtiva(alunoId)).toBeDefined();

    await expect(nutri.cardapios.obter(descartavel.id)).rejects.toMatchObject({
      codigo: 'RECURSO_NAO_ENCONTRADO',
    });
  });

  it('a tabela das refeições do molde não aceita escrita direta', async () => {
    /*
      Molde e refeições nascem juntos. Com a tabela aberta, um molde ganharia
      uma refeição solta — e ele é aplicado em vários pacientes antes de alguém
      notar o que entrou.
    */
    const bruto = createClient(url!, anon!, { auth: { persistSession: false } });
    await bruto.auth.signInWithPassword({ email: 'nutri@viviofit.com.br', password: 'Senha@123' });

    const r = await bruto.from('RefeicaoModelo').insert({
      id: `${marca}-na-marra`,
      modeloId,
      nome: 'Refeição solta',
      ordem: 99,
    });
    expect(r.error).not.toBeNull();

    // E o caminho normal continua funcionando.
    expect((await nutri.cardapios.obter(modeloId)).totalRefeicoes).toBe(2);
  });

  it('alimento inexistente no molde diz qual', async () => {
    const caiu = await capturar(
      nutri.cardapios.criar({
        nome: `Molde inválido ${marca}`,
        refeicoes: [{ nome: 'Café', itens: [{ alimentoId: 'nao-existe-molde', quantidadeG: 30 }] }],
      }),
    );
    expect(caiu.codigo).toBe('RECURSO_NAO_ENCONTRADO');
    expect(caiu.message).toContain('nao-existe-molde');
  });
});
