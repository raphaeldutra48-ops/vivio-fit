import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SLUGS_RESERVADOS } from '@vivio/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroApi } from '../src/erro';
import { VivioClient } from '../src/client';

/**
 * Página pública do profissional pelo SDK, sem API.
 *
 * É a única porta do sistema que abre para quem não entrou, e por isso é a que
 * mais precisa de prova. O que este arquivo persegue:
 *
 *   * quem não tem conta enxerga a PÁGINA e nada mais — nem a tabela, nem o
 *     `profissionalId`, nem os pedidos de contato que outras pessoas enviaram;
 *   * página no ar exige registro conferido pelo admin. Sem isso a plataforma
 *     estaria emprestando credibilidade a quem não comprovou nada;
 *   * o dono lê o próprio RASCUNHO — a política antiga era `publicado = true`
 *     para todo mundo, e a tela de editar abria vazia justamente para quem
 *     ainda está montando.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK sem API: página pública', () => {
  const marca = `prova-site-${Date.now()}`;
  const slug = `personal-da-prova-${Date.now()}`;

  let admin: SupabaseClient;
  let personalId = '';
  let medicoId = '';
  /** O que havia antes, para devolver: a página é do profissional semeado. */
  let paginaOriginal: Record<string, unknown> | null = null;
  let verificacaoDoMedico: string | null = null;

  const cliente = (): VivioClient =>
    new VivioClient({
      baseUrl: 'http://127.0.0.1:1',
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const personal = cliente();
  const medico = cliente();
  /** Sem login nenhum: é o visitante da página. */
  const visitante = cliente();

  const capturar = async (promessa: Promise<unknown>): Promise<ErroApi> => {
    const caiu = await promessa.then(() => null).catch((e: unknown) => e);
    if (!(caiu instanceof ErroApi)) throw new Error(`esperava recusa, veio ${JSON.stringify(caiu)}`);
    return caiu;
  };

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });

    const idDe = async (email: string): Promise<string> =>
      ((await admin.from('User').select('id').eq('email', email).single()).data as { id: string })
        .id;
    const ids = await Promise.all(
      ['personal@viviofit.com.br', 'medico@viviofit.com.br'].map(idDe),
    );
    personalId = ids[0]!;
    medicoId = ids[1]!;

    paginaOriginal =
      ((await admin.from('PerfilPublico').select('*').eq('profissionalId', personalId))
        .data as Record<string, unknown>[] | null)?.[0] ?? null;
    if (paginaOriginal) {
      await admin.from('PedidoDeContato').delete().eq('perfilId', paginaOriginal.id as string);
      await admin.from('PerfilPublico').delete().eq('profissionalId', personalId);
    }

    // O médico entra na prova como NÃO verificado.
    verificacaoDoMedico =
      ((
        await admin
          .from('PerfilProfissional')
          .select('verificadoEm')
          .eq('userId', medicoId)
          .single()
      ).data as { verificadoEm: string | null }).verificadoEm ?? null;
    await admin
      .from('PerfilProfissional')
      .update({ verificadoEm: null })
      .eq('userId', medicoId);

    await Promise.all([
      personal.auth.login({ email: 'personal@viviofit.com.br', senha: 'Senha@123' }),
      medico.auth.login({ email: 'medico@viviofit.com.br', senha: 'Senha@123' }),
    ]);
  });

  afterAll(async () => {
    const minhas =
      ((await admin.from('PerfilPublico').select('id').in('profissionalId', [personalId, medicoId]))
        .data as { id: string }[] | null) ?? [];
    if (minhas.length > 0) {
      await admin.from('PedidoDeContato').delete().in('perfilId', minhas.map((p) => p.id));
    }
    await admin.from('PerfilPublico').delete().in('profissionalId', [personalId, medicoId]);
    if (paginaOriginal) await admin.from('PerfilPublico').insert(paginaOriginal);
    await admin
      .from('PerfilProfissional')
      .update({ verificadoEm: verificacaoDoMedico })
      .eq('userId', medicoId);
  });

  it('o rascunho é do dono, e ele o lê antes de publicar', async () => {
    /*
      A política antiga só devolvia `publicado = true`, para qualquer um: a
      tela de editar abria vazia exatamente para quem está montando a página.
    */
    const rascunho = await personal.site.salvar({
      slug,
      titulo: 'Treino que cabe na sua semana',
      apresentacao: 'Personal há 10 anos.',
      cidade: 'São Paulo',
      uf: 'sp',
      atendeOnline: true,
      atendePresencial: false,
      whatsapp: '11999998888',
      instagram: '@personaldaprova',
      publicado: false,
    });

    expect(rascunho.publicado).toBe(false);
    expect(rascunho.slug).toBe(slug);
    // Normalizados pelo banco: a UF sobe e o `@` some do Instagram.
    expect(rascunho.uf).toBe('SP');
    expect(rascunho.instagram).toBe('personaldaprova');

    expect((await personal.site.meu())?.slug).toBe(slug);
    // E rascunho não está no ar.
    await expect(visitante.site.porSlug(slug)).rejects.toMatchObject({
      codigo: 'RECURSO_NAO_ENCONTRADO',
    });
  });

  it('publicar exige o registro conferido pelo admin', async () => {
    /*
      Uma página dizendo "médico" sem verificação seria a plataforma
      emprestando credibilidade a quem não comprovou nada.
    */
    const caiu = await capturar(
      medico.site.salvar({
        slug: `medico-${marca}`,
        titulo: 'Consultas',
        atendeOnline: true,
        atendePresencial: false,
        publicado: true,
      }),
    );
    expect(caiu.codigo).toBe('ACESSO_NEGADO');

    // Mas rascunho é livre: ele monta a página enquanto espera.
    const rascunho = await medico.site.salvar({
      slug: `medico-${marca}`,
      titulo: 'Consultas',
      atendeOnline: true,
      atendePresencial: false,
      publicado: false,
    });
    expect(rascunho.publicado).toBe(false);
  });

  it('no ar, a página mostra o que foi escolhido — e só isso', async () => {
    await personal.site.salvar({
      slug,
      titulo: 'Treino que cabe na sua semana',
      apresentacao: 'Personal há 10 anos.',
      cidade: 'São Paulo',
      uf: 'SP',
      atendeOnline: true,
      atendePresencial: false,
      whatsapp: '11999998888',
      instagram: 'personaldaprova',
      publicado: true,
    });

    const pagina = await visitante.site.porSlug(slug);
    expect(pagina.titulo).toBe('Treino que cabe na sua semana');
    expect(pagina.profissional.nome).toBeTruthy();
    expect(pagina.profissional.papel).toBe('PERSONAL');
    expect(Array.isArray(pagina.profissional.especialidades)).toBe(true);

    /*
      Nada além da projeção: sem e-mail, sem id, sem `profissionalId`. O que
      não foi escolhido para publicação não sai.
    */
    const texto = JSON.stringify(pagina);
    expect(texto).not.toContain('@viviofit.com.br');
    expect(texto).not.toContain(personalId);
    expect(texto).not.toContain('publicado');
  });

  it('sem sessão, as tabelas continuam fechadas', async () => {
    /*
      A página vem de uma função de propósito: abrir uma política de leitura
      para o `anon` em `User` e `PerfilProfissional` seria escancarar duas
      portas para entregar uma janela.
    */
    const semConta = createClient(url!, anon!, { auth: { persistSession: false } });
    for (const tabela of ['PerfilPublico', 'User', 'PerfilProfissional', 'PedidoDeContato']) {
      const r = await semConta.from(tabela).select('*').limit(1);
      expect(r.data ?? [], tabela).toEqual([]);
    }
  });

  it('o formulário funciona sem conta, e o pedido chega ao dono', async () => {
    await visitante.site.enviarPedido(slug, {
      nome: '  Maria Interessada ',
      email: 'MARIA@EXEMPLO.COM',
      telefone: '11988887777',
      mensagem: 'Quero saber sobre os horários.',
    });

    const pedidos = await personal.site.listarPedidos();
    const dela = pedidos.find((p) => p.email === 'maria@exemplo.com')!;
    expect(dela).toBeDefined();
    // Aparado e em minúscula: é o que vira contato depois.
    expect(dela.nome).toBe('Maria Interessada');
    expect(dela.atendidoEm).toBeNull();

    expect((await personal.site.meu())?.pedidosPendentes).toBe(1);
  });

  it('página fora do ar não recebe pedido', async () => {
    const caiu = await capturar(
      visitante.site.enviarPedido(`nao-existe-${marca}`, {
        nome: 'Ninguém',
        email: 'ninguem@exemplo.com',
      }),
    );
    expect(caiu.codigo).toBe('RECURSO_NAO_ENCONTRADO');
  });

  it('marcar atendido alterna, e o texto do pedido não se reescreve', async () => {
    const pedido = (await personal.site.listarPedidos())[0]!;

    await personal.site.marcarAtendido(pedido.id);
    expect((await personal.site.listarPedidos())[0]!.atendidoEm).not.toBeNull();
    // Alterna: marcar de novo desmarca, para o clique errado ter volta.
    await personal.site.marcarAtendido(pedido.id);
    expect((await personal.site.listarPedidos())[0]!.atendidoEm).toBeNull();

    // O pedido é o que a pessoa escreveu — só o carimbo se mexe.
    const bruto = createClient(url!, anon!, { auth: { persistSession: false } });
    await bruto.auth.signInWithPassword({
      email: 'personal@viviofit.com.br',
      password: 'Senha@123',
    });
    await bruto.from('PedidoDeContato').update({ mensagem: 'outra coisa' }).eq('id', pedido.id);
    expect((await personal.site.listarPedidos())[0]!.mensagem).toBe(
      'Quero saber sobre os horários.',
    );
  });

  it('os pedidos de um profissional não chegam a outro', async () => {
    // São nome, e-mail e telefone de gente que ainda nem é usuária do app.
    expect(await medico.site.listarPedidos()).toEqual([]);
  });

  it('nenhum endereço reservado vira página de ninguém', async () => {
    /*
      A lista vive em `@vivio/contracts` e é repetida no gatilho. Este laço é o
      que impede as duas de divergirem: acrescentar uma palavra lá e esquecer
      aqui quebra o teste, em vez de virar endereço de alguém.
    */
    for (const reservado of SLUGS_RESERVADOS) {
      const caiu = await capturar(
        personal.site.salvar({
          slug: reservado,
          titulo: 'Tentativa',
          atendeOnline: true,
          atendePresencial: false,
          publicado: false,
        }),
      );
      expect(caiu.codigo, reservado).toBe('CONFLITO');
    }
  });
});
