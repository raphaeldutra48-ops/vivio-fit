import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Os arquivos no Supabase Storage, sem API no meio.
 *
 * Hoje quem confere quem pode ver a foto de evolução é a API, que devolve um
 * link assinado. Sem ela, quem confere é o próprio Storage — e estes testes
 * são a prova de que a regra que estava no código passou para o banco com o
 * mesmo desenho.
 *
 * O par de cada caso importa: quem NÃO alcança o arquivo e quem PRECISA
 * continuar alcançando. Um arquivo de testes só com recusas ficaria verde com
 * o armazenamento inteiro fechado.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

/** PNG de 1x1, o menor arquivo válido que o compartimento aceita. */
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

describe.skipIf(!url || !anon || !servico)('armazenamento sem API', () => {
  const marca = `prova-arq-${Date.now()}`;
  const emailAluna = `${marca}-aluna@teste.com`;
  const emailOutra = `${marca}-outra@teste.com`;

  let admin: SupabaseClient;
  let aluna: SupabaseClient;
  let outra: SupabaseClient;
  let personal: SupabaseClient;
  let medico: SupabaseClient;
  let alunaId = '';
  let outraId = '';
  let personalId = '';
  let caminho = '';

  const entrar = async (email: string): Promise<SupabaseClient> => {
    const c = createClient(url!, anon!, { auth: { persistSession: false } });
    const r = await c.auth.signInWithPassword({ email, password: 'Senha@123' });
    if (r.error) throw new Error(`login ${email}: ${r.error.message}`);
    return c;
  };

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

    for (const [email, nome] of [
      [emailAluna, 'Aluna do Arquivo'],
      [emailOutra, 'Outra Aluna'],
    ]) {
      const r = await admin.auth.admin.createUser({
        email,
        password: 'Senha@123',
        email_confirm: true,
        user_metadata: { nome, papel: 'ALUNO' },
      });
      if (r.error) throw new Error(`conta ${email}: ${r.error.message}`);
      if (email === emailAluna) alunaId = r.data.user!.id;
      else outraId = r.data.user!.id;
    }

    erro(
      await admin.from('Vinculo').insert({
        id: `${marca}-v`,
        alunoId: alunaId,
        profissionalId: personalId,
        tipo: 'PERSONAL',
        status: 'ATIVO',
        convidadoPorId: personalId,
        atualizadoEm: agora,
      }),
      'vinculo',
    );
    erro(
      await admin.from('Consentimento').insert({
        id: `${marca}-c`,
        alunoId: alunaId,
        escopo: 'EVOLUCAO',
        profissionalId: personalId,
        finalidade: 'Prova',
        versaoTermo: '1',
      }),
      'consentimento',
    );

    [aluna, outra, personal, medico] = await Promise.all([
      entrar(emailAluna),
      entrar(emailOutra),
      entrar('personal@viviofit.com.br'),
      entrar('medico@viviofit.com.br'),
    ]);

    caminho = `${alunaId}/${marca}.png`;
  });

  afterAll(async () => {
    await admin.storage.from('evolucao').remove([caminho, `${outraId}/invasao.png`]);
    await admin.from('Consentimento').delete().eq('alunoId', alunaId);
    await admin.from('Vinculo').delete().eq('alunoId', alunaId);
    for (const id of [alunaId, outraId]) {
      await admin.from('PerfilAluno').delete().eq('userId', id);
      await admin.from('User').delete().eq('id', id);
      await admin.auth.admin.deleteUser(id);
    }
  });

  it('a aluna sobe a própria foto e lê de volta', async () => {
    const envio = await aluna.storage
      .from('evolucao')
      .upload(caminho, PNG, { contentType: 'image/png' });
    expect(envio.error).toBeNull();

    const leitura = await aluna.storage.from('evolucao').download(caminho);
    expect(leitura.error).toBeNull();
    expect(await leitura.data!.arrayBuffer()).toHaveProperty('byteLength', PNG.byteLength);
  });

  it('ninguém escreve na pasta de outra pessoa', async () => {
    /*
      É o que substitui a chave sorteada no servidor. Antes o cliente não
      escolhia onde gravava porque não gerava a chave; agora ele gera, e o que
      o impede de gravar como se fosse outra pessoa é esta regra.
    */
    const invasao = await outra.storage
      .from('evolucao')
      .upload(`${alunaId}/invasao.png`, PNG, { contentType: 'image/png' });
    expect(invasao.error).not.toBeNull();
  });

  it('outra aluna não lê a foto — e a recusa não entrega o conteúdo', async () => {
    const r = await outra.storage.from('evolucao').download(caminho);
    expect(r.error).not.toBeNull();
    expect(r.data).toBeNull();
  });

  it('o personal com vínculo e consentimento de EVOLUCAO lê', async () => {
    // O par do teste acima: fechar para todos seria fácil e quebraria a tela
    // de evolução de quem acompanha a aluna.
    const r = await personal.storage.from('evolucao').download(caminho);
    expect(r.error).toBeNull();
    expect(r.data).not.toBeNull();
  });

  it('profissional sem vínculo com ela não lê', async () => {
    const r = await medico.storage.from('evolucao').download(caminho);
    expect(r.error).not.toBeNull();
  });

  it('revogado o consentimento, o vínculo sozinho não basta', async () => {
    /*
      Medido, e não suposto: o que sobrevive à revogação é o par SESSÃO +
      ARQUIVO já aberto. Sessão nova é recusada na hora, e a mesma sessão é
      recusada em qualquer arquivo que ainda não tenha baixado — é isso que
      este teste afirma.

      A janela é a do token, 15 minutos, e não é nova: o link assinado que a
      API entregava também continuava valendo depois da revogação, por 5
      minutos. Revogar nunca apagou o que já estava na mão de alguém.
    */
    const outroArquivo = `${alunaId}/${marca}-2.png`;
    await aluna.storage.from('evolucao').upload(outroArquivo, PNG, { contentType: 'image/png' });

    await admin
      .from('Consentimento')
      .update({ revogadoEm: new Date().toISOString() })
      .eq('id', `${marca}-c`);

    // Arquivo que ele nunca abriu: recusado, com a mesma sessão.
    expect((await personal.storage.from('evolucao').download(outroArquivo)).error).not.toBeNull();

    // Sessão nova: recusada inclusive no arquivo que ele já tinha visto.
    const outraSessao = await entrar('personal@viviofit.com.br');
    expect((await outraSessao.storage.from('evolucao').download(caminho)).error).not.toBeNull();

    await admin.storage.from('evolucao').remove([outroArquivo]);
    await admin.from('Consentimento').update({ revogadoEm: null }).eq('id', `${marca}-c`);
  });

  it('o link assinado é curto e leva ao arquivo', async () => {
    /*
      É assim que a tela mostra a foto: o Storage assina com a sessão de quem
      pede, e a assinatura só sai para quem a política deixaria baixar.
    */
    const { data, error } = await aluna.storage.from('evolucao').createSignedUrl(caminho, 300);
    expect(error).toBeNull();
    const resposta = await fetch(data!.signedUrl);
    expect(resposta.status).toBe(200);
    expect(Number(resposta.headers.get('content-length'))).toBe(PNG.byteLength);
  });

  it('o catálogo é público, e só de leitura', async () => {
    const semLogin = createClient(url!, anon!, { auth: { persistSession: false } });
    const escrita = await semLogin.storage
      .from('catalogo')
      .upload(`invasao-${marca}.png`, PNG, { contentType: 'image/png' });
    expect(escrita.error).not.toBeNull();
  });
});
