import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CriarPlanoDietaInput } from '@vivio/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroApi } from '../src/erro';
import { VivioClient } from '../src/client';

/**
 * Plano alimentar pelo SDK, sem API.
 *
 * O critério que sustenta a nutrição inteira é um só: **o total tem de bater
 * com a soma dos itens**. Um número guardado à parte envelheceria no primeiro
 * ajuste de quantidade, e o nutricionista veria um alvo batendo com um
 * cardápio que já não bate.
 *
 * Por isso `macrosTotais` é calculado na leitura, dos dois lados, pela mesma
 * função do contrato — e é isso que este arquivo confere item a item.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK sem API: plano alimentar', () => {
  const marca = `prova-dieta-${Date.now()}`;
  const alunoId = `${marca}-aluno`;
  const arroz = `${marca}-arroz`;
  const macarrao = `${marca}-macarrao`;
  const frango = `${marca}-frango`;
  const grupoDoTeste = `Prova ${marca}`;

  let admin: SupabaseClient;
  let planoV1 = '';

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

  /** Café com 100 g de arroz; almoço com 150 g de frango. */
  const dieta = (nome: string, ativar = false): CriarPlanoDietaInput => ({
    nome,
    kcalAlvo: 2000,
    ativar,
    refeicoes: [
      {
        nome: 'Café da manhã',
        horarioSugerido: '08:00',
        itens: [{ alimentoId: arroz, quantidadeG: 100, observacao: 'Sem sal' }],
      },
      { nome: 'Almoço', itens: [{ alimentoId: frango, quantidadeG: 150 }] },
    ],
  });

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });
    const agora = new Date().toISOString();

    const idDe = async (email: string): Promise<string> =>
      ((await admin.from('User').select('id').eq('email', email).single()).data as { id: string })
        .id;
    const [nId, pId] = await Promise.all(
      ['nutri@viviofit.com.br', 'personal@viviofit.com.br'].map(idDe),
    );

    erro(
      await admin.from('User').insert({
        id: alunoId,
        email: `${marca}@teste.com`,
        nome: 'Aluno da Dieta',
        papel: 'ALUNO',
        status: 'ATIVA',
        atualizadoEm: agora,
      }),
      'aluno',
    );
    erro(
      await admin.from('Vinculo').insert(
        [
          ['NUTRICIONISTA', nId!],
          ['PERSONAL', pId!],
        ].map(([tipo, id], i) => ({
          id: `${marca}-v${i}`,
          alunoId,
          profissionalId: id,
          tipo,
          status: 'ATIVO',
          convidadoPorId: id,
          atualizadoEm: agora,
        })),
      ),
      'vinculos',
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

    /*
      Um grupo só desta prova: os substitutos vêm do mesmo grupo do original, e
      com os alimentos de verdade da TACO no meio a lista seria imprevisível.
    */
    erro(
      await admin.from('Alimento').insert([
        {
          id: arroz,
          nome: 'Arroz da prova',
          grupo: grupoDoTeste,
          kcal: 130,
          proteinaG: 2.5,
          carboidratoG: 28,
          gorduraG: 0.2,
          fibraG: 1.6,
        },
        {
          // Quase o mesmo perfil do arroz: é o substituto que deve aparecer.
          id: macarrao,
          nome: 'Macarrão da prova',
          grupo: grupoDoTeste,
          kcal: 160,
          proteinaG: 3,
          carboidratoG: 32,
          gorduraG: 0.9,
          fibraG: 1.8,
        },
        {
          // Muito mais proteína: bate as calorias e destrói a dieta.
          id: frango,
          nome: 'Frango da prova',
          grupo: grupoDoTeste,
          kcal: 165,
          proteinaG: 31,
          carboidratoG: 0,
          gorduraG: 3.6,
          fibraG: 0,
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
    await admin.from('RegistroRefeicao').delete().eq('alunoId', alunoId);
    await admin.from('PlanoDieta').delete().eq('alunoId', alunoId);
    await admin.from('Consentimento').delete().eq('alunoId', alunoId);
    await admin.from('Vinculo').delete().eq('alunoId', alunoId);
    await admin.from('User').delete().eq('id', alunoId);
    await admin.from('Alimento').delete().in('id', [arroz, macarrao, frango]);
  });

  it('a dieta nasce inteira, e o total é a soma dos itens', async () => {
    const d = await nutri.dietas.criar(alunoId, dieta('Dieta da prova'));
    planoV1 = d.id;

    expect(d.status).toBe('RASCUNHO');
    expect(d.totalRefeicoes).toBe(2);
    expect(d.refeicoes.map((r) => r.nome)).toEqual(['Café da manhã', 'Almoço']);
    expect(d.refeicoes[0]!.horarioSugerido).toBe('08:00');
    expect(d.refeicoes[0]!.itens[0]!.observacao).toBe('Sem sal');

    // 100 g de arroz = os valores por 100 g, sem regra de três nenhuma.
    const doArroz = d.refeicoes[0]!.itens[0]!;
    expect(doArroz.macros.kcal).toBe(130);
    expect(doArroz.macros.proteinaG).toBe(2.5);

    // 150 g de frango = 1,5 vez os valores por 100 g.
    const doFrango = d.refeicoes[1]!.itens[0]!;
    expect(doFrango.macros.kcal).toBe(247.5);
    expect(doFrango.macros.proteinaG).toBe(46.5);

    /*
      O total NÃO é um campo: é a soma. Guardado, ele envelheceria no primeiro
      ajuste de quantidade e mostraria um alvo batendo com um cardápio que já
      não bate.
    */
    expect(d.macrosTotais.kcal).toBe(377.5);
    expect(d.macrosTotais.proteinaG).toBe(49);
    expect(d.refeicoes[1]!.macros.kcal).toBe(247.5);
  });

  it('a quantidade chega como número, e não como texto', async () => {
    // `numeric` volta do PostgREST como TEXTO: escapando assim, "100" + 50
    // viraria "10050" gramas de arroz na tela.
    const d = await nutri.dietas.obterAtiva(alunoId).catch(() => null);
    expect(d).toBeNull();

    const rascunho = (await nutri.dietas.listar(alunoId)).find((p) => p.id === planoV1)!;
    expect(rascunho.macrosTotais.kcal).toBe(377.5);
    expect(typeof rascunho.macrosTotais.kcal).toBe('number');
  });

  it('só o nutricionista prescreve, mesmo quem mais cuida da pessoa', async () => {
    // O personal tem vínculo ativo e consentimento de NUTRICAO — e ainda assim
    // não monta cardápio.
    await expect(nutri.dietas.criar(alunoId, dieta('ok'))).resolves.toBeDefined();
    await expect(personal.dietas.criar(alunoId, dieta('Não devia'))).rejects.toMatchObject({
      codigo: 'ACESSO_NEGADO',
    });
  });

  it('alimento inexistente diz QUAL, e nada fica pela metade', async () => {
    /*
      Dizer qual é a diferença entre o nutricionista corrigir a linha e ele
      refazer o cardápio inteiro.
    */
    const caiu = await capturar(
      nutri.dietas.criar(alunoId, {
        nome: 'Com alimento inventado',
        ativar: false,
        refeicoes: [{ nome: 'Café', itens: [{ alimentoId: 'nao-existe-mesmo', quantidadeG: 50 }] }],
      }),
    );
    expect(caiu.codigo).toBe('RECURSO_NAO_ENCONTRADO');
    expect(caiu.message).toContain('nao-existe-mesmo');

    const restos = await admin
      .from('PlanoDieta')
      .select('id')
      .eq('alunoId', alunoId)
      .eq('nome', 'Com alimento inventado');
    expect(restos.data ?? []).toEqual([]);
  });

  it('ativar não deixa duas dietas valendo, e a lista mostra a que vale primeiro', async () => {
    const valendo = await nutri.dietas.criar(alunoId, dieta('Dieta que vale', true));
    expect(valendo.status).toBe('ATIVO');

    const outra = await nutri.dietas.criar(alunoId, dieta('Outra que passa a valer'));
    await nutri.supabase.ativarDieta(alunoId, outra.id);

    const lista = await nutri.dietas.listar(alunoId);
    expect(lista.filter((p) => p.status === 'ATIVO')).toHaveLength(1);
    /*
      O topo é o que está valendo — não o rascunho mais recente. Ordenar por
      `status` seguiria a ordem em que o enum foi declarado, e punha rascunho
      acima da dieta que o aluno está seguindo hoje.
    */
    expect(lista[0]!.id).toBe(outra.id);
    expect((await nutri.dietas.obterAtiva(alunoId)).id).toBe(outra.id);
  });

  it('ajustar a dieta cria versão nova e não apaga a anterior', async () => {
    const anterior = await nutri.dietas.obterAtiva(alunoId);
    const nova = await nutri.dietas.novaVersao(alunoId, anterior.id, dieta('Dieta ajustada'));

    expect(nova.versao).toBe(anterior.versao + 1);
    // A anterior estava valendo, então a nova entra valendo.
    expect(nova.status).toBe('ATIVO');

    const velha = (await nutri.dietas.listar(alunoId)).find((p) => p.id === anterior.id)!;
    expect(velha.status).toBe('ARQUIVADO');
    // E continua inteira: é o que faz o histórico ser legível.
    expect(velha.totalRefeicoes).toBe(2);
  });

  it('a tabela da dieta não aceita escrita direta', async () => {
    const bruto = createClient(url!, anon!, { auth: { persistSession: false } });
    await bruto.auth.signInWithPassword({ email: 'nutri@viviofit.com.br', password: 'Senha@123' });

    const r = await bruto.from('PlanoDieta').insert({
      id: `${marca}-na-marra`,
      alunoId,
      nutricionistaId: (await bruto.auth.getUser()).data.user?.id ?? 'x',
      nome: 'Na marra',
      status: 'ATIVO',
      atualizadoEm: new Date().toISOString(),
    });
    expect(r.error).not.toBeNull();

    // E o caminho normal continua funcionando — é a outra metade da prova.
    expect(await nutri.dietas.obterAtiva(alunoId)).toBeDefined();
  });

  it('a substituição troca por algo parecido, não por qualquer coisa do grupo', async () => {
    const ativa = await nutri.dietas.obterAtiva(alunoId);
    const itemDoArroz = ativa.refeicoes[0]!.itens[0]!;

    const opcoes = await nutri.dietas.substitutos(alunoId, itemDoArroz.id);
    expect(opcoes.map((s) => s.alimento.id)).toContain(macarrao);
    /*
      O frango está no mesmo grupo e bate as calorias — com 79 g dele dá os
      mesmos 130 kcal. Mas leva 24 g de proteína no lugar de 2,5: iso-calórico
      e nutricionalmente outra dieta.
    */
    expect(opcoes.map((s) => s.alimento.id)).not.toContain(frango);

    const doMacarrao = opcoes.find((s) => s.alimento.id === macarrao)!;
    // 130 kcal com 160 kcal por 100 g dá 81,25 g.
    expect(doMacarrao.quantidadeEquivalenteG).toBe(81.25);
    expect(doMacarrao.macros.kcal).toBe(130);
  });

  it('marcar a refeição de novo no mesmo dia corrige, e não duplica', async () => {
    const ativa = await nutri.dietas.obterAtiva(alunoId);
    const cafe = ativa.refeicoes[0]!;

    const primeira = await nutri.dietas.registrarRefeicao(alunoId, {
      refeicaoId: cafe.id,
      data: new Date('2026-06-10T00:00:00.000Z'),
      status: 'PULADA',
    });
    expect(primeira.status).toBe('PULADA');
    expect(primeira.refeicaoNome).toBe('Café da manhã');

    /*
      Sem política de UPDATE, a correção afetaria zero linhas respondendo 200:
      a tela diria "salvo" e o registro continuaria dizendo que ele pulou.
    */
    const corrigida = await nutri.dietas.registrarRefeicao(alunoId, {
      refeicaoId: cafe.id,
      data: new Date('2026-06-10T00:00:00.000Z'),
      status: 'FEITA',
      comentario: 'Comi tudo',
    });
    expect(corrigida.status).toBe('FEITA');
    expect(corrigida.comentario).toBe('Comi tudo');

    const doDia = await nutri.dietas.registrosDoDia(alunoId, '2026-06-10');
    expect(doDia).toHaveLength(1);
    expect(doDia[0]!.status).toBe('FEITA');
  });
});
