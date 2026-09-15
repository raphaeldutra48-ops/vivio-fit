import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroApi } from '../src/erro';
import { VivioClient } from '../src/client';

/**
 * Prescrição emitida e anamnese aplicada pelo SDK, sem API.
 *
 * As duas são registro clínico, e é isso que o arquivo persegue:
 *
 * - **O que ficou escrito não muda.** O nome do item é congelado na emissão;
 *   renomear o catálogo depois não pode reescrever a receita que a pessoa leu.
 *   Pergunta e tipo idem, na anamnese.
 * - **Corrigir conduta é versionar.** Substituir cria a versão seguinte e marca
 *   a anterior — e as duas metades acontecem juntas, porque a anterior marcada
 *   sem a sucessora é um paciente sem prescrição válida.
 * - **A competência de novo.** Terceira aparição, e a que mais importa: é a
 *   receita que vai para a mão da pessoa.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK sem API: prescrição e anamnese', () => {
  const marca = `prova-presc-${Date.now()}`;
  const emailAluno = `${marca}@teste.com`;

  let admin: SupabaseClient;
  let alunoId = '';
  let medicoId = '';
  let nutriId = '';
  let medicamentoId = '';
  let suplementoId = '';
  let prescricaoId = '';
  let modeloId = '';
  let perguntaObrigatoriaId = '';

  const cliente = (): VivioClient =>
    new VivioClient({
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const medico = cliente();
  const nutri = cliente();
  const aluno = cliente();

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });
    const agora = new Date().toISOString();
    const idDe = async (email: string): Promise<string> =>
      ((await admin.from('User').select('id').eq('email', email).single()).data as { id: string })
        .id;
    medicoId = await idDe('medico@viviofit.com.br');
    nutriId = await idDe('nutri@viviofit.com.br');

    const nova = await admin.auth.admin.createUser({
      email: emailAluno,
      password: 'Senha@123',
      email_confirm: true,
      user_metadata: { nome: 'Paciente da Prova', papel: 'ALUNO' },
    });
    if (nova.error) throw new Error(`conta: ${nova.error.message}`);
    alunoId = nova.data.user!.id;

    await admin.from('Vinculo').insert(
      [
        [medicoId, 'MEDICO'],
        [nutriId, 'NUTRICIONISTA'],
      ].map(([id, tipo], i) => ({
        id: `${marca}-v${i}`,
        alunoId,
        profissionalId: id,
        tipo,
        status: 'ATIVO',
        convidadoPorId: id,
        atualizadoEm: agora,
      })),
    );
    await admin.from('Consentimento').insert(
      [medicoId, nutriId].map((id, i) => ({
        id: `${marca}-c${i}`,
        alunoId,
        escopo: 'CLINICO',
        profissionalId: id,
        finalidade: 'Prova',
        versaoTermo: '1',
      })),
    );

    await admin.from('ItemPrescritivel').insert([
      {
        id: `${marca}-med`,
        nome: `Losartana ${marca}`,
        tipo: 'MEDICAMENTO',
        apresentacao: 'comprimido 50 mg',
        escopo: 'GLOBAL',
        atualizadoEm: agora,
      },
      {
        id: `${marca}-sup`,
        nome: `Creatina ${marca}`,
        tipo: 'SUPLEMENTO',
        escopo: 'GLOBAL',
        atualizadoEm: agora,
      },
    ]);
    medicamentoId = `${marca}-med`;
    suplementoId = `${marca}-sup`;

    await Promise.all([
      medico.auth.login({ email: 'medico@viviofit.com.br', senha: 'Senha@123' }),
      nutri.auth.login({ email: 'nutri@viviofit.com.br', senha: 'Senha@123' }),
      aluno.auth.login({ email: emailAluno, senha: 'Senha@123' }),
    ]);
  });

  afterAll(async () => {
    const presc =
      ((await admin.from('Prescricao').select('id').eq('alunoId', alunoId)).data as
        | { id: string }[]
        | null) ?? [];
    if (presc.length > 0) {
      await admin.from('ItemPrescricao').delete().in('prescricaoId', presc.map((p) => p.id));
      await admin.from('Prescricao').delete().eq('alunoId', alunoId);
    }
    await admin.from('Anamnese').delete().eq('alunoId', alunoId);
    await admin.from('PerguntaAnamnese').delete().eq('modeloId', modeloId);
    await admin.from('ModeloAnamnese').delete().ilike('nome', `%${marca}%`);
    await admin.from('ItemPrescritivel').delete().ilike('nome', `%${marca}%`);
    await admin.from('Consentimento').delete().eq('alunoId', alunoId);
    await admin.from('Vinculo').delete().eq('alunoId', alunoId);
    await admin.from('PerfilAluno').delete().eq('userId', alunoId);
    await admin.from('User').delete().eq('id', alunoId);
    await admin.auth.admin.deleteUser(alunoId);
  });

  it('o médico emite, e o nome do item fica congelado na receita', async () => {
    const p = await medico.prescricoes.emitir(alunoId, {
      data: new Date('2026-09-01'),
      validaAte: new Date('2026-12-01'),
      orientacoes: 'Tomar pela manhã.',
      itens: [
        {
          prescritivelId: medicamentoId,
          dose: 50,
          unidade: 'mg',
          frequencia: '1x ao dia',
          horarios: ['08:00'],
        },
      ],
    });
    prescricaoId = p.id;

    expect(p.versao).toBe(1);
    expect(p.status).toBe('ATIVA');
    expect(p.data).toBe('2026-09-01');
    expect(p.itens).toHaveLength(1);
    expect(p.itens[0]!.nome).toBe(`Losartana ${marca}`);
    expect(p.itens[0]!.dose).toBe(50);
    expect(p.itens[0]!.horarios).toEqual(['08:00']);
    expect(p.prescritor.id).toBe(medicoId);

    /*
      Renomear o catálogo não reescreve a receita já emitida: é o que a pessoa
      leu, e o prontuário tem de continuar dizendo isso.
    */
    await admin
      .from('ItemPrescritivel')
      .update({ nome: `Losartana potássica ${marca}` })
      .eq('id', medicamentoId);

    const depois = await medico.prescricoes.listar(alunoId);
    expect(depois[0]!.itens[0]!.nome).toBe(`Losartana ${marca}`);
  });

  it('o nome não vem do pedido: mandar outro não muda o que fica gravado', async () => {
    /*
      A função lê o nome do catálogo e ignora o que veio. Sem isso, o prescritor
      escreveria qualquer coisa no campo que o paciente lê como nome do
      medicamento.
    */
    const sessao = await medico.supabase.db.auth.getSession();
    const r = await fetch(`${url}/rest/v1/rpc/emitir_prescricao`, {
      method: 'POST',
      headers: {
        apikey: anon!,
        Authorization: `Bearer ${sessao.data.session!.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_aluno_id: alunoId,
        p_data: '2026-09-02',
        p_valida_ate: null,
        p_orientacoes: null,
        p_itens: [{ prescritivelId: suplementoId, nomeNoMomento: 'Nome inventado', horarios: [] }],
      }),
    });
    expect(r.ok).toBe(true);
    const id = (await r.json()) as string;

    const { data } = await admin
      .from('ItemPrescricao')
      .select('nomeNoMomento')
      .eq('prescricaoId', id)
      .single();
    expect((data as { nomeNoMomento: string }).nomeNoMomento).toBe(`Creatina ${marca}`);
  });

  it('o nutricionista não prescreve medicamento', async () => {
    const erro = await nutri.prescricoes
      .emitir(alunoId, {
        data: new Date('2026-09-03'),
        itens: [{ prescritivelId: medicamentoId, horarios: [] }],
      })
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);

    expect(erro?.status).toBe(403);
    expect(erro?.message).toContain('conselho');

    // E o suplemento, que é da área dele, passa.
    const ok = await nutri.prescricoes.emitir(alunoId, {
      data: new Date('2026-09-03'),
      itens: [{ prescritivelId: suplementoId, dose: 5, unidade: 'g', horarios: [] }],
    });
    expect(ok.itens[0]!.nome).toBe(`Creatina ${marca}`);
  });

  it('substituir versiona: a anterior fica marcada e a linhagem se mantém', async () => {
    const v2 = await medico.prescricoes.substituir(alunoId, prescricaoId, {
      data: new Date('2026-09-05'),
      orientacoes: 'Dose ajustada.',
      itens: [
        { prescritivelId: medicamentoId, dose: 25, unidade: 'mg', frequencia: '1x ao dia', horarios: [] },
      ],
    });

    expect(v2.versao).toBe(2);
    expect(v2.itens[0]!.dose).toBe(25);

    const lista = await medico.prescricoes.listar(alunoId);
    const anterior = lista.find((p) => p.id === prescricaoId)!;
    expect(anterior.status).toBe('SUBSTITUIDA');
    // A anterior continua legível: era o que valia quando o paciente tomou.
    expect(anterior.itens[0]!.dose).toBe(50);

    // A raiz é sempre a PRIMEIRA da linhagem, para o histórico não se partir.
    const { data } = await admin.from('Prescricao').select('raizId').eq('id', v2.id).single();
    expect((data as { raizId: string }).raizId).toBe(prescricaoId);
  });

  it('quem não emitiu não substitui nem muda status', async () => {
    const lista = await nutri.prescricoes.listar(alunoId);
    const doMedico = lista.find((p) => p.prescritor.id === medicoId && p.status === 'ATIVA')!;

    const erro = await nutri.prescricoes
      .mudarStatus(alunoId, doMedico.id, { status: 'ENCERRADA', motivo: 'porque sim' })
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);
    // A assinatura de uma receita não se transfere.
    expect(erro?.status).toBe(403);
    expect(erro?.message).toContain('Só quem emitiu');
  });

  it('prescrição já substituída não muda de status', async () => {
    const erro = await medico.prescricoes
      .mudarStatus(alunoId, prescricaoId, { status: 'SUSPENSA' })
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);
    expect(erro?.message).toContain('já substituída');
  });

  it('encerrar guarda a hora e o motivo', async () => {
    const lista = await medico.prescricoes.listar(alunoId);
    const ativa = lista.find((p) => p.prescritor.id === medicoId && p.status === 'ATIVA')!;

    const encerrada = await medico.prescricoes.mudarStatus(alunoId, ativa.id, {
      status: 'ENCERRADA',
      motivo: 'Pressão controlada.',
    });
    expect(encerrada.status).toBe('ENCERRADA');
    expect(encerrada.motivoEncerramento).toBe('Pressão controlada.');
  });

  it('o paciente lê as próprias prescrições', async () => {
    const dele = await aluno.prescricoes.listar(alunoId);
    expect(dele.length).toBeGreaterThan(0);
    expect(dele.every((p) => p.itens.length > 0)).toBe(true);
  });

  // --- anamnese -------------------------------------------------------------

  it('aplicar congela a pergunta, e a pergunta não respondida fica em branco', async () => {
    const modelo = await medico.modelosAnamnese.criar({
      nome: `Triagem clínica ${marca}`,
      perguntas: [
        { texto: `Usa medicação contínua ${marca}`, tipo: 'SIM_NAO', opcoes: [], obrigatoria: true },
        { texto: `Alguma cirurgia ${marca}`, tipo: 'TEXTO_LONGO', opcoes: [], obrigatoria: false },
      ],
    });
    modeloId = modelo.id;
    perguntaObrigatoriaId = modelo.perguntas[0]!.id;

    const a = await medico.anamneses.aplicar(alunoId, {
      modeloId,
      respondidaEm: new Date('2026-09-06T14:00:00.000Z'),
      respostas: [{ perguntaId: perguntaObrigatoriaId, valor: 'sim', valores: [] }],
    });

    expect(a.nome).toBe(`Triagem clínica ${marca}`);
    expect(a.respostas).toHaveLength(2);
    expect(a.respostas[0]!.pergunta).toBe(`Usa medicação contínua ${marca}`);
    expect(a.respostas[0]!.valor).toBe('sim');
    /*
      A pergunta não respondida também fica registrada, em branco: é a diferença
      entre "não perguntamos" e "perguntamos e a pessoa não quis responder", e a
      segunda é informação clínica.
    */
    expect(a.respostas[1]!.pergunta).toBe(`Alguma cirurgia ${marca}`);
    expect(a.respostas[1]!.valor).toBeNull();

    // Editar o modelo depois não reescreve o que a pessoa respondeu.
    await medico.modelosAnamnese.atualizar(modeloId, {
      nome: `Triagem clínica ${marca}`,
      perguntas: [{ texto: `Outra pergunta ${marca}`, tipo: 'TEXTO', opcoes: [], obrigatoria: false }],
    });
    const depois = await medico.anamneses.listar(alunoId);
    expect(depois[0]!.respostas[0]!.pergunta).toBe(`Usa medicação contínua ${marca}`);
  });

  it('obrigatória sem resposta é recusada, e a frase diz qual', async () => {
    const novo = await medico.modelosAnamnese.criar({
      nome: `Com obrigatória ${marca}`,
      perguntas: [
        { texto: `Tem alergia ${marca}`, tipo: 'TEXTO', opcoes: [], obrigatoria: true },
        { texto: `Qual ${marca}`, tipo: 'TEXTO', opcoes: [], obrigatoria: true },
      ],
    });

    const erro = await medico.anamneses
      .aplicar(alunoId, { modeloId: novo.id, respondidaEm: new Date(), respostas: [] })
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);

    expect(erro?.status).toBe(422);
    // TODAS as que faltam, numa frase só: uma de cada vez faria a pessoa
    // corrigir, salvar, e descobrir a próxima.
    expect(erro?.message).toContain(`Tem alergia ${marca}`);
    expect(erro?.message).toContain(`Qual ${marca}`);

    await admin.from('PerguntaAnamnese').delete().eq('modeloId', novo.id);
    await admin.from('ModeloAnamnese').delete().eq('id', novo.id);
  });

  it('só quem aplicou remove a anamnese', async () => {
    const [a] = await medico.anamneses.listar(alunoId);

    const erro = await nutri.anamneses
      .remover(alunoId, a!.id)
      .then(() => null)
      .catch((e: unknown) => e as ErroApi);
    expect(erro?.status).toBe(404);

    await medico.anamneses.remover(alunoId, a!.id);
    expect((await medico.anamneses.listar(alunoId)).map((x) => x.id)).not.toContain(a!.id);

    // As respostas vão junto: fora da anamnese elas não querem dizer nada.
    const { count } = await admin
      .from('RespostaAnamnese')
      .select('id', { count: 'exact', head: true })
      .eq('anamneseId', a!.id);
    expect(count).toBe(0);
  });
});
