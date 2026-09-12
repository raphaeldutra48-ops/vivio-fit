import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroApi } from '../src/erro';
import { VivioClient } from '../src/client';

/**
 * Foto de evolução pelo SDK, sem API.
 *
 * A foto de evolução tem TRÊS travas, e a terceira é a que este arquivo
 * persegue: além de vínculo e de consentimento de EVOLUCAO, o aluno escolhe
 * **foto a foto** quais profissionais veem. Consentir com o escopo não é
 * consentir com cada imagem.
 *
 * Essa terceira trava vivia em JavaScript, dentro da API, que trazia todas as
 * fotos do aluno do banco e filtrava depois. Era exatamente a regra que sumiria
 * na migração — com a consulta passando a ser do cliente, o filtro em
 * JavaScript deixa de existir. Os casos abaixo são o par: o que o profissional
 * NÃO alcança, e o que ele PRECISA alcançar quando o aluno libera.
 *
 * A prova vai até o arquivo, e não para na linha: a chave do arquivo viaja no
 * corpo de toda resposta que lista fotos, então esconder a linha e deixar o
 * arquivo aberto não esconderia nada.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

/** PNG de 1x1 — o menor arquivo que o compartimento aceita. */
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

describe.skipIf(!url || !anon || !servico)('SDK sem API: foto de evolução', () => {
  const marca = `prova-foto-${Date.now()}`;
  const emailAluna = `${marca}-aluna@teste.com`;

  let admin: SupabaseClient;
  let alunaId = '';
  let personalId = '';
  let fotoId = '';
  let chave = '';

  const cliente = (): VivioClient =>
    new VivioClient({
      baseUrl: 'http://127.0.0.1:1',
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const aluna = cliente();
  const personal = cliente();
  const nutri = cliente();

  /**
   * O arquivo abre para quem entrar com este e-mail?
   *
   * **Sessão nova a cada pergunta, e não é zelo.** O Storage guarda a decisão
   * por par (sessão, arquivo) por cerca de quinze minutos: uma sessão que já
   * baixou o arquivo continua baixando depois de a permissão ser tirada. Com a
   * sessão reaproveitada, todo caso de revogação deste arquivo passaria verde
   * sem revogar nada — o teste diria que a porta fechou olhando para a porta
   * que ele mesmo já tinha aberto.
   *
   * A janela está documentada em `32-armazenamento.sql` e é uma propriedade do
   * Storage, não um defeito nosso: ela limita o quanto uma revogação é
   * imediata, e é por isso que o link assinado é curto.
   */
  const alcancaOArquivo = async (email: string): Promise<boolean> => {
    const sessaoNova = createClient(url!, anon!, { auth: { persistSession: false } });
    const entrada = await sessaoNova.auth.signInWithPassword({ email, password: 'Senha@123' });
    if (entrada.error) throw new Error(`login ${email}: ${entrada.error.message}`);

    const partes = chave.split('/');
    const r = await sessaoNova.storage.from(partes[0]!).download(partes.slice(1).join('/'));
    return r.error === null;
  };

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });
    const agora = new Date().toISOString();

    personalId = (
      (await admin.from('User').select('id').eq('email', 'personal@viviofit.com.br').single())
        .data as { id: string }
    ).id;
    const nutriId = (
      (await admin.from('User').select('id').eq('email', 'nutri@viviofit.com.br').single())
        .data as { id: string }
    ).id;

    const nova = await admin.auth.admin.createUser({
      email: emailAluna,
      password: 'Senha@123',
      email_confirm: true,
      user_metadata: { nome: 'Aluna da Foto', papel: 'ALUNO' },
    });
    if (nova.error) throw new Error(`conta: ${nova.error.message}`);
    alunaId = nova.data.user!.id;

    // Vínculo e consentimento de EVOLUCAO com os DOIS profissionais: as duas
    // primeiras travas abertas, para que só a terceira decida.
    await admin.from('Vinculo').insert(
      [
        [personalId, 'PERSONAL'],
        [nutriId, 'NUTRICIONISTA'],
      ].map(([id, tipo], i) => ({
        id: `${marca}-v${i}`,
        alunoId: alunaId,
        profissionalId: id,
        tipo,
        status: 'ATIVO',
        convidadoPorId: id,
        atualizadoEm: agora,
      })),
    );
    await admin.from('Consentimento').insert(
      [personalId, nutriId].map((id, i) => ({
        id: `${marca}-c${i}`,
        alunoId: alunaId,
        escopo: 'EVOLUCAO',
        profissionalId: id,
        finalidade: 'Prova',
        versaoTermo: '1',
      })),
    );

    await Promise.all([
      aluna.auth.login({ email: emailAluna, senha: 'Senha@123' }),
      personal.auth.login({ email: 'personal@viviofit.com.br', senha: 'Senha@123' }),
      nutri.auth.login({ email: 'nutri@viviofit.com.br', senha: 'Senha@123' }),
    ]);
  });

  afterAll(async () => {
    if (chave) {
      const partes = chave.split('/');
      await admin.storage.from(partes[0]!).remove([partes.slice(1).join('/')]);
    }
    await admin.from('FotoEvolucao').delete().eq('alunoId', alunaId);
    await admin.from('Consentimento').delete().eq('alunoId', alunaId);
    await admin.from('Vinculo').delete().eq('alunoId', alunaId);
    await admin.from('PerfilAluno').delete().eq('userId', alunaId);
    await admin.from('User').delete().eq('id', alunaId);
    await admin.auth.admin.deleteUser(alunaId);
  });

  it('a aluna envia e registra a própria foto', async () => {
    chave = await aluna.midia.enviar('FOTO_EVOLUCAO', new Blob([PNG]), 'image/png');
    expect(chave.startsWith(`evolucao/${alunaId}/`)).toBe(true);

    const foto = await aluna.fotos.registrar(alunaId, {
      chave,
      mimeType: 'image/png',
      tamanhoBytes: PNG.byteLength,
      data: new Date('2026-03-15'),
      angulo: 'FRENTE',
      visivelPara: [],
    });
    fotoId = foto.id;

    // O dia é o dia: `date` no banco, sem hora e sem fuso para empurrá-lo.
    expect(foto.data).toBe('2026-03-15');
    expect(foto.visivelPara).toEqual([]);
    expect(foto.url).toContain('token=');
  });

  it('com vínculo e consentimento, mas sem liberação, o profissional não vê nem a linha nem o arquivo', async () => {
    /*
      É o caso que a API tratava em JavaScript. As duas primeiras travas estão
      abertas de propósito neste teste: se a lista `visivelPara` não decidisse
      nada, esta consulta voltaria com a foto.
    */
    expect(await personal.fotos.listar(alunaId)).toHaveLength(0);
    expect(await alcancaOArquivo('personal@viviofit.com.br')).toBe(false);

    // E a titular continua vendo a própria foto, que é o par que importa.
    expect(await aluna.fotos.listar(alunaId)).toHaveLength(1);
    expect(await alcancaOArquivo(emailAluna)).toBe(true);
  });

  it('liberar para o personal abre a linha e o arquivo — só para ele', async () => {
    const atualizada = await aluna.fotos.definirVisibilidade(alunaId, fotoId, ['PERSONAL']);
    expect(atualizada.visivelPara).toEqual(['PERSONAL']);

    const dele = await personal.fotos.listar(alunaId);
    expect(dele).toHaveLength(1);
    expect(dele[0]!.id).toBe(fotoId);
    expect(await alcancaOArquivo('personal@viviofit.com.br')).toBe(true);

    /*
      A nutricionista tem o MESMO vínculo e o MESMO consentimento. O que ela não
      tem é o papel na lista — e é só isso que separa as duas aqui.
    */
    expect(await nutri.fotos.listar(alunaId)).toHaveLength(0);
    expect(await alcancaOArquivo('nutri@viviofit.com.br')).toBe(false);
  });

  it('tirar da lista fecha de novo — o caminho de volta também funciona', async () => {
    await aluna.fotos.definirVisibilidade(alunaId, fotoId, []);
    expect(await personal.fotos.listar(alunaId)).toHaveLength(0);
    expect(await alcancaOArquivo('personal@viviofit.com.br')).toBe(false);
  });

  it('o profissional não mexe na foto de ninguém, nem para se liberar', async () => {
    const erro = await personal.fotos
      .definirVisibilidade(alunaId, fotoId, ['PERSONAL'])
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);
    expect(erro?.status).toBe(404);

    // E a lista continua como a aluna a deixou.
    const minhas = await aluna.fotos.listar(alunaId);
    expect(minhas[0]!.visivelPara).toEqual([]);
  });

  it('registrar a foto de outra pessoa como sua é recusado pelo banco', async () => {
    const erro = await aluna.fotos
      .registrar(alunaId, {
        chave: `evolucao/${personalId}/roubada.png`,
        mimeType: 'image/png',
        tamanhoBytes: 10,
        data: new Date('2026-03-16'),
        angulo: 'FRENTE',
        visivelPara: [],
      })
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);

    expect(erro?.message).toContain('não pertence a você');
  });

  it('apagar leva o arquivo e deixa o registro carimbado', async () => {
    await aluna.fotos.remover(alunaId, fotoId);

    expect(await aluna.fotos.listar(alunaId)).toHaveLength(0);
    expect(await alcancaOArquivo(emailAluna)).toBe(false);

    /*
      A linha fica: é ela que responde "quem viu esta foto", direito do titular
      pela LGPD, e a pergunta continua valendo depois de a imagem sair.
    */
    const { data } = await admin
      .from('FotoEvolucao')
      .select('deletadoEm')
      .eq('id', fotoId)
      .single();
    expect((data as { deletadoEm: string | null }).deletadoEm).not.toBeNull();

    chave = '';
  });
});
