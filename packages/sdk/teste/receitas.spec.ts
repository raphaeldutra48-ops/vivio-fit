import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroApi } from '../src/erro';
import { VivioClient } from '../src/client';

/**
 * Receita e refeição salva pelo SDK, sem API.
 *
 * A aritmética já tem prova em `@vivio/contracts`, sem banco. O que falta é o
 * caminho até ela: que a consulta traz o ingrediente NA ORDEM (o PostgREST não
 * garante ordem em relação embutida, e uma receita fora de ordem é um modo de
 * preparo embaralhado), que o `numeric` chega como número e não como texto, e
 * que a biblioteca de um profissional não encosta na do outro.
 *
 * O caso que mais importa: a refeição salva pode citar uma receita, e citar a
 * receita de OUTRO profissional leria a composição inteira dela pela consulta
 * que traz os itens embutidos.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK sem API: receita e refeição salva', () => {
  const marca = `prova-receita-${Date.now()}`;
  let admin: SupabaseClient;
  let nutriId = '';
  let receitaId = '';
  let refeicaoId = '';
  let alheiaId = '';
  let arrozId = '';
  let feijaoId = '';

  const cliente = (): VivioClient =>
    new VivioClient({
      baseUrl: 'http://127.0.0.1:1',
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
    const medicoId = (
      (await admin.from('User').select('id').eq('email', 'medico@viviofit.com.br').single())
        .data as { id: string }
    ).id;

    // Dois alimentos do catálogo, com composição conhecida: a conta tem de dar
    // um número previsível, e não "o que estiver na TACO hoje".
    const alimentos = [
      { id: `${marca}-arroz`, nome: `Arroz ${marca}`, kcal: 128, proteinaG: 2.5, carboidratoG: 28.1, gorduraG: 0.2, fibraG: 1.6 },
      { id: `${marca}-feijao`, nome: `Feijão ${marca}`, kcal: 76, proteinaG: 4.8, carboidratoG: 13.6, gorduraG: 0.5, fibraG: 8.5 },
    ];
    await admin.from('Alimento').insert(
      alimentos.map((a) => ({ ...a, grupo: 'CEREAIS', fonte: 'TACO' })),
    );
    arrozId = alimentos[0]!.id;
    feijaoId = alimentos[1]!.id;

    // Uma receita do MÉDICO, para o teste de biblioteca alheia.
    alheiaId = `${marca}-alheia`;
    await admin.from('Receita').insert({
      id: alheiaId,
      autorId: medicoId,
      nome: `Receita do outro ${marca}`,
      rendePorcoes: 1,
      atualizadoEm: new Date().toISOString(),
    });

    await Promise.all([
      nutri.auth.login({ email: 'nutri@viviofit.com.br', senha: 'Senha@123' }),
      medico.auth.login({ email: 'medico@viviofit.com.br', senha: 'Senha@123' }),
    ]);
  });

  afterAll(async () => {
    await admin.from('ItemRefeicaoSalva').delete().eq('refeicaoId', refeicaoId);
    await admin.from('RefeicaoSalva').delete().eq('autorId', nutriId).ilike('nome', `%${marca}%`);
    await admin.from('IngredienteReceita').delete().eq('receitaId', receitaId);
    await admin.from('Receita').delete().ilike('nome', `%${marca}%`);
    await admin.from('Alimento').delete().in('id', [arrozId, feijaoId]);
  });

  it('cria a receita com ingredientes, e a conta bate', async () => {
    const r = await nutri.receitas.criar({
      nome: `Arroz com feijão ${marca}`,
      rendePorcoes: 4,
      nomeDaPorcao: '1 concha',
      ingredientes: [
        { alimentoId: arrozId, quantidadeG: 400 },
        { alimentoId: feijaoId, quantidadeG: 200 },
      ],
    });
    receitaId = r.id;

    expect(r.ingredientes).toHaveLength(2);
    // O `numeric` do Postgres chega como TEXTO pelo PostgREST. Escapando assim,
    // a soma vira concatenação e o total do dia fica absurdo.
    expect(typeof r.macrosTotais.kcal).toBe('number');
    expect(r.macrosTotais.kcal).toBe(4 * 128 + 2 * 76);
    expect(r.macrosPorPorcao.kcal).toBe((4 * 128 + 2 * 76) / 4);
    expect(r.pesoTotalG).toBe(600);
  });

  it('o ingrediente volta na ordem GRAVADA, e não na que o banco devolver', async () => {
    /*
      O PostgREST não garante ordem em relação embutida, e nada obriga a linha
      gravada primeiro a voltar primeiro. Para o teste medir isso de verdade, a
      ordem no banco é invertida à força aqui: assim a ordem física e a coluna
      `ordem` discordam, e só quem lê a coluna acerta.

      Sem isso, a receita aparece com os ingredientes embaralhados — e o modo de
      preparo, que se lê de cima para baixo, deixa de fazer sentido.
    */
    const ingredientes =
      ((await admin.from('IngredienteReceita').select('id,ordem').eq('receitaId', receitaId))
        .data as { id: string; ordem: number }[] | null) ?? [];
    expect(ingredientes).toHaveLength(2);
    for (const i of ingredientes) {
      await admin
        .from('IngredienteReceita')
        .update({ ordem: i.ordem === 0 ? 1 : 0 })
        .eq('id', i.id);
    }

    const [r] = await nutri.receitas.listar(marca);
    expect(r!.ingredientes.map((i) => i.nome)).toEqual([`Feijão ${marca}`, `Arroz ${marca}`]);
  });

  it('salvar de novo reescreve a lista inteira, sem duplicar', async () => {
    const r = await nutri.receitas.atualizar(receitaId, {
      nome: `Só arroz ${marca}`,
      rendePorcoes: 2,
      ingredientes: [{ alimentoId: arrozId, quantidadeG: 100 }],
    });

    expect(r.nome).toBe(`Só arroz ${marca}`);
    expect(r.ingredientes).toHaveLength(1);
    expect(r.macrosTotais.kcal).toBe(128);

    // E não sobrou linha órfã apontando para a receita.
    const { count } = await admin
      .from('IngredienteReceita')
      .select('id', { count: 'exact', head: true })
      .eq('receitaId', receitaId);
    expect(count).toBe(1);
  });

  it('a biblioteca é do autor: a receita do outro não aparece nem se edita', async () => {
    expect((await nutri.receitas.listar(marca)).map((r) => r.id)).not.toContain(alheiaId);

    const erro = await nutri.receitas
      .atualizar(alheiaId, {
        nome: 'sequestrada',
        rendePorcoes: 1,
        ingredientes: [{ alimentoId: arrozId, quantidadeG: 10 }],
      })
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);
    expect(erro?.status).toBe(404);
  });

  it('a refeição salva soma alimento e receita, cada um do seu jeito', async () => {
    const rf = await nutri.refeicoesSalvas.criar({
      nome: `Almoço ${marca}`,
      horarioSugerido: '12:00',
      itens: [
        { alimentoId: feijaoId, quantidadeG: 150 },
        { receitaId, porcoes: 2 },
      ],
    });
    refeicaoId = rf.id;

    expect(rf.itens).toHaveLength(2);
    const [alimento, receita] = rf.itens;
    // Alimento vai em gramas; receita vai em porções — é como a pessoa pensa.
    expect(alimento!.ehReceita).toBe(false);
    expect(alimento!.quantidadeG).toBe(150);
    expect(receita!.ehReceita).toBe(true);
    expect(receita!.porcoes).toBe(2);

    const soma = rf.itens.reduce((s, i) => s + i.macros.kcal, 0);
    expect(rf.macrosTotais.kcal).toBeCloseTo(soma, 2);
  });

  it('citar a receita de outro profissional é recusado pelo banco', async () => {
    /*
      Não é só uma questão de organização: o item traz a receita embutida na
      consulta, então citá-la entregaria a composição inteira da receita alheia.
    */
    const erro = await nutri.refeicoesSalvas
      .criar({
        nome: `Roubo ${marca}`,
        itens: [{ receitaId: alheiaId, porcoes: 1 }],
      })
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);

    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro!.status).toBeGreaterThanOrEqual(400);
  });

  it('remover é carimbo: some da lista e o plano antigo continua legível', async () => {
    await nutri.receitas.remover(receitaId);
    expect((await nutri.receitas.listar(marca)).map((r) => r.id)).not.toContain(receitaId);

    const { data } = await admin
      .from('Receita')
      .select('deletadoEm')
      .eq('id', receitaId)
      .single();
    expect((data as { deletadoEm: string | null }).deletadoEm).not.toBeNull();
  });
});
