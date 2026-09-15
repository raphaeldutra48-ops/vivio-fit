import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroApi } from '../src/erro';
import { VivioClient } from '../src/client';

/**
 * Agenda pelo SDK, sem API.
 *
 * A regra mais fina daqui não é de linha, é de TRANSIÇÃO: o aluno confirma
 * presença e cancela, e só. Marcar como realizado ou como falta é registro do
 * atendimento, e quem faz é quem atendeu — deixar o aluno fazer isso encheria
 * a lista do profissional de atendimentos que ele não deu.
 *
 * A sobreposição de horário já era do banco (uma restrição `EXCLUDE`), e
 * continua sendo. O que este arquivo confere é que ela chega à tela como
 * frase, e não como o nome da restrição.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

/** Uma segunda-feira bem longe, para não esbarrar em nada que já exista. */
const SEGUNDA = '2027-03-15';

describe.skipIf(!url || !anon || !servico)('SDK sem API: agenda', () => {
  const marca = `prova-agenda-${Date.now()}`;
  const emailDoAluno = `${marca}@teste.com`;
  const pendenteId = `${marca}-pendente`;

  let admin: SupabaseClient;
  let alunoId = '';
  let personalId = '';
  let compromissoId = '';
  /** As janelas que o profissional já tinha, para devolver no fim. */
  let janelasOriginais: Record<string, unknown>[] = [];

  const cliente = (): VivioClient =>
    new VivioClient({
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const personal = cliente();
  const aluno = cliente();
  const medico = cliente();

  /** O erro que a chamada lançou — ou uma falha clara se ela não lançou. */
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

    /*
      A disponibilidade é do profissional, não do teste: `definirDisponibilidade`
      substitui a semana inteira. Guardo a que existe para devolver no fim —
      apagar a agenda do personal semeado quebraria os testes seguintes.
    */
    janelasOriginais =
      ((await admin.from('DisponibilidadeSlot').select('*').eq('profissionalId', personalId))
        .data as Record<string, unknown>[] | null) ?? [];

    const criada = await admin.auth.admin.createUser({
      email: emailDoAluno,
      password: 'Senha@123',
      email_confirm: true,
      user_metadata: { nome: 'Aluna da Agenda', papel: 'ALUNO' },
    });
    if (criada.error) throw new Error(`conta: ${criada.error.message}`);
    alunoId = criada.data.user!.id;

    // Um segundo aluno, com o convite ainda PENDENTE.
    erro(
      await admin.from('User').insert({
        id: pendenteId,
        email: `${pendenteId}@teste.com`,
        nome: 'Convite pendente',
        papel: 'ALUNO',
        status: 'ATIVA',
        atualizadoEm: agora,
      }),
      'aluno pendente',
    );
    erro(
      await admin.from('Vinculo').insert([
        {
          id: `${marca}-v0`,
          alunoId,
          profissionalId: personalId,
          tipo: 'PERSONAL',
          status: 'ATIVO',
          convidadoPorId: personalId,
          atualizadoEm: agora,
        },
        {
          id: `${marca}-v1`,
          alunoId: pendenteId,
          profissionalId: personalId,
          tipo: 'PERSONAL',
          status: 'PENDENTE',
          convidadoPorId: personalId,
          atualizadoEm: agora,
        },
      ]),
      'vinculos',
    );

    await Promise.all([
      personal.auth.login({ email: 'personal@viviofit.com.br', senha: 'Senha@123' }),
      aluno.auth.login({ email: emailDoAluno, senha: 'Senha@123' }),
      medico.auth.login({ email: 'medico@viviofit.com.br', senha: 'Senha@123' }),
    ]);
  });

  afterAll(async () => {
    await admin.from('Compromisso').delete().in('alunoId', [alunoId, pendenteId]);
    await admin.from('BloqueioAgenda').delete().eq('profissionalId', personalId).ilike('motivo', 'Prova%');
    await admin.from('Vinculo').delete().in('alunoId', [alunoId, pendenteId]);
    await admin.from('PerfilAluno').delete().eq('userId', alunoId);
    await admin.from('User').delete().in('id', [alunoId, pendenteId]);
    if (alunoId) await admin.auth.admin.deleteUser(alunoId);

    // Devolve a agenda do profissional como ela estava.
    await admin.from('DisponibilidadeSlot').delete().eq('profissionalId', personalId);
    if (janelasOriginais.length > 0) {
      await admin.from('DisponibilidadeSlot').insert(janelasOriginais);
    }
  });

  it('marcar deriva o fim pelo tipo, e o compromisso nasce AGENDADO', async () => {
    const c = await personal.agenda.marcar({
      alunoId,
      tipo: 'CONSULTA',
      titulo: 'Primeira consulta',
      inicioEm: new Date(`${SEGUNDA}T09:00:00.000Z`),
      local: 'Sala 2',
    });
    compromissoId = c.id;

    // CONSULTA dura 50 minutos por padrão — o profissional não digita isso.
    expect(c.duracaoMin).toBe(50);
    expect(c.fimEm).toBe(`${SEGUNDA}T09:50:00.000Z`);
    expect(c.status).toBe('AGENDADO');
    expect(c.aluno.nome).toBe('Aluna da Agenda');
    expect(c.profissional.papel).toBe('PERSONAL');
  });

  it('dois atendimentos no mesmo horário não passam, e a recusa é uma frase', async () => {
    /*
      Quem barra é a restrição `EXCLUDE` do banco. A mensagem crua cita o nome
      dela — "compromisso_sem_sobreposicao" —, e é isso que o profissional
      leria se ninguém traduzisse.
    */
    const caiu = await capturar(
      personal.agenda.marcar({
        alunoId,
        tipo: 'RETORNO',
        inicioEm: new Date(`${SEGUNDA}T09:30:00.000Z`),
        fimEm: new Date(`${SEGUNDA}T10:30:00.000Z`),
      }),
    );

    expect(caiu.codigo).toBe('CONFLITO');
    expect(caiu.message).toBe('Você já tem um compromisso neste horário.');
  });

  it('quem é parte vê o compromisso; quem não é, não', async () => {
    const doAluno = await aluno.agenda.meus(`${SEGUNDA}T00:00:00.000Z`, `${SEGUNDA}T23:59:59.999Z`);
    expect(doAluno.map((c) => c.id)).toContain(compromissoId);

    const doProfissional = await personal.agenda.listar({
      de: `${SEGUNDA}T00:00:00.000Z`,
      ate: `${SEGUNDA}T23:59:59.999Z`,
      incluirCancelados: false,
    });
    expect(doProfissional.map((c) => c.id)).toContain(compromissoId);

    // O médico não é parte deste compromisso: para ele ele não existe.
    expect(
      await medico.agenda.listar({
        de: `${SEGUNDA}T00:00:00.000Z`,
        ate: `${SEGUNDA}T23:59:59.999Z`,
        incluirCancelados: true,
      }),
    ).toEqual([]);
  });

  it('o aluno confirma presença', async () => {
    const c = await aluno.agenda.mudarStatus(compromissoId, { status: 'CONFIRMADO' });
    expect(c.status).toBe('CONFIRMADO');
  });

  it('o aluno não registra o atendimento que ele recebeu', async () => {
    /*
      Marcar REALIZADO ou NAO_COMPARECEU é registro do atendimento. Deixar o
      aluno fazer encheria a lista do profissional de consultas que ele não
      deu — e ele descobriria depois, sem saber de onde vieram.
    */
    await expect(
      aluno.agenda.mudarStatus(compromissoId, { status: 'REALIZADO' }),
    ).rejects.toMatchObject({ codigo: 'ACESSO_NEGADO' });

    const intacto = (
      await personal.agenda.listar({
        de: `${SEGUNDA}T00:00:00.000Z`,
        ate: `${SEGUNDA}T23:59:59.999Z`,
        incluirCancelados: false,
      })
    ).find((c) => c.id === compromissoId)!;
    expect(intacto.status).toBe('CONFIRMADO');
  });

  it('o aluno também não muda o horário por baixo', async () => {
    // O que ele pode é confirmar e cancelar; remarcar é conversa, não clique.
    const bruto = createClient(url!, anon!, { auth: { persistSession: false } });
    await bruto.auth.signInWithPassword({ email: emailDoAluno, password: 'Senha@123' });
    /*
      Move o par inteiro — início E fim. Mexer só no início cairia antes, no
      "o fim precisa ser depois do início", e o teste passaria sem nunca
      encostar na regra que ele diz provar.
    */
    const tentou = await bruto
      .from('Compromisso')
      .update({
        inicioEm: `${SEGUNDA}T15:00:00.000`,
        fimEm: `${SEGUNDA}T15:50:00.000`,
        local: 'Onde eu quiser',
      })
      .eq('id', compromissoId)
      .select('id');
    // A linha É alcançável por ele: o que o gatilho faz é devolver os campos.
    expect(tentou.error).toBeNull();
    expect(tentou.data).toHaveLength(1);

    const c = (
      await personal.agenda.listar({
        de: `${SEGUNDA}T00:00:00.000Z`,
        ate: `${SEGUNDA}T23:59:59.999Z`,
        incluirCancelados: false,
      })
    ).find((x) => x.id === compromissoId)!;
    expect(c.inicioEm).toBe(`${SEGUNDA}T09:00:00.000Z`);
    expect(c.local).toBe('Sala 2');
  });

  it('remarcar zera a confirmação: o horário novo precisa ser confirmado de novo', async () => {
    const c = await personal.agenda.remarcar(compromissoId, {
      inicioEm: new Date(`${SEGUNDA}T14:00:00.000Z`),
      fimEm: new Date(`${SEGUNDA}T14:50:00.000Z`),
      local: 'Sala 3',
    });
    expect(c.inicioEm).toBe(`${SEGUNDA}T14:00:00.000Z`);
    // Confirmação herdada seria confirmação de outra coisa.
    expect(c.status).toBe('AGENDADO');
  });

  it('compromisso realizado não se remarca', async () => {
    await personal.agenda.mudarStatus(compromissoId, { status: 'REALIZADO' });

    const caiu = await capturar(
      personal.agenda.remarcar(compromissoId, {
        inicioEm: new Date(`${SEGUNDA}T16:00:00.000Z`),
        fimEm: new Date(`${SEGUNDA}T16:50:00.000Z`),
      }),
    );

    // Ele é o registro de um atendimento que aconteceu naquela hora.
    expect(caiu.codigo).toBe('CONFLITO');
    expect(caiu.message).toBe('Compromisso já realizado não pode ser remarcado.');
  });

  it('convite pendente não é relação de atendimento', async () => {
    // Marcar consulta com quem ainda não aceitou é agendar na agenda de alguém
    // que não te conhece.
    await expect(
      personal.agenda.marcar({
        alunoId: pendenteId,
        tipo: 'CONSULTA',
        inicioEm: new Date(`${SEGUNDA}T18:00:00.000Z`),
      }),
    ).rejects.toMatchObject({ codigo: 'ACESSO_NEGADO' });
  });

  it('as vagas do dia descontam compromisso vivo e bloqueio', async () => {
    await personal.agenda.definirDisponibilidade({
      janelas: [{ diaSemana: 1, horaInicio: '08:00', horaFim: '12:00', duracaoMin: 60 }],
    });
    expect(await personal.agenda.listarDisponibilidade()).toHaveLength(1);

    // Um atendimento vivo às 10h e um bloqueio das 11h às 12h.
    const vivo = await personal.agenda.marcar({
      alunoId,
      tipo: 'RETORNO',
      inicioEm: new Date(`${SEGUNDA}T10:00:00.000Z`),
      fimEm: new Date(`${SEGUNDA}T10:30:00.000Z`),
    });
    await personal.agenda.bloquear({
      inicioEm: new Date(`${SEGUNDA}T11:00:00.000Z`),
      fimEm: new Date(`${SEGUNDA}T12:00:00.000Z`),
      motivo: 'Prova de bloqueio',
    });

    const livres = await personal.agenda.horariosLivres(SEGUNDA);
    expect(livres.map((h) => h.inicioEm)).toEqual([
      `${SEGUNDA}T08:00:00.000Z`,
      `${SEGUNDA}T09:00:00.000Z`,
    ]);

    /*
      Cancelar libera a vaga: é a mesma regra da restrição do banco, que só
      considera compromisso vivo. Sem isso, desmarcar deixaria o horário morto
      para sempre.
    */
    await personal.agenda.mudarStatus(vivo.id, { status: 'CANCELADO', motivo: 'Prova' });
    const depois = await personal.agenda.horariosLivres(SEGUNDA);
    expect(depois.map((h) => h.inicioEm)).toContain(`${SEGUNDA}T10:00:00.000Z`);
  });

  it('a duração pedida vence a da janela', async () => {
    // Uma janela de 60 minutos com atendimentos de 30 cabe o dobro de gente.
    const livres = await personal.agenda.horariosLivres(SEGUNDA, 30);
    expect(livres.map((h) => h.inicioEm)).toContain(`${SEGUNDA}T08:30:00.000Z`);
  });
});
