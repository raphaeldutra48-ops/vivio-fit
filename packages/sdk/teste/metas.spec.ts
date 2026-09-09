import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VivioClient } from '../src/client';

/**
 * Metas pelo SDK, sem API.
 *
 * Duas coisas que este arquivo persegue existiam como **divergência** entre a
 * API e a política, e só apareceriam depois de a API sair:
 *
 *   * o consentimento da meta é EVOLUCAO, como o controlador sempre declarou;
 *     a política pedia TREINO, e com isso a meta de quem autorizou treino e não
 *     autorizou evolução passaria a ser legível;
 *   * quem define meta é o profissional. A política aceitava qualquer um com
 *     vínculo, e o aluno criaria as próprias — meta vira lista de desejos, e o
 *     profissional deixa de saber o que combinou.
 *
 * A terceira é o `valorInicial`: ele é a régua do progresso, e reescrevê-lo no
 * meio do caminho faria a barra andar sozinha.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

const DIA = 86_400_000;
const diaDeHaDias = (n: number): string => new Date(Date.now() - n * DIA).toISOString().slice(0, 10);

describe.skipIf(!url || !anon || !servico)('SDK sem API: metas', () => {
  const marca = `prova-meta-${Date.now()}`;
  const emailDoAluno = `${marca}@teste.com`;
  const soTreinoId = `${marca}-so-treino`;

  let admin: SupabaseClient;
  let alunoId = '';
  let personalId = '';
  let metaDoPeso = '';

  const cliente = (): VivioClient =>
    new VivioClient({
      baseUrl: 'http://127.0.0.1:1',
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const personal = cliente();
  const aluno = cliente();

  const erro = (r: { error: unknown }, o: string): void => {
    if (r.error) throw new Error(`${o}: ${JSON.stringify(r.error)}`);
  };

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });
    const agora = new Date().toISOString();

    personalId = (
      (await admin.from('User').select('id').eq('email', 'personal@viviofit.com.br').single())
        .data as { id: string }
    ).id;

    /*
      Conta de verdade no Auth, e não linha solta em `User`: a regra que se
      quer provar é "o aluno não define a própria meta", e para isso ele
      precisa conseguir entrar. O gatilho `criar_usuario_vivio` cria a linha em
      `User` com o mesmo id.
    */
    const criada = await admin.auth.admin.createUser({
      email: emailDoAluno,
      password: 'Senha@123',
      email_confirm: true,
      user_metadata: { nome: 'Aluna das Metas', papel: 'ALUNO' },
    });
    if (criada.error) throw new Error(`conta: ${criada.error.message}`);
    alunoId = criada.data.user!.id;

    // Um segundo aluno, que autorizou TREINO e NÃO autorizou EVOLUCAO.
    erro(
      await admin.from('User').insert({
        id: soTreinoId,
        email: `${soTreinoId}@teste.com`,
        nome: 'Aluno só de treino',
        papel: 'ALUNO',
        status: 'ATIVA',
        atualizadoEm: agora,
      }),
      'aluno so treino',
    );

    erro(
      await admin.from('Vinculo').insert(
        [alunoId, soTreinoId].map((id, i) => ({
          id: `${marca}-v${i}`,
          alunoId: id,
          profissionalId: personalId,
          tipo: 'PERSONAL',
          status: 'ATIVO',
          convidadoPorId: personalId,
          atualizadoEm: agora,
        })),
      ),
      'vinculos',
    );
    erro(
      await admin.from('Consentimento').insert([
        { id: `${marca}-c1`, alunoId, escopo: 'TREINO', finalidade: 'Prova', versaoTermo: '1' },
        { id: `${marca}-c2`, alunoId, escopo: 'EVOLUCAO', finalidade: 'Prova', versaoTermo: '1' },
        {
          id: `${marca}-c3`,
          alunoId: soTreinoId,
          escopo: 'TREINO',
          finalidade: 'Prova',
          versaoTermo: '1',
        },
      ]),
      'consentimentos',
    );

    // A pesagem que vira a régua da meta.
    erro(
      await admin.from('Medida').insert({
        id: `${marca}-m1`,
        alunoId,
        data: diaDeHaDias(30),
        pesoKg: 80,
        registradoPorId: personalId,
        atualizadoEm: agora,
      }),
      'medida',
    );

    await Promise.all([
      personal.auth.login({ email: 'personal@viviofit.com.br', senha: 'Senha@123' }),
      aluno.auth.login({ email: emailDoAluno, senha: 'Senha@123' }),
    ]);
  });

  afterAll(async () => {
    await admin.from('Meta').delete().in('alunoId', [alunoId, soTreinoId]);
    await admin.from('Medida').delete().eq('alunoId', alunoId);
    await admin.from('Consentimento').delete().in('alunoId', [alunoId, soTreinoId]);
    await admin.from('Vinculo').delete().in('alunoId', [alunoId, soTreinoId]);
    await admin.from('PerfilAluno').delete().eq('userId', alunoId);
    await admin.from('User').delete().in('id', [alunoId, soTreinoId]);
    if (alunoId) await admin.auth.admin.deleteUser(alunoId);
  });

  it('a meta nasce com a régua congelada do que já existia', async () => {
    const m = await personal.metas.criar(alunoId, {
      tipo: 'PESO_CORPORAL',
      titulo: 'Chegar aos 75 kg',
      alvo: 75,
      prazo: diaDeHaDias(-60).slice(0, 10),
    });
    metaDoPeso = m.id;

    // 80 kg é a última pesagem de antes: sem esta régua, "faltam 3 kg" não diz
    // se a pessoa andou 10% ou 90% do caminho.
    expect(m.valorInicial).toBe(80);
    expect(m.valorAtual).toBe(80);
    expect(m.progresso).toBe(0);
    expect(m.atingida).toBe(false);
    expect(m.atrasada).toBe(false);
  });

  it('o progresso é aferido na hora, e a régua não anda junto', async () => {
    erro(
      await admin.from('Medida').insert({
        id: `${marca}-m2`,
        alunoId,
        data: diaDeHaDias(1),
        pesoKg: 78,
        registradoPorId: personalId,
        atualizadoEm: new Date().toISOString(),
      }),
      'medida nova',
    );

    const m = (await personal.metas.listar(alunoId)).find((x) => x.id === metaDoPeso)!;
    expect(m.valorAtual).toBe(78);
    expect(m.valorInicial).toBe(80);
    /*
      Percorreu 2 dos 5 kg. Medindo a distância até zero — o erro fácil aqui —
      daria 97%, porque 78 é quase 75 em valor absoluto.
    */
    expect(m.progresso).toBe(40);
    expect(m.atingida).toBe(false);
  });

  it('a régua não se reescreve nem por fora do SDK', async () => {
    const bruto = createClient(url!, anon!, { auth: { persistSession: false } });
    await bruto.auth.signInWithPassword({
      email: 'personal@viviofit.com.br',
      password: 'Senha@123',
    });

    // Reescrever o inicial para 78 faria a meta "andar" de 40% para 100% sem
    // ninguém ter perdido um grama.
    await bruto.from('Meta').update({ valorInicial: 78, alvo: 90 }).eq('id', metaDoPeso);

    const m = (await personal.metas.listar(alunoId)).find((x) => x.id === metaDoPeso)!;
    expect(m.valorInicial).toBe(80);
    expect(m.alvo).toBe(75);
    expect(m.progresso).toBe(40);
  });

  it('sem medição, a meta não finge que a pessoa está no começo', async () => {
    /*
      `null` é diferente de zero: quem nunca treinou não treina zero vezes por
      semana — ainda não se sabe. Zero desenharia uma barra vazia com cara de
      dado, e o profissional cobraria alguém por um número inventado.
    */
    const m = await personal.metas.criar(alunoId, {
      tipo: 'FREQUENCIA_SEMANAL',
      titulo: 'Treinar 3x por semana',
      alvo: 3,
    });
    expect(m.valorInicial).toBeNull();
    expect(m.valorAtual).toBeNull();
    expect(m.progresso).toBeNull();
    expect(m.atingida).toBe(false);
  });

  it('concluir à mão vence a aferição, e reabrir desfaz', async () => {
    /*
      O profissional encerra uma meta que deixou de fazer sentido — lesão,
      mudança de objetivo — e o sistema não pode reabri-la porque o número
      ainda não bateu.
    */
    const concluida = await personal.metas.concluir(alunoId, metaDoPeso);
    expect(concluida.atingida).toBe(true);
    expect(concluida.concluidaEm).not.toBeNull();

    const reaberta = await personal.metas.reabrir(alunoId, metaDoPeso);
    expect(reaberta.atingida).toBe(false);
    expect(reaberta.concluidaEm).toBeNull();
  });

  it('a lista traz o que falta antes do que já foi', async () => {
    await personal.metas.concluir(alunoId, metaDoPeso);
    const lista = await personal.metas.listar(alunoId);

    // Meta concluída é registro; meta aberta é trabalho. Misturar faria o
    // profissional caçar o que falta no meio do que já terminou.
    expect(lista[0]!.atingida).toBe(false);
    expect(lista.at(-1)!.id).toBe(metaDoPeso);

    await personal.metas.reabrir(alunoId, metaDoPeso);
  });

  it('remover é carimbo, e apagar de verdade não passa', async () => {
    const nova = await personal.metas.criar(alunoId, {
      tipo: 'LIVRE',
      titulo: 'Meta para remover',
    });

    const bruto = createClient(url!, anon!, { auth: { persistSession: false } });
    await bruto.auth.signInWithPassword({
      email: 'personal@viviofit.com.br',
      password: 'Senha@123',
    });
    // A meta pode estar citada num relatório já enviado: some da tela, não do
    // banco.
    const apagou = await bruto.from('Meta').delete().eq('id', nova.id);
    expect(apagou.error).not.toBeNull();

    await personal.metas.remover(alunoId, nova.id);
    expect((await personal.metas.listar(alunoId)).some((m) => m.id === nova.id)).toBe(false);
    const aindaLa = await admin.from('Meta').select('id').eq('id', nova.id);
    expect(aindaLa.data).toHaveLength(1);
  });

  it('o aluno lê as metas dele, e não define nenhuma', async () => {
    /*
      Meta é combinação de acompanhamento. Deixar o aluno criar e concluir
      esvazia o sentido dela.
    */
    const dele = await aluno.metas.listar(alunoId);
    expect(dele.length).toBeGreaterThan(0);

    await expect(
      aluno.metas.criar(alunoId, { tipo: 'LIVRE', titulo: 'Minha própria meta' }),
    ).rejects.toMatchObject({ codigo: 'ACESSO_NEGADO' });

    /*
      Concluir é UPDATE, e aí a recusa é de outro tipo: política ausente num
      INSERT dá erro, num UPDATE afeta ZERO linhas e responde 200. Sem alguém
      conferindo o que mudou, o aluno veria "meta concluída" sobre coisa
      nenhuma — e descobriria na próxima vez que abrisse a tela.
    */
    await expect(aluno.metas.concluir(alunoId, metaDoPeso)).rejects.toMatchObject({
      codigo: 'ACESSO_NEGADO',
    });
    const intacta = (await personal.metas.listar(alunoId)).find((m) => m.id === metaDoPeso)!;
    expect(intacta.concluidaEm).toBeNull();
  });

  it('sem consentimento de EVOLUCAO não há meta, nem para ler nem para criar', async () => {
    /*
      O aluno autorizou TREINO e só. A API sempre pediu EVOLUCAO aqui — é o
      mesmo dado do painel de evolução —, e a política pedia TREINO: por essa
      fresta a meta dele apareceria.
    */
    erro(
      await admin.from('Meta').insert({
        id: `${marca}-invisivel`,
        alunoId: soTreinoId,
        criadoPorId: personalId,
        tipo: 'LIVRE',
        titulo: 'Não deveria aparecer',
        atualizadoEm: new Date().toISOString(),
      }),
      'meta invisivel',
    );

    expect(await personal.metas.listar(soTreinoId)).toEqual([]);
    await expect(
      personal.metas.criar(soTreinoId, { tipo: 'LIVRE', titulo: 'Nem criar' }),
    ).rejects.toMatchObject({ codigo: 'ACESSO_NEGADO' });
  });
});
