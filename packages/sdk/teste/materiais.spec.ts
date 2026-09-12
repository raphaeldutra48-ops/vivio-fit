import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroApi } from '../src/erro';
import { VivioClient } from '../src/client';

/**
 * Material pelo SDK, sem API.
 *
 * O material é conteúdo do PROFISSIONAL — um PDF de orientação, um vídeo, um
 * link. Não é dado de aluno e não passa por consentimento. O que passa por
 * vínculo é a ENTREGA: mandar arquivo para quem não é seu aluno é abuso da
 * lista, e é a única regra dura daqui.
 *
 * `abrir` continua na API: o link é assinado, e assinar depende do
 * armazenamento, que ainda vive fora do Supabase.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK sem API: material', () => {
  const marca = `prova-material-${Date.now()}`;
  const emailDoAluno = `${marca}@teste.com`;
  const semVinculoId = `${marca}-estranho`;

  let admin: SupabaseClient;
  let alunoId = '';
  let personalId = '';
  let materialId = '';
  let arquivoId = '';
  let chaveDoArquivo = '';

  const cliente = (): VivioClient =>
    new VivioClient({
      baseUrl: 'http://127.0.0.1:1',
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const personal = cliente();
  const aluno = cliente();
  const medico = cliente();

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

    const criada = await admin.auth.admin.createUser({
      email: emailDoAluno,
      password: 'Senha@123',
      email_confirm: true,
      user_metadata: { nome: 'Aluna do Material', papel: 'ALUNO' },
    });
    if (criada.error) throw new Error(`conta: ${criada.error.message}`);
    alunoId = criada.data.user!.id;

    erro(
      await admin.from('User').insert({
        id: semVinculoId,
        email: `${semVinculoId}@teste.com`,
        nome: 'Estranho',
        papel: 'ALUNO',
        status: 'ATIVA',
        atualizadoEm: agora,
      }),
      'estranho',
    );
    erro(
      await admin.from('Vinculo').insert({
        id: `${marca}-v`,
        alunoId,
        profissionalId: personalId,
        tipo: 'PERSONAL',
        status: 'ATIVO',
        convidadoPorId: personalId,
        atualizadoEm: agora,
      }),
      'vinculo',
    );

    await Promise.all([
      personal.auth.login({ email: 'personal@viviofit.com.br', senha: 'Senha@123' }),
      aluno.auth.login({ email: emailDoAluno, senha: 'Senha@123' }),
      medico.auth.login({ email: 'medico@viviofit.com.br', senha: 'Senha@123' }),
    ]);
  });

  afterAll(async () => {
    const meus =
      ((await admin.from('Material').select('id').eq('autorId', personalId).ilike('titulo', `%${marca}%`))
        .data as { id: string }[] | null) ?? [];
    if (meus.length > 0) {
      await admin.from('MaterialCompartilhado').delete().in('materialId', meus.map((m) => m.id));
      await admin.from('Material').delete().in('id', meus.map((m) => m.id));
    }
    if (chaveDoArquivo) {
      await admin.storage.from('materiais').remove([chaveDoArquivo.replace('materiais/', '')]);
    }
    await admin.from('Vinculo').delete().eq('alunoId', alunoId);
    await admin.from('PerfilAluno').delete().eq('userId', alunoId);
    await admin.from('User').delete().in('id', [alunoId, semVinculoId]);
    if (alunoId) await admin.auth.admin.deleteUser(alunoId);
  });

  it('a etiqueta é normalizada, e é por ela que se acha depois', async () => {
    const m = await personal.materiais.criar({
      titulo: `Guia de ombro ${marca}`,
      descricao: 'Como aquecer antes de puxar.',
      tipo: 'LINK',
      url: 'https://exemplo.com/guia',
      etiquetas: ['  Ombro ', 'OMBRO', 'reabilitação'],
    });
    materialId = m.id;

    // "Ombro " e "OMBRO" viram uma gaveta só, em minúscula — e na ordem em
    // que foram escritas, não em ordem alfabética.
    expect(m.etiquetas).toEqual(['ombro', 'reabilitação']);
    expect(m.compartilhadoCom).toEqual([]);

    expect((await personal.materiais.listar('OMBRO')).map((x) => x.id)).toContain(materialId);
    expect((await personal.materiais.listar('joelho')).map((x) => x.id)).not.toContain(materialId);
  });

  it('a biblioteca é do autor: outro profissional não a enxerga', async () => {
    expect(await medico.materiais.listar()).toEqual([]);
  });

  it('entregar exige vínculo ativo, e o lote é tudo ou nada', async () => {
    /*
      Mandar arquivo para quem não é seu aluno é abuso da lista. E metade
      entregue com um erro na tela deixaria o profissional sem saber quem
      recebeu — por isso o lote inteiro é recusado.
    */
    await expect(
      personal.materiais.compartilhar(materialId, { alunoIds: [alunoId, semVinculoId] }),
    ).rejects.toMatchObject({ codigo: 'ACESSO_NEGADO' });

    expect(
      (await admin.from('MaterialCompartilhado').select('id').eq('materialId', materialId)).data ??
        [],
    ).toEqual([]);

    const m = await personal.materiais.compartilhar(materialId, { alunoIds: [alunoId] });
    expect(m.compartilhadoCom.map((c) => c.alunoId)).toEqual([alunoId]);
    expect(m.compartilhadoCom[0]!.nome).toBe('Aluna do Material');
    expect(m.compartilhadoCom[0]!.vistoEm).toBeNull();
  });

  it('o aluno vê o que recebeu, com o nome de quem mandou', async () => {
    const dela = await aluno.materiais.meus();
    const recebido = dela.find((m) => m.id === materialId)!;

    expect(recebido).toBeDefined();
    expect(recebido.titulo).toBe(`Guia de ombro ${marca}`);
    expect(recebido.autor.id).toBe(personalId);
    expect(recebido.compartilhadoEm).toBeTruthy();

    /*
      A chave do arquivo não sai. Quem abre recebe URL assinada e curta,
      emitida por quem confere o direito — a chave crua não precisa sair do
      banco para ninguém.
    */
    expect(JSON.stringify(recebido)).not.toContain('chave');
  });

  it('recompartilhar não duplica nem apaga o "visto"', async () => {
    // O aluno abre o material.
    const bruto = createClient(url!, anon!, { auth: { persistSession: false } });
    await bruto.auth.signInWithPassword({ email: emailDoAluno, password: 'Senha@123' });
    await bruto
      .from('MaterialCompartilhado')
      .update({ vistoEm: new Date().toISOString() })
      .eq('materialId', materialId)
      .eq('alunoId', alunoId);

    const comVisto = (await personal.materiais.listar()).find((m) => m.id === materialId)!;
    expect(comVisto.compartilhadoCom[0]!.vistoEm).not.toBeNull();

    // Mandar de novo não pode zerar o que já foi lido.
    const depois = await personal.materiais.compartilhar(materialId, { alunoIds: [alunoId] });
    expect(depois.compartilhadoCom).toHaveLength(1);
    expect(depois.compartilhadoCom[0]!.vistoEm).toBe(comVisto.compartilhadoCom[0]!.vistoEm);
  });

  it('só quem recebeu carimba que viu', async () => {
    const bruto = createClient(url!, anon!, { auth: { persistSession: false } });
    await bruto.auth.signInWithPassword({
      email: 'personal@viviofit.com.br',
      password: 'Senha@123',
    });
    // O autor enxerga o carimbo — é o que diz se o material foi aberto —, mas
    // quem o cria é quem abriu.
    const antes = (await personal.materiais.listar()).find((m) => m.id === materialId)!;
    await bruto
      .from('MaterialCompartilhado')
      .update({ vistoEm: new Date('2020-01-01').toISOString() })
      .eq('materialId', materialId);

    const depois = (await personal.materiais.listar()).find((m) => m.id === materialId)!;
    expect(depois.compartilhadoCom[0]!.vistoEm).toBe(antes.compartilhadoCom[0]!.vistoEm);
  });

  it('descompartilhar tira da lista dos dois lados', async () => {
    // A entrega é permissão, não histórico: carimbada, o aluno continuaria
    // aparecendo na lista de quem recebeu.
    await personal.materiais.descompartilhar(materialId, alunoId);

    expect(
      (await personal.materiais.listar()).find((m) => m.id === materialId)!.compartilhadoCom,
    ).toEqual([]);
    expect((await aluno.materiais.meus()).map((m) => m.id)).not.toContain(materialId);
  });

  it('abrir o material entrega o arquivo — e carimba a primeira abertura', async () => {
    const PDF = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], {
      type: 'application/pdf',
    });
    chaveDoArquivo = await personal.midia.enviar('MATERIAL', PDF, 'application/pdf');
    const m = await personal.materiais.criar({
      titulo: `Planilha de cargas ${marca}`,
      tipo: 'ARQUIVO',
      chave: chaveDoArquivo,
      nomeArquivo: 'cargas.pdf',
      mimeType: 'application/pdf',
      tamanhoBytes: 5,
      etiquetas: [],
    });
    arquivoId = m.id;
    await personal.materiais.compartilhar(arquivoId, { alunoIds: [alunoId] });

    // O autor abre o que é dele.
    const doAutor = await personal.materiais.abrir(arquivoId);
    expect((await fetch(doAutor.url)).status).toBe(200);

    /*
      A primeira abertura do ALUNO marca o recebimento — é o que diz ao
      profissional se o material chegou a ser lido. Abrir pelo autor não pode
      carimbar nada: senão a tela diria "visto" sobre o próprio envio.
    */
    const antes = (await personal.materiais.listar()).find((x) => x.id === arquivoId)!;
    expect(antes.compartilhadoCom[0]!.vistoEm).toBeNull();

    const doAluno = await aluno.materiais.abrir(arquivoId);
    expect((await fetch(doAluno.url)).status).toBe(200);

    const depois = (await personal.materiais.listar()).find((x) => x.id === arquivoId)!;
    expect(depois.compartilhadoCom[0]!.vistoEm).not.toBeNull();
  });

  it('quem não recebeu não abre — e nem sabe que existe', async () => {
    const erro = await medico.materiais
      .abrir(arquivoId)
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);
    // 404 e não 403: quem não recebeu não precisa saber que o material existe.
    expect(erro?.status).toBe(404);

    // E nem pelo caminho de baixo, com a chave na mão.
    const caminho = chaveDoArquivo.replace('materiais/', '');
    const r = await medico.supabase.db.storage.from('materiais').download(caminho);
    expect(r.error).not.toBeNull();
  });

  it('material do tipo LINK não tem arquivo para abrir', async () => {
    const erro = await personal.materiais
      .abrir(materialId)
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);
    expect(erro?.status).toBe(409);
    expect(erro?.message).toContain('link');
  });

  it('remover é carimbo na linha e exclusão de verdade no arquivo', async () => {
    await personal.materiais.compartilhar(materialId, { alunoIds: [alunoId] });
    await personal.materiais.remover(materialId);
    await personal.materiais.remover(arquivoId);

    expect((await personal.materiais.listar()).map((m) => m.id)).not.toContain(materialId);
    expect((await aluno.materiais.meus()).map((m) => m.id)).not.toContain(materialId);

    /*
      A linha fica carimbada — a entrega já feita é histórico —, mas o arquivo
      sai: até 200 MB por material, e "apagado" que continua baixável por um
      link assinado antigo é só aparência de exclusão.
    */
    const noBanco = await admin.from('Material').select('deletadoEm').eq('id', materialId).single();
    expect((noBanco.data as { deletadoEm: string | null }).deletadoEm).not.toBeNull();

    const pasta = chaveDoArquivo.split('/')[1]!;
    const nome = chaveDoArquivo.split('/').pop()!;
    const restou = await admin.storage.from('materiais').list(pasta, { search: nome });
    expect(restou.data ?? []).toHaveLength(0);
    chaveDoArquivo = '';
  });
});
