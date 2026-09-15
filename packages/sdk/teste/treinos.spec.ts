import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CriarPlanoTreinoInput } from '@vivio/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroApi } from '../src/erro';
import { VivioClient } from '../src/client';

/**
 * Plano de treino pelo SDK, sem API.
 *
 * O plano é a única coisa deste banco que nasce em três tabelas ao mesmo tempo
 * e que não pode nascer pela metade — um plano com duas de quatro sessões
 * gravadas manda a pessoa embora da academia no meio do treino. Por isso a
 * escrita saiu das políticas e virou função, e por isso metade deste arquivo
 * prova o que o cliente NÃO consegue mais fazer direto na tabela.
 *
 * A outra metade prova o que tem de continuar funcionando. As duas juntas,
 * sempre: revogar demais quebra tudo em silêncio, e um teste que só verifica a
 * recusa fica verde enquanto o app inteiro para.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK sem API: plano de treino', () => {
  const marca = `prova-treino-${Date.now()}`;
  const alunoId = `${marca}-aluno`;
  const globalA = `${marca}-global-a`;
  const globalB = `${marca}-global-b`;
  const privadoDaNutri = `${marca}-privado-nutri`;

  let admin: SupabaseClient;
  let planoV1 = '';

  const cliente = (): VivioClient =>
    new VivioClient({
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const personal = cliente();
  const nutri = cliente();
  const medico = cliente();

  /** Um plano de duas sessões, com os itens fora de ordem alfabética de propósito. */
  const planoDeDuas = (nome: string, ativar = false): CriarPlanoTreinoInput => ({
    nome,
    objetivo: 'Hipertrofia',
    ativar,
    sessoes: [
      {
        nome: 'Treino A',
        diaSugerido: 1,
        itens: [
          {
            exercicioId: globalA,
            series: 4,
            repsAlvo: '8-12',
            cargaSugeridaKg: 42.5,
            descansoSeg: 90,
            tecnica: 'Cadência 2-0-2',
            observacao: 'Sem travar o cotovelo',
            supersetGrupo: 'A1',
          },
          { exercicioId: globalB, series: 3, repsAlvo: 'até a falha' },
        ],
      },
      {
        nome: 'Treino B',
        itens: [{ exercicioId: globalB, series: 3, repsAlvo: '10' }],
      },
    ],
  });

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });
    const idDe = async (email: string): Promise<string> =>
      ((await admin.from('User').select('id').eq('email', email).single()).data as { id: string })
        .id;
    const [pId, nId] = await Promise.all(
      ['personal@viviofit.com.br', 'nutri@viviofit.com.br'].map(idDe),
    );

    const erro = (r: { error: unknown }, o: string): void => {
      if (r.error) throw new Error(`${o}: ${JSON.stringify(r.error)}`);
    };
    const agora = new Date().toISOString();

    erro(
      await admin.from('User').insert({
        id: alunoId,
        email: `${marca}@teste.com`,
        nome: 'Aluno de Treino',
        papel: 'ALUNO',
        status: 'ATIVA',
        atualizadoEm: agora,
      }),
      'aluno',
    );

    /*
      Só PERSONAL e NUTRICIONISTA têm vínculo. O médico fica de fora de
      propósito: é ele que prova que o plano não é visível a quem não cuida da
      pessoa, e sem alguém sem vínculo no cenário isso não se prova.
    */
    erro(
      await admin.from('Vinculo').insert(
        [
          ['PERSONAL', pId!],
          ['NUTRICIONISTA', nId!],
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
        escopo: 'TREINO',
        finalidade: 'Prova',
        versaoTermo: '1',
      }),
      'consentimento',
    );

    erro(
      await admin.from('Exercicio').insert([
        {
          id: globalA,
          nome: 'Supino da Prova',
          grupoMuscular: 'PEITO',
          equipamento: 'Barra',
          escopo: 'GLOBAL',
          videoChave: 'exercicios/acervo/supino.mp4',
          instrucoes: 'Escápulas retraídas.',
          passos: ['Deite', 'Desça', 'Empurre'],
          atualizadoEm: agora,
        },
        {
          id: globalB,
          nome: 'Remada da Prova',
          grupoMuscular: 'COSTAS',
          escopo: 'GLOBAL',
          atualizadoEm: agora,
        },
        {
          // Biblioteca privada de OUTRO profissional.
          id: privadoDaNutri,
          nome: 'Exercício alheio',
          grupoMuscular: 'PERNA',
          escopo: 'PRIVADO',
          criadoPorId: nId,
          atualizadoEm: agora,
        },
      ]),
      'exercicios',
    );

    await Promise.all([
      personal.auth.login({ email: 'personal@viviofit.com.br', senha: 'Senha@123' }),
      nutri.auth.login({ email: 'nutri@viviofit.com.br', senha: 'Senha@123' }),
      medico.auth.login({ email: 'medico@viviofit.com.br', senha: 'Senha@123' }),
    ]);
  });

  afterAll(async () => {
    // Apagar o plano leva sessões e itens junto: as duas cascatas estão no
    // schema desde sempre.
    await admin.from('PlanoTreino').delete().eq('alunoId', alunoId);
    await admin.from('Consentimento').delete().eq('alunoId', alunoId);
    await admin.from('Vinculo').delete().eq('alunoId', alunoId);
    await admin.from('User').delete().eq('id', alunoId);
    await admin.from('Exercicio').delete().in('id', [globalA, globalB, privadoDaNutri]);
  });

  it('o personal monta o plano inteiro, e ele nasce RASCUNHO', async () => {
    const p = await personal.treinos.criar(alunoId, planoDeDuas('Plano da Prova'));
    planoV1 = p.id;

    expect(p.status).toBe('RASCUNHO');
    expect(p.versao).toBe(1);
    expect(p.nome).toBe('Plano da Prova');
    expect(p.personal.nome).toBeTruthy();
    expect(p.totalSessoes).toBe(2);
    // Nasce sem data de início: rascunho não começou.
    expect(p.inicioEm).toBeNull();

    expect(p.sessoes.map((s) => s.nome)).toEqual(['Treino A', 'Treino B']);
    expect(p.sessoes.map((s) => s.ordem)).toEqual([0, 1]);
    expect(p.sessoes[0]!.diaSugerido).toBe(1);
    expect(p.sessoes[1]!.diaSugerido).toBeNull();

    /*
      A ordem dos itens é a sequência do treino. Se chegasse embaralhada, a
      pessoa faria o acessório antes do exercício principal e não teria como
      saber que estava errado.
    */
    const itens = p.sessoes[0]!.itens;
    expect(itens.map((i) => i.ordem)).toEqual([0, 1]);
    expect(itens.map((i) => i.exercicio.id)).toEqual([globalA, globalB]);
  });

  it('a carga sugerida chega como número, e não como texto', async () => {
    /*
      `numeric` volta do PostgREST como TEXTO. Escapando assim, a tela somaria
      "42.5" + 5 e mostraria "42.55" kg na barra — e a pessoa colocaria o peso
      que o app mandou.
    */
    const p = await personal.treinos.obter(alunoId, planoV1);
    const item = p.sessoes[0]!.itens[0]!;
    expect(typeof item.cargaSugeridaKg).toBe('number');
    expect(item.cargaSugeridaKg).toBe(42.5);
    expect(item.descansoSeg).toBe(90);
    expect(item.tecnica).toBe('Cadência 2-0-2');
    expect(item.supersetGrupo).toBe('A1');
    // Item sem carga é o caso comum, e continua nulo em vez de virar zero:
    // zero seria "faça sem peso", que é outra prescrição.
    expect(p.sessoes[0]!.itens[1]!.cargaSugeridaKg).toBeNull();
  });

  it('o exercício vem com o que a tela precisa, e a chave do vídeo não vaza como URL', async () => {
    const p = await personal.treinos.obter(alunoId, planoV1);
    const e = p.sessoes[0]!.itens[0]!.exercicio;

    expect(e.nome).toBe('Supino da Prova');
    expect(e.grupoMuscular).toBe('PEITO');
    expect(e.passos).toEqual(['Deite', 'Desça', 'Empurre']);
    expect(e.temVideo).toBe(true);
    // Exercício sem vídeo diz que não tem, em vez de mentir por ausência.
    expect(p.sessoes[0]!.itens[1]!.exercicio.temVideo).toBe(false);

    /*
      Link assinado não vem no plano de propósito: o mobile guarda isto em
      cache para treinar sem rede, e uma assinatura de cinco minutos chegaria
      morta. `temDemonstracao` é nulo porque ninguém perguntou — afirmar
      `false` faria a tela dizer "sem gravação" sobre um vídeo existente.
    */
    expect(e.imagemUrl).toBeNull();
    expect(e.temDemonstracao).toBeNull();
  });

  it('quem cuida da pessoa lê o plano; quem não cuida não sabe que ele existe', async () => {
    // A nutricionista tem vínculo e o aluno consentiu TREINO: ela lê. É o que
    // permite a equipe conversar sobre a mesma pessoa.
    expect((await nutri.treinos.listar(alunoId)).map((p) => p.id)).toContain(planoV1);
    // O médico não tem vínculo: para ele o plano não existe.
    expect(await medico.treinos.listar(alunoId)).toEqual([]);
  });

  it('ativar carimba o início e não deixa dois planos valendo', async () => {
    // Nasce já valendo: é o caminho de quem monta o plano na frente do aluno.
    const primeiro = await personal.treinos.criar(alunoId, planoDeDuas('Plano B', true));
    expect(primeiro.status).toBe('ATIVO');

    const segundo = await personal.treinos.criar(alunoId, planoDeDuas('Plano C'));
    const ativado = await personal.treinos.ativar(alunoId, segundo.id);
    expect(ativado.status).toBe('ATIVO');
    expect(ativado.inicioEm).not.toBeNull();

    /*
      O anterior sai de cena com data de fim. Dois planos valendo ao mesmo
      tempo não dariam erro em lugar nenhum: o aluno abriria o app e veria um
      treino, sem jeito de saber que existe outro.
    */
    const antigo = await personal.treinos.obter(alunoId, primeiro.id);
    expect(antigo.status).toBe('ARQUIVADO');
    expect(antigo.fimEm).not.toBeNull();

    const lista = await personal.treinos.listar(alunoId);
    expect(lista.filter((p) => p.status === 'ATIVO')).toHaveLength(1);
    // E o topo da lista é o que está valendo — não o rascunho mais recente.
    expect(lista[0]!.id).toBe(segundo.id);

    expect(await personal.treinos.obterAtivo(alunoId)).toMatchObject({ id: segundo.id });
  });

  it('ativar de novo o mesmo plano diz o que houve, em vez de repetir a ativação', async () => {
    const ativo = await personal.treinos.obterAtivo(alunoId);
    const caiu = await personal.treinos.ativar(alunoId, ativo.id).catch((e: unknown) => e);
    expect(caiu).toBeInstanceOf(ErroApi);
    expect((caiu as ErroApi).codigo).toBe('CONFLITO');
    /*
      A frase é a que a função do banco escreveu, e não a genérica 'Esse
      registro já existe.'. É ela que a tela mostra — trocá-la pela do Postgres
      cru deixaria o personal olhando 'duplicate key value violates unique
      constraint'.
    */
    expect((caiu as ErroApi).message).toBe('Este plano já está ativo.');
  });

  it('ajustar o plano cria uma versão nova, assume o lugar da anterior e não apaga nada', async () => {
    /*
      Sobrescrever destruiria a leitura do histórico: daqui a três meses, ao ver
      que o aluno fez supino com 60 kg, é preciso saber o que o plano prescrevia
      NAQUELE dia.
    */
    const anterior = await personal.treinos.obterAtivo(alunoId);
    const nova = await personal.treinos.novaVersao(
      alunoId,
      anterior.id,
      planoDeDuas('Plano B — ajustado'),
    );

    expect(nova.versao).toBe(anterior.versao + 1);
    // A anterior estava valendo, então a nova entra valendo: o aluno abre o
    // app já com o ajuste, sem ninguém precisar ativar nada.
    expect(nova.status).toBe('ATIVO');

    const velha = await personal.treinos.obter(alunoId, anterior.id);
    expect(velha.status).toBe('ARQUIVADO');
    expect(velha.fimEm).not.toBeNull();
    // E ela continua inteira: é isso que faz o histórico ser legível.
    expect(velha.sessoes[0]!.itens).toHaveLength(2);

    const raiz = (
      await admin.from('PlanoTreino').select('raizId').eq('id', nova.id).single()
    ).data as { raizId: string };
    expect(raiz.raizId).toBe(anterior.id);
  });

  it('o plano não aceita exercício da biblioteca privada de outro profissional', async () => {
    /*
      Sem esta checagem bastaria adivinhar um id para prescrever — e para
      descobrir o que o concorrente tem na biblioteca dele.
    */
    await expect(
      personal.treinos.criar(alunoId, {
        nome: 'Plano com exercício alheio',
        ativar: false,
        sessoes: [{ nome: 'A', itens: [{ exercicioId: privadoDaNutri, series: 3, repsAlvo: '10' }] }],
      }),
    ).rejects.toMatchObject({ codigo: 'RECURSO_NAO_ENCONTRADO' });

    // E nada ficou pela metade: a função é uma transação.
    const restos = await admin
      .from('PlanoTreino')
      .select('id')
      .eq('alunoId', alunoId)
      .eq('nome', 'Plano com exercício alheio');
    expect(restos.data ?? []).toEqual([]);
  });

  it('quem não é personal não prescreve treino, mesmo cuidando da pessoa', async () => {
    // A nutricionista LÊ o plano — e é justamente por isso que este teste
    // existe: ler não é escrever.
    await expect(
      nutri.treinos.criar(alunoId, planoDeDuas('Não devia')),
    ).rejects.toBeInstanceOf(ErroApi);
  });

  it('a tabela do plano não aceita escrita direta, nem para criar nem para ativar', async () => {
    /*
      A prova que sustenta o resto. As invariantes — um ativo por aluno, versão
      nova em vez de sobrescrita — moram na função; se a tabela continuasse
      aberta, bastaria um `insert` para ter dois planos valendo ao mesmo tempo,
      e o aluno abriria o app sem saber qual dos dois fazer.
    */
    const bruto = createClient(url!, anon!, { auth: { persistSession: false } });
    await bruto.auth.signInWithPassword({
      email: 'personal@viviofit.com.br',
      password: 'Senha@123',
    });

    const inserido = await bruto.from('PlanoTreino').insert({
      id: `${marca}-na-marra`,
      alunoId,
      personalId: (await bruto.auth.getUser()).data.user?.id ?? 'x',
      nome: 'Na marra',
      status: 'ATIVO',
      atualizadoEm: new Date().toISOString(),
    });
    expect(inserido.error).not.toBeNull();

    const ativo = await personal.treinos.obterAtivo(alunoId);
    const rascunho = (await personal.treinos.listar(alunoId)).find(
      (p) => p.status === 'ARQUIVADO',
    )!;

    /*
      E o UPDATE também falha com erro, e não em silêncio. Sem o `revoke`, uma
      tabela sem política de UPDATE afeta zero linhas e responde 200 — a tela
      diria "salvo" sobre coisa nenhuma.
    */
    const promovido = await bruto
      .from('PlanoTreino')
      .update({ status: 'ATIVO' })
      .eq('id', rascunho.id);
    expect(promovido.error).not.toBeNull();

    // Continua havendo um só plano valendo, e é o mesmo de antes.
    expect((await personal.treinos.obterAtivo(alunoId)).id).toBe(ativo.id);
  });

  it('plano sem sessão não é rascunho: é tela que abre vazia', async () => {
    await expect(
      personal.treinos.criar(alunoId, { nome: 'Vazio', ativar: false, sessoes: [] }),
    ).rejects.toMatchObject({ codigo: 'DADOS_INVALIDOS' });
  });

  it('sem plano ativo, a resposta diz isso — não devolve o último qualquer', async () => {
    const sozinho = `${marca}-sem-plano`;
    await admin.from('User').insert({
      id: sozinho,
      email: `${sozinho}@teste.com`,
      nome: 'Aluno sem plano',
      papel: 'ALUNO',
      status: 'ATIVA',
      atualizadoEm: new Date().toISOString(),
    });
    try {
      await expect(personal.treinos.obterAtivo(sozinho)).rejects.toMatchObject({
        codigo: 'RECURSO_NAO_ENCONTRADO',
      });
    } finally {
      await admin.from('User').delete().eq('id', sozinho);
    }
  });

});
