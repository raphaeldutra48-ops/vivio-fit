import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroApi } from '../src/erro';
import { VivioClient } from '../src/client';

/**
 * Exercícios pelo SDK, sem API.
 *
 * O que esta suíte persegue não é "a consulta devolve linhas" — isso o
 * PostgREST faz sozinho. É o conjunto de regras que morava em
 * `exercicios.service.ts` e agora tem de estar no banco: quem cria o quê, quem
 * edita o acervo, de quem é o arquivo que vira vídeo do exercício, e a ordem
 * em que a demonstração do profissional vence a do acervo.
 *
 * Cada recusa vem com o par que PRECISA continuar passando. Um arquivo só de
 * negativas ficaria verde com a tabela trancada para todo mundo.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK sem API: exercícios', () => {
  const marca = `prova-ex-${Date.now()}`;
  let admin: SupabaseClient;
  let personalId = '';
  let nutriId = '';
  let globalId = '';
  let meuId = '';

  const cliente = (): VivioClient =>
    new VivioClient({
      baseUrl: 'http://127.0.0.1:1',
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const personal = cliente();
  const nutri = cliente();
  const aluno = cliente();

  const recusa = async (acao: Promise<unknown>, o: string): Promise<ErroApi> => {
    try {
      await acao;
    } catch (erro) {
      if (erro instanceof ErroApi) return erro;
      throw erro;
    }
    throw new Error(`passou e não devia: ${o}`);
  };

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });
    const idDe = async (email: string): Promise<string> =>
      ((await admin.from('User').select('id').eq('email', email).single()).data as { id: string })
        .id;
    personalId = await idDe('personal@viviofit.com.br');
    nutriId = await idDe('nutri@viviofit.com.br');

    // Um exercício do acervo, criado pela chave de serviço — como vieram os de
    // verdade (semente e importador), sem dono.
    globalId = `${marca}-global`;
    await admin.from('Exercicio').insert({
      id: globalId,
      nome: `${marca} supino do acervo`,
      grupoMuscular: 'PEITO',
      escopo: 'GLOBAL',
      atualizadoEm: new Date().toISOString(),
    });

    await Promise.all([
      personal.auth.login({ email: 'personal@viviofit.com.br', senha: 'Senha@123' }),
      nutri.auth.login({ email: 'nutri@viviofit.com.br', senha: 'Senha@123' }),
      aluno.auth.login({ email: 'ana@exemplo.com', senha: 'Senha@123' }),
    ]);
  });

  afterAll(async () => {
    await admin.from('DemonstracaoProfissional').delete().eq('exercicioId', globalId);
    await admin.from('Exercicio').delete().eq('id', globalId);
    if (meuId) await admin.from('Exercicio').delete().eq('id', meuId);
  });

  it('o profissional cria na biblioteca dele, e não na de todo mundo', async () => {
    const criado = await personal.exercicios.criar({
      nome: `${marca} rosca minha`,
      grupoMuscular: 'BICEPS',
      equipamento: 'Halter',
      instrucoes: 'Cotovelo parado.',
    });
    meuId = criado.id;

    /*
      O escopo não vai no corpo do pedido — quem o define é o gatilho, pelo
      papel no token. É a diferença entre "o cliente pede PRIVADO" e "o cliente
      não consegue pedir outra coisa".
    */
    expect(criado.escopo).toBe('PRIVADO');
    expect(criado.criadoPorId).toBe(personalId);
  });

  it('mandar escopo GLOBAL no corpo não faz o exercício entrar no acervo', async () => {
    /*
      Pelo SDK isso nem se digita. Pelo PostgREST cru, sim — e é o caminho de
      quem abre o console do navegador. A conferência tem de estar no banco.
    */
    const sessao = await personal.supabase.db.auth.getSession();
    const r = await fetch(`${url}/rest/v1/Exercicio`, {
      method: 'POST',
      headers: {
        apikey: anon!,
        Authorization: `Bearer ${sessao.data.session!.access_token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        id: `${marca}-tentativa`,
        nome: `${marca} tentativa`,
        grupoMuscular: 'PEITO',
        escopo: 'GLOBAL',
        atualizadoEm: new Date().toISOString(),
      }),
    });
    const linhas = (await r.json()) as { escopo: string }[];
    expect(r.ok).toBe(true);
    expect(linhas[0]!.escopo).toBe('PRIVADO');

    await admin.from('Exercicio').delete().eq('id', `${marca}-tentativa`);
  });

  it('a lista traz o acervo e o que é meu; a biblioteca alheia não aparece', async () => {
    const minha = await personal.exercicios.listar({ q: marca, limit: 100 });
    const nomes = minha.map((e) => e.id);
    expect(nomes).toContain(globalId);
    expect(nomes).toContain(meuId);

    // O nutricionista vê o acervo, e não o exercício privado do personal.
    const dela = await nutri.exercicios.listar({ q: marca, limit: 100 });
    expect(dela.map((e) => e.id)).toContain(globalId);
    expect(dela.map((e) => e.id)).not.toContain(meuId);
  });

  it('o exercício privado de outra pessoa não existe, e não "é proibido"', async () => {
    const erro = await recusa(nutri.exercicios.obter(meuId), 'ler exercício alheio');
    // 404 e não 403: dizer "sem permissão" contaria que o exercício existe.
    expect(erro.status).toBe(404);
  });

  it('o profissional corrige o que é dele', async () => {
    const alterado = await personal.exercicios.atualizar(meuId, { nome: `${marca} rosca direta` });
    expect(alterado.nome).toBe(`${marca} rosca direta`);
  });

  it('exercício do acervo o profissional não edita — e a frase diz por quê', async () => {
    const erro = await recusa(
      personal.exercicios.atualizar(globalId, { nome: 'sequestrado' }),
      'editar o acervo',
    );
    /*
      UPDATE recusado por política afeta zero linhas e responde 200. Sem a
      reconstrução do motivo, a tela diria "salvo" sobre coisa nenhuma.
    */
    expect(erro.status).toBe(403);
    expect(erro.message).toContain('admin');

    const intacto = await personal.exercicios.obter(globalId);
    expect(intacto.nome).toBe(`${marca} supino do acervo`);
  });

  it('vincular vídeo de arquivo que não é meu é recusado pelo banco', async () => {
    const erro = await recusa(
      personal.exercicios.vincularVideo(meuId, `exercicios/${nutriId}/roubado.mp4`),
      'vincular arquivo alheio',
    );
    expect(erro.message).toContain('não pertence a você');

    // E o meu passa: a regra é de dono, não de proibição geral.
    const chave = `exercicios/${personalId}/${marca}.mp4`;
    const comVideo = await personal.exercicios.vincularVideo(meuId, chave);
    expect(comVideo.temVideo).toBe(true);
  });

  it('a demonstração do profissional vale para o exercício do acervo', async () => {
    /*
      É o ponto do desenho inteiro: o personal grava o supino da academia dele
      sem criar um "supino do Diego" — que quebraria o histórico de carga do
      aluno, indexado por exercício.
    */
    await personal.exercicios.gravarDemonstracao(
      globalId,
      `exercicios/${personalId}/${marca}-demo.mp4`,
    );

    const dele = await personal.exercicios.obter(globalId);
    expect(dele.temDemonstracao).toBe(true);

    // O nutricionista não gravou nada: para ela o mesmo exercício não tem.
    const dela = await nutri.exercicios.obter(globalId);
    expect(dela.temDemonstracao).toBe(false);
  });

  it('gravar demonstração com arquivo de outra pessoa é recusado', async () => {
    const erro = await recusa(
      personal.exercicios.gravarDemonstracao(globalId, `exercicios/${nutriId}/roubado.mp4`),
      'gravar com arquivo alheio',
    );
    expect(erro.status).toBe(403);
  });

  it('a fila de gravação é do profissional, e o aluno não tem fila', async () => {
    const fila = await personal.exercicios.planoDeGravacao();
    // O que ele já gravou sai da fila — é o que faz a lista encurtar.
    expect(fila.map((e) => e.id)).not.toContain(globalId);
    // O privado dele já tem vídeo no próprio exercício: também sai.
    expect(fila.map((e) => e.id)).not.toContain(meuId);
    // A ordem é decrescente por prescrição, sempre.
    for (let i = 1; i < fila.length; i += 1) {
      expect(fila[i - 1]!.vezesPrescrito).toBeGreaterThanOrEqual(fila[i]!.vezesPrescrito);
    }

    const erro = await recusa(aluno.exercicios.planoDeGravacao(), 'aluno pedindo fila');
    expect(erro.status).toBe(403);
  });

  it('remover é carimbo: some da lista e o histórico continua apontando', async () => {
    const outro = await personal.exercicios.criar({
      nome: `${marca} para apagar`,
      grupoMuscular: 'COSTAS',
    });
    await personal.exercicios.remover(outro.id);

    const lista = await personal.exercicios.listar({ q: `${marca} para apagar`, limit: 100 });
    expect(lista.map((e) => e.id)).not.toContain(outro.id);

    // A linha continua no banco — é o que mantém legível o treino já executado.
    const { data } = await admin.from('Exercicio').select('deletadoEm').eq('id', outro.id).single();
    expect((data as { deletadoEm: string | null }).deletadoEm).not.toBeNull();

    await admin.from('Exercicio').delete().eq('id', outro.id);
  });
});
