import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroApi } from '../src/erro';
import { VivioClient } from '../src/client';

/**
 * Alerta clínico e condição de saúde, pelo SDK, sem API no caminho.
 *
 * O cenário é o cruzamento que justifica o app ter médico dentro: o médico
 * registra uma condição, o gatilho deriva a orientação, e cada papel recebe a
 * SUA — o personal a que fala de movimento, a nutricionista a que fala de
 * plano alimentar.
 *
 * `baseUrl` aponta para lugar nenhum: se algum destes métodos ainda tocasse a
 * API, morreria em conexão recusada em vez de passar despercebido.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK sem API: alerta e condição', () => {
  const marca = `prova-alerta-${Date.now()}`;
  const alunoId = `${marca}-aluno`;
  let admin: SupabaseClient;
  let condicaoId = '';

  const cliente = (): VivioClient =>
    new VivioClient({
      baseUrl: 'http://127.0.0.1:1',
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const personal = cliente();
  const nutri = cliente();
  const medico = cliente();

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });

    const idDe = async (email: string): Promise<string> => {
      const r = await admin.from('User').select('id').eq('email', email).single();
      return (r.data as { id: string }).id;
    };
    const [pId, nId, mId] = await Promise.all(
      ['personal@viviofit.com.br', 'nutri@viviofit.com.br', 'medico@viviofit.com.br'].map(idDe),
    );

    await admin.from('User').insert({
      id: alunoId,
      email: `${marca}@teste.com`,
      nome: 'Aluno de Alerta',
      papel: 'ALUNO',
      status: 'ATIVA',
      atualizadoEm: new Date().toISOString(),
    });
    await admin.from('Vinculo').insert(
      [
        ['PERSONAL', pId],
        ['NUTRICIONISTA', nId],
        ['MEDICO', mId],
      ].map(([tipo, id], i) => ({
        id: `${marca}-v${i}`,
        alunoId,
        profissionalId: id,
        tipo,
        status: 'ATIVO',
        convidadoPorId: id,
        atualizadoEm: new Date().toISOString(),
      })),
    );
    await admin.from('Consentimento').insert({
      id: `${marca}-c`,
      alunoId,
      escopo: 'CLINICO',
      finalidade: 'Prova',
      versaoTermo: '1',
    });

    await Promise.all([
      personal.auth.login({ email: 'personal@viviofit.com.br', senha: 'Senha@123' }),
      nutri.auth.login({ email: 'nutri@viviofit.com.br', senha: 'Senha@123' }),
      medico.auth.login({ email: 'medico@viviofit.com.br', senha: 'Senha@123' }),
    ]);
  });

  afterAll(async () => {
    await admin.from('AlertaClinico').delete().eq('alunoId', alunoId);
    await admin.from('CondicaoSaude').delete().eq('alunoId', alunoId);
    await admin.from('Consentimento').delete().eq('alunoId', alunoId);
    await admin.from('Vinculo').delete().eq('alunoId', alunoId);
    await admin.from('User').delete().eq('id', alunoId);
  });

  it('só o médico registra condição de saúde', async () => {
    // Paciente não se diagnostica, e personal não diagnostica ninguém: quem
    // barra é a política, não o cliente.
    await expect(
      personal.condicoes.registrar(alunoId, {
        tipo: 'ALERGIA_ALIMENTAR',
        descricao: 'Não devia entrar',
        gravidade: 'LEVE',
      }),
    ).rejects.toBeInstanceOf(ErroApi);

    const c = await medico.condicoes.registrar(alunoId, {
      tipo: 'ALERGIA_ALIMENTAR',
      descricao: 'Alergia a amendoim',
      gravidade: 'MODERADA',
    });
    condicaoId = c.id;
    expect(c.tipo).toBe('ALERGIA_ALIMENTAR');
    expect(c.registradoPor.nome).toBeTruthy();
    expect(c.resolvidaEm).toBeNull();
  });

  it('o personal LÊ a condição, mesmo sem poder escrevê-la', async () => {
    // É a separação que justifica o app ter médico dentro: ele precisa saber
    // da alergia para não indicar suplemento errado.
    const lista = await personal.condicoes.listar(alunoId);
    expect(lista.some((c) => c.id === condicaoId)).toBe(true);
  });

  it('cada papel recebe a orientação endereçada a ele', async () => {
    const doPersonal = await personal.alertas.listar(alunoId);
    const daNutri = await nutri.alertas.listar(alunoId);

    expect(doPersonal.length).toBeGreaterThan(0);
    expect(daNutri.length).toBeGreaterThan(0);
    // A descrição que o médico escreveu entra no texto de cada um.
    expect(doPersonal[0]!.orientacao).toContain('amendoim');
    // E os textos são diferentes: um fala de suplemento, o outro de plano.
    expect(doPersonal[0]!.titulo).not.toBe(daNutri[0]!.titulo);
    // Ninguém recebe o aviso do outro.
    expect(doPersonal.every((a) => a.papelDestino === 'PERSONAL')).toBe(true);
    expect(daNutri.every((a) => a.papelDestino === 'NUTRICIONISTA')).toBe(true);
  });

  it('reconhecer carimba quem reconheceu, e é o banco que decide quem foi', async () => {
    const [alerta] = await personal.alertas.listar(alunoId);
    const depois = await personal.alertas.reconhecer(alunoId, alerta!.id, {
      anotacao: 'Conversado com o aluno',
    });
    expect(depois.reconhecidoEm).not.toBeNull();
    expect(depois.reconhecidoPor?.nome).toBeTruthy();
  });

  it('reconhecer NÃO é licença para reescrever a orientação clínica', async () => {
    /*
      O alerta é a conduta que outro profissional vai seguir. Se `orientacao`
      pudesse ser editada por quem a recebe, o registro deixaria de ser o que a
      regra disse e passaria a ser o que o leitor preferiu ler.

      Vai pelo `supabase` cru de propósito: o SDK não oferece esse caminho, e o
      que se quer provar é que o BANCO recusa mesmo quando alguém tenta por
      fora dele.
    */
    const bruto = createClient(url!, anon!, { auth: { persistSession: false } });
    await bruto.auth.signInWithPassword({
      email: 'personal@viviofit.com.br',
      password: 'Senha@123',
    });
    const [alerta] = await personal.alertas.listar(alunoId);

    const r = await bruto
      .from('AlertaClinico')
      .update({ orientacao: 'Pode indicar qualquer suplemento.' })
      .eq('id', alerta!.id);
    expect(r.error).not.toBeNull();

    const conferido = await personal.alertas.listar(alunoId);
    expect(conferido.find((a) => a.id === alerta!.id)!.orientacao).toContain('amendoim');
  });

  it('dar alta tira o aviso da frente dos dois', async () => {
    const c = await medico.condicoes.resolver(alunoId, condicaoId);
    expect(c.resolvidaEm).not.toBeNull();
    expect(c.resolvidaPor?.nome).toBeTruthy();

    // Deixar o alerta pendente faria o personal continuar evitando o
    // suplemento por uma alergia que já teve alta.
    expect(await personal.alertas.listar(alunoId)).toEqual([]);
    expect(await nutri.alertas.listar(alunoId)).toEqual([]);
    // A condição continua na lista, agora como histórico.
    const lista = await personal.condicoes.listar(alunoId);
    expect(lista.find((x) => x.id === condicaoId)?.resolvidaEm).not.toBeNull();
  });
});
