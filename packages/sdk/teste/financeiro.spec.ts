import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroApi } from '../src/erro';
import { VivioClient } from '../src/client';

/**
 * Financeiro pelo SDK, sem API.
 *
 * Este grupo tem uma linha que os outros não têm. Em quase todo o resto o
 * titular do dado escreve junto de quem o acompanha — o aluno registra o
 * próprio treino, a própria medida, o próprio copo de água. Aqui não: a
 * cobrança é do PROFISSIONAL, e o aluno só lê a dele.
 *
 * O erro possível também é de outro tipo. Com uma política frouxa, o aluno
 * marcaria a própria mensalidade como paga, e o profissional só descobriria
 * conferindo o extrato.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK sem API: financeiro', () => {
  const marca = `prova-fin-${Date.now()}`;
  const emailDoAluno = `${marca}@teste.com`;
  const semVinculoId = `${marca}-sem-vinculo`;
  /** Um mês bem no futuro: as cobranças da prova não se misturam com nada. */
  const MES = '2027-05';

  let admin: SupabaseClient;
  let alunoId = '';
  let personalId = '';
  /** As parcelas criadas no primeiro teste. */
  let parcelas: string[] = [];
  let chaveOriginal: Record<string, unknown> | null = null;

  const cliente = (): VivioClient =>
    new VivioClient({
      baseUrl: 'http://127.0.0.1:1',
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const personal = cliente();
  const aluno = cliente();

  const capturar = async (promessa: Promise<unknown>): Promise<ErroApi> => {
    const caiu = await promessa.then(() => null).catch((e: unknown) => e);
    if (!(caiu instanceof ErroApi)) throw new Error(`esperava recusa, veio ${JSON.stringify(caiu)}`);
    return caiu;
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

    // A chave PIX é do profissional, não do teste: guardo para devolver.
    chaveOriginal =
      ((await admin.from('DadosDePagamento').select('*').eq('profissionalId', personalId))
        .data as Record<string, unknown>[] | null)?.[0] ?? null;

    const criada = await admin.auth.admin.createUser({
      email: emailDoAluno,
      password: 'Senha@123',
      email_confirm: true,
      user_metadata: { nome: 'Aluna do Financeiro', papel: 'ALUNO' },
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
      'aluno sem vinculo',
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
    ]);
  });

  afterAll(async () => {
    await admin.from('Cobranca').delete().in('alunoId', [alunoId, semVinculoId]);
    await admin.from('Vinculo').delete().eq('alunoId', alunoId);
    await admin.from('PerfilAluno').delete().eq('userId', alunoId);
    await admin.from('User').delete().in('id', [alunoId, semVinculoId]);
    if (alunoId) await admin.auth.admin.deleteUser(alunoId);

    await admin.from('DadosDePagamento').delete().eq('profissionalId', personalId);
    if (chaveOriginal) await admin.from('DadosDePagamento').insert(chaveOriginal);
  });

  it('a mensalidade nasce com o ano inteiro, e fevereiro não escapa', async () => {
    /*
      As parcelas nascem juntas em vez de saírem de um job mensal: o
      profissional vê o ano de uma vez, e não existe mês que "não gerou"
      porque o agendador falhou.

      Dia 31 é o caso que quebra sozinho: o `Date` do JS levaria 31 de janeiro
      para 3 de março, e a parcela de fevereiro apareceria em março.
    */
    const criadas = await personal.financeiro.criar({
      alunoId,
      descricao: 'Mensalidade da prova',
      valorCentavos: 19_900,
      vencimento: new Date('2026-01-31T00:00:00.000Z'),
      repetirMeses: 3,
    });
    parcelas = criadas.map((c) => c.id);

    expect(criadas).toHaveLength(3);
    expect(criadas.map((c) => c.vencimento)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
    expect(criadas[0]!.situacao).toBe('ATRASADA');
    expect(criadas[0]!.aluno.nome).toBe('Aluna do Financeiro');
  });

  it('cobrar quem não é seu aluno é cobrar um estranho', async () => {
    await expect(
      personal.financeiro.criar({
        alunoId: semVinculoId,
        descricao: 'Não devia',
        valorCentavos: 1000,
        vencimento: new Date(`${MES}-10T00:00:00.000Z`),
        repetirMeses: 1,
      }),
    ).rejects.toMatchObject({ codigo: 'ACESSO_NEGADO' });
  });

  it('o aluno lê a cobrança dele e não dá baixa nela', async () => {
    /*
      A prova que sustenta o grupo. `update` recusado por política afeta ZERO
      linhas e responde 200 — sem alguém conferindo o que mudou, o aluno veria
      "pago" e o profissional continuaria esperando o dinheiro.
    */
    const bruto = createClient(url!, anon!, { auth: { persistSession: false } });
    await bruto.auth.signInWithPassword({ email: emailDoAluno, password: 'Senha@123' });

    const lidas = await bruto.from('Cobranca').select('id,valorCentavos').eq('alunoId', alunoId);
    expect((lidas.data ?? []).length).toBe(3);

    const deuBaixa = await bruto
      .from('Cobranca')
      .update({ status: 'PAGA', pagaEm: new Date().toISOString() })
      .eq('id', parcelas[0]!)
      .select('id');
    expect(deuBaixa.data ?? []).toEqual([]);

    const noBanco = await admin.from('Cobranca').select('status').eq('id', parcelas[0]!).single();
    expect((noBanco.data as { status: string }).status).toBe('PENDENTE');
  });

  it('dar baixa e estornar, sem deixar rastro de meia-verdade', async () => {
    const paga = await personal.financeiro.registrarPagamento(parcelas[0]!, {
      pagaEm: new Date('2026-02-05T00:00:00.000Z'),
      formaPagamento: 'PIX',
    });
    expect(paga.situacao).toBe('PAGA');
    expect(paga.pagaEm).toBe('2026-02-05');
    expect(paga.formaPagamento).toBe('PIX');
    expect(paga.diasDeAtraso).toBeNull();

    // Pagar duas vezes é erro de dedo, e a resposta diz isso.
    const caiu = await capturar(
      personal.financeiro.registrarPagamento(parcelas[0]!, {
        pagaEm: new Date('2026-02-06T00:00:00.000Z'),
        formaPagamento: 'DINHEIRO',
      }),
    );
    expect(caiu.message).toBe('Esta cobrança já está paga.');

    /*
      Estornar limpa a baixa junto. Uma cobrança pendente que ainda diz
      "recebido em 05/02, no PIX" é pior que uma sem informação nenhuma — ela
      mente com aparência de registro.
    */
    const estornada = await personal.financeiro.estornar(parcelas[0]!);
    expect(estornada.situacao).toBe('ATRASADA');
    expect(estornada.pagaEm).toBeNull();
    expect(estornada.formaPagamento).toBeNull();
  });

  it('cobrança paga não se cancela: estorna-se antes', async () => {
    await personal.financeiro.registrarPagamento(parcelas[0]!, {
      pagaEm: new Date('2026-02-05T00:00:00.000Z'),
      formaPagamento: 'PIX',
    });

    // Cancelar por cima perderia o registro de que o dinheiro entrou.
    const caiu = await capturar(personal.financeiro.cancelar(parcelas[0]!));
    expect(caiu.message).toBe('Cobrança paga não pode ser cancelada. Estorne antes.');
  });

  it('o que foi cobrado e quitado não se reescreve', async () => {
    const bruto = createClient(url!, anon!, { auth: { persistSession: false } });
    await bruto.auth.signInWithPassword({
      email: 'personal@viviofit.com.br',
      password: 'Senha@123',
    });
    // Mudar o valor de uma cobrança paga é reescrever um recibo.
    await bruto
      .from('Cobranca')
      .update({ valorCentavos: 1, descricao: 'Outra coisa' })
      .eq('id', parcelas[0]!);

    const guardada = await admin
      .from('Cobranca')
      .select('valorCentavos,descricao')
      .eq('id', parcelas[0]!)
      .single();
    expect(guardada.data).toMatchObject({
      valorCentavos: 19_900,
      descricao: 'Mensalidade da prova',
    });
  });

  it('o painel do mês soma o mês inteiro, mesmo filtrando a lista', async () => {
    /*
      Filtrar por "atrasada" não pode zerar o que já foi recebido: o
      profissional olharia a tela e concluiria que não entrou nada no mês.
    */
    const so = await personal.financeiro.resumo({ mes: '2026-01', situacao: 'ATRASADA' });
    expect(so.recebidoCentavos).toBe(19_900);
    expect(so.cobrancas).toEqual([]);

    const tudo = await personal.financeiro.resumo({ mes: '2026-01' });
    expect(tudo.cobrancas).toHaveLength(1);
    expect(tudo.cobrancas[0]!.situacao).toBe('PAGA');
    expect(tudo.atrasadoCentavos).toBe(0);
  });

  it('atrasada é derivada do vencimento, com os dias contados', async () => {
    // ATRASADA não existe como coluna: fosse gravada, precisaria de um job
    // diário — e todo dia em que ele falhasse a cobrança apareceria em dia.
    const fevereiro = await personal.financeiro.resumo({ mes: '2026-02' });
    const parcela = fevereiro.cobrancas[0]!;
    expect(parcela.situacao).toBe('ATRASADA');
    expect(parcela.diasDeAtraso).toBeGreaterThan(0);
    expect(fevereiro.alunosEmAtraso).toBe(1);
  });

  it('apagar a série deixa para trás o que já foi pago', async () => {
    const { removidas } = await personal.financeiro.remover(parcelas[1]!);
    // Três parcelas, uma paga: saem duas.
    expect(removidas).toBe(2);

    const sobrou = await admin.from('Cobranca').select('id,status').eq('alunoId', alunoId);
    expect(sobrou.data).toHaveLength(1);
    expect((sobrou.data as { status: string }[])[0]!.status).toBe('PAGA');
  });

  it('sem chave cadastrada, o código não sai — e a mensagem diz o que fazer', async () => {
    await admin.from('DadosDePagamento').delete().eq('profissionalId', personalId);
    const nova = (
      await personal.financeiro.criar({
        alunoId,
        descricao: 'Para o PIX',
        valorCentavos: 5_000,
        vencimento: new Date(`${MES}-10T00:00:00.000Z`),
        repetirMeses: 1,
      })
    )[0]!;

    const caiu = await capturar(personal.financeiro.gerarPix(nova.id));
    expect(caiu.message).toBe('Cadastre sua chave PIX em Receba Fácil antes de gerar o código.');

    await personal.financeiro.salvarPagamento({
      tipoChave: 'EMAIL',
      chave: '  PERSONAL@VIVIOFIT.COM.BR ',
      recebedor: 'Personal da Prova',
      cidade: 'Sao Paulo',
    });

    const guardada = await personal.financeiro.obterPagamento();
    // Guardada já normalizada: o código é montado a partir daqui, e formatar
    // na hora de gerar espalharia a regra por dois lugares.
    expect(guardada?.chave).toBe('personal@viviofit.com.br');

    const pix = await personal.financeiro.gerarPix(nova.id);
    expect(pix.valorCentavos).toBe(5_000);
    expect(pix.aluno).toBe('Aluna do Financeiro');
    // O identificador leva o id curto da cobrança: é a única conciliação
    // possível sem gateway.
    expect(pix.brCode).toContain(nova.id.slice(-10).toUpperCase());
  });

  it('chave PIX inválida não chega ao banco', async () => {
    const caiu = await capturar(
      personal.financeiro.salvarPagamento({
        tipoChave: 'CPF',
        chave: '123',
        recebedor: 'Personal da Prova',
        cidade: 'Sao Paulo',
      }),
    );
    expect(caiu.codigo).toBe('CONFLITO');

    // E a que estava lá continua inteira.
    expect((await personal.financeiro.obterPagamento())?.chave).toBe('personal@viviofit.com.br');
  });
});
