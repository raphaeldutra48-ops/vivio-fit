import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroApi } from '../src/erro';
import { VivioClient } from '../src/client';

/**
 * Cabeçalho do aluno, lista de compras e painel de feedback — sem API.
 *
 * O painel de feedback é o caso que importa. Um painel é, por definição,
 * leitura de dado de MUITOS alunos de uma vez — exatamente o tipo de tela em
 * que a regra de acesso costuma ser esquecida, porque não há um `:alunoId` para
 * conferir. A API filtrava por consentimento em código, aluno a aluno; aqui
 * quem filtra é a política, e a consulta pede tudo.
 *
 * Por isso o cenário tem DOIS alunos com o mesmo personal e consentimentos
 * diferentes: um autorizou TREINO, o outro não. Com um aluno só, o teste
 * passaria sem medir nada.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK sem API: painéis', () => {
  const marca = `prova-painel-${Date.now()}`;
  let admin: SupabaseClient;
  let personalId = '';
  let nutriId = '';
  let comConsentimento = '';
  let semConsentimento = '';

  const cliente = (): VivioClient =>
    new VivioClient({
      baseUrl: 'http://127.0.0.1:1',
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const personal = cliente();

  const erro = (r: { error: unknown }, o: string): void => {
    if (r.error) throw new Error(`${o}: ${JSON.stringify(r.error)}`);
  };

  /** Plano e sessão de treino: a execução aponta para uma sessão, sempre. */
  const sessaoDe = async (alunoId: string): Promise<string> => {
    const planoId = `${marca}-plano-${alunoId.slice(0, 6)}`;
    const sessaoId = `${marca}-sessao-${alunoId.slice(0, 6)}`;
    erro(
      await admin.from('PlanoTreino').insert({
        id: planoId,
        alunoId,
        personalId,
        nome: `Plano ${marca}`,
        status: 'ATIVO',
        atualizadoEm: new Date().toISOString(),
      }),
      'plano',
    );
    erro(
      await admin
        .from('SessaoTreino')
        .insert({ id: sessaoId, planoId, nome: 'Treino A', ordem: 1 }),
      'sessao',
    );
    return sessaoId;
  };

  /** Um treino terminado, com feedback — é o que alimenta o painel. */
  const treinoCom = async (
    alunoId: string,
    sessaoId: string,
    quando: string,
    feedback: { dificuldade: number; teveDor: boolean; localDor?: string; comentario?: string },
  ): Promise<void> => {
    const id = `${marca}-ex-${alunoId.slice(0, 6)}-${quando}`;
    erro(
      await admin.from('ExecucaoTreino').insert({
        id,
        alunoId,
        sessaoId,
        iniciadoEm: `${quando}T10:00:00`,
        finalizadoEm: `${quando}T11:00:00`,
        duracaoSeg: 3600,
        clienteUuid: id,
      }),
      'execucao',
    );
    erro(
      await admin.from('FeedbackTreino').insert({
        id: `${id}-fb`,
        execucaoId: id,
        dificuldade: feedback.dificuldade,
        teveDor: feedback.teveDor,
        localDor: feedback.localDor ?? null,
        comentario: feedback.comentario ?? null,
      }),
      'feedback',
    );
  };

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });
    const agora = new Date().toISOString();
    const idDe = async (email: string): Promise<string> =>
      ((await admin.from('User').select('id').eq('email', email).single()).data as { id: string })
        .id;
    personalId = await idDe('personal@viviofit.com.br');
    nutriId = await idDe('nutri@viviofit.com.br');

    for (const [i, rotulo] of [['0', 'Com consentimento'], ['1', 'Sem consentimento']]) {
      const r = await admin.auth.admin.createUser({
        email: `${marca}-${i}@teste.com`,
        password: 'Senha@123',
        email_confirm: true,
        user_metadata: { nome: `${rotulo} ${marca}`, papel: 'ALUNO' },
      });
      if (r.error) throw new Error(`conta ${i}: ${r.error.message}`);
      if (i === '0') comConsentimento = r.data.user!.id;
      else semConsentimento = r.data.user!.id;
    }

    await admin.from('PerfilAluno').upsert({
      userId: comConsentimento,
      dataNascimento: '1990-05-20',
      alturaCm: 178,
      objetivo: 'Ganhar massa',
      atualizadoEm: agora,
    });

    // Os dois são alunos do mesmo personal, e um deles também da nutricionista:
    // a equipe do cabeçalho tem de trazer os dois profissionais.
    await admin.from('Vinculo').insert([
      {
        id: `${marca}-v0`,
        alunoId: comConsentimento,
        profissionalId: personalId,
        tipo: 'PERSONAL',
        status: 'ATIVO',
        convidadoPorId: personalId,
        atualizadoEm: agora,
      },
      {
        id: `${marca}-v1`,
        alunoId: comConsentimento,
        profissionalId: nutriId,
        tipo: 'NUTRICIONISTA',
        status: 'ATIVO',
        convidadoPorId: nutriId,
        atualizadoEm: agora,
      },
      {
        id: `${marca}-v2`,
        alunoId: semConsentimento,
        profissionalId: personalId,
        tipo: 'PERSONAL',
        status: 'ATIVO',
        convidadoPorId: personalId,
        atualizadoEm: agora,
      },
    ]);

    // Só o primeiro autorizou TREINO. O segundo tem vínculo e nada mais.
    await admin.from('Consentimento').insert({
      id: `${marca}-c0`,
      alunoId: comConsentimento,
      escopo: 'TREINO',
      profissionalId: personalId,
      finalidade: 'Prova',
      versaoTermo: '1',
    });

    const hoje = new Date();
    const diaAtras = (n: number): string =>
      new Date(hoje.getTime() - n * 86400000).toISOString().slice(0, 10);

    const sessaoA = await sessaoDe(comConsentimento);
    const sessaoB = await sessaoDe(semConsentimento);

    // Três treinos seguidos com dor: é o padrão que a tela precisa destacar.
    await treinoCom(comConsentimento, sessaoA, diaAtras(5), {
      dificuldade: 4,
      teveDor: true,
      localDor: 'Ombro',
    });
    await treinoCom(comConsentimento, sessaoA, diaAtras(3), {
      dificuldade: 4,
      teveDor: true,
      localDor: 'Ombro',
    });
    await treinoCom(comConsentimento, sessaoA, diaAtras(1), {
      dificuldade: 5,
      teveDor: true,
      localDor: 'Ombro',
    });
    await treinoCom(semConsentimento, sessaoB, diaAtras(2), {
      dificuldade: 5,
      teveDor: true,
      localDor: 'Joelho',
    });

    await personal.auth.login({ email: 'personal@viviofit.com.br', senha: 'Senha@123' });
  });

  afterAll(async () => {
    for (const id of [comConsentimento, semConsentimento]) {
      const ex =
        ((await admin.from('ExecucaoTreino').select('id').eq('alunoId', id)).data as
          | { id: string }[]
          | null) ?? [];
      if (ex.length > 0) {
        await admin.from('FeedbackTreino').delete().in('execucaoId', ex.map((e) => e.id));
        await admin.from('ExecucaoTreino').delete().eq('alunoId', id);
      }
      await admin.from('SessaoTreino').delete().ilike('id', `${marca}-sessao-%`);
      await admin.from('PlanoTreino').delete().eq('alunoId', id);
      await admin.from('Consentimento').delete().eq('alunoId', id);
      await admin.from('Vinculo').delete().eq('alunoId', id);
      await admin.from('PerfilAluno').delete().eq('userId', id);
      await admin.from('User').delete().eq('id', id);
      await admin.auth.admin.deleteUser(id);
    }
  });

  it('o cabeçalho traz a ficha e a equipe inteira', async () => {
    const r = await personal.alunos.resumo(comConsentimento);

    expect(r.nome).toBe(`Com consentimento ${marca}`);
    expect(r.alturaCm).toBe(178);
    expect(r.objetivo).toBe('Ganhar massa');
    expect(r.idade).toBeGreaterThan(30);

    // A equipe inclui a nutricionista, que não é quem está perguntando: é o que
    // faz o personal saber com quem dividir a conduta.
    const tipos = r.equipe.map((e) => e.tipo).sort();
    expect(tipos).toEqual(['NUTRICIONISTA', 'PERSONAL']);
    expect(r.equipe.every((e) => e.profissional.nome.length > 0)).toBe(true);
  });

  it('o cabeçalho não abre a ficha de quem não tem relação comigo', async () => {
    /*
      O colega de equipe seria legível de propósito — o chat mostra o nome de
      quem cuida do mesmo aluno. O que não se alcança é quem não tem relação
      nenhuma: nem vínculo, nem aluno em comum.
    */
    const estranho = await admin.auth.admin.createUser({
      email: `${marca}-estranho@teste.com`,
      password: 'Senha@123',
      email_confirm: true,
      user_metadata: { nome: `Estranho ${marca}`, papel: 'ALUNO' },
    });
    const estranhoId = estranho.data.user!.id;

    const recusa = await personal.alunos
      .resumo(estranhoId)
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);
    expect(recusa?.status).toBe(404);

    await admin.from('PerfilAluno').delete().eq('userId', estranhoId);
    await admin.from('User').delete().eq('id', estranhoId);
    await admin.auth.admin.deleteUser(estranhoId);
  });

  it('o painel traz só quem autorizou TREINO', async () => {
    const p = await personal.feedback.daCarteira(30, false);

    const alunos = new Set(p.linhas.map((l) => l.aluno.id));
    expect(alunos.has(comConsentimento)).toBe(true);
    /*
      O outro aluno tem vínculo ativo e treinou com dor. O que ele não tem é
      consentimento de TREINO — e sem ele o feedback não é do profissional para
      ler, por mais que a dor no joelho pedisse conduta.
    */
    expect(alunos.has(semConsentimento)).toBe(false);
    expect(p.linhas.some((l) => l.localDor === 'Joelho')).toBe(false);
  });

  it('três treinos seguidos com dor aparecem como sequência, não como três avulsos', async () => {
    const p = await personal.feedback.daCarteira(30, false);
    const doAluno = p.linhas
      .filter((l) => l.aluno.id === comConsentimento)
      .sort((a, b) => a.treinoEm.localeCompare(b.treinoEm));

    expect(doAluno).toHaveLength(3);
    /*
      É o número que separa "torceu o pé no fim de semana" de "tem alguma coisa
      errada na prescrição". Dor isolada acontece; dor em três treinos seguidos
      é um padrão.
    */
    expect(doAluno.map((l) => l.sequenciaDeDor)).toEqual([1, 2, 3]);
    expect(p.precisamDeOlhar).toBeGreaterThan(0);
  });

  it('o filtro de atenção encolhe a lista sem mentir no total', async () => {
    const tudo = await personal.feedback.daCarteira(30, false);
    const so = await personal.feedback.daCarteira(30, true);

    // `total` continua sendo o que houve; `linhas` é o que se escolheu ver.
    expect(so.total).toBe(tudo.total);
    expect(so.linhas.length).toBeLessThanOrEqual(tudo.linhas.length);
    expect(so.linhas.every((l) => l.teveDor || l.dificuldade >= 4 || l.comentario !== null)).toBe(
      true,
    );
  });

  it('o resumo separa quem sumiu de quem não autorizou', async () => {
    const r = await personal.resumo.doProfissional();

    expect(r.alunosAtivos).toBeGreaterThanOrEqual(2);

    /*
      O aluno sem consentimento de TREINO não pode aparecer como sumido: de
      quem não autorizou, o app NÃO SABE se sumiu, e listar como sumido
      afirmaria o que não se mediu. Ele aparece em `autorizacoesPendentes`, que
      é a informação verdadeira e a que leva a uma ação possível.
    */
    expect(r.sumidos.map((a) => a.alunoId)).not.toContain(semConsentimento);
    expect(r.autorizacoesPendentes.map((a) => a.alunoId)).toContain(semConsentimento);
    const pendente = r.autorizacoesPendentes.find((a) => a.alunoId === semConsentimento)!;
    expect(pendente.faltando).toContain('TREINO');

    // E quem autorizou e treinou há um dia também não é sumido.
    expect(r.sumidos.map((a) => a.alunoId)).not.toContain(comConsentimento);
    expect(r.autorizacoesPendentes.map((a) => a.alunoId)).not.toContain(comConsentimento);
  });

  it('o relatório deixa em branco o que o aluno não autorizou', async () => {
    const r = await personal.relatorios.carteira(30);

    const comAcesso = r.linhas.find((l) => l.alunoId === comConsentimento)!;
    const semAcesso = r.linhas.find((l) => l.alunoId === semConsentimento)!;

    // Os dois aparecem: ambos são da carteira, e a tela precisa dizer o que
    // falta autorizar.
    expect(comAcesso).toBeDefined();
    expect(semAcesso).toBeDefined();

    expect(comAcesso.autorizou.treino).toBe(true);
    expect(comAcesso.treinosNoPeriodo).toBe(3);
    expect(comAcesso.diasSemTreinar).toBeLessThanOrEqual(2);

    /*
      Branco, e não zero. Zero diria "este aluno não treinou", que é uma
      afirmação sobre ele — e o app não tem como saber: ele treinou três vezes
      e não autorizou ninguém a contar.
    */
    expect(semAcesso.autorizou.treino).toBe(false);
    expect(semAcesso.treinosNoPeriodo).toBeNull();
    expect(semAcesso.ultimoTreinoEm).toBeNull();
    expect(semAcesso.pesoAtualKg).toBeNull();

    // A média é sobre quem autorizou: dividir pela carteira inteira faria a
    // média cair por causa de quem o app não pode medir.
    expect(r.mediaTreinosPorAluno).toBeGreaterThan(0);
  });

  it('sem plano ativo, a lista de compras diz isso em vez de vir vazia', async () => {
    const erro = await personal.listaDeCompras
      .gerar(comConsentimento, 7)
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);

    // Lista vazia se leria como "não precisa comprar nada".
    expect(erro?.status).toBe(404);
  });
});
