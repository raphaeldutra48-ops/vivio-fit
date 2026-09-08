import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroApi } from '../src/erro';
import { VivioClient } from '../src/client';

/**
 * Exame pelo SDK, sem API.
 *
 * O que este arquivo persegue não é a listagem — é o que o cliente NÃO
 * consegue fazer. A classificação de um resultado dispara o alerta clínico; se
 * ela viesse pronta do app, um cliente adulterado gravaria "OTIMO" numa
 * glicemia de 300 e o aviso nunca nasceria: o médico veria o número, e o
 * personal não receberia conduta nenhuma.
 *
 * Por isso um dos testes manda a classificação errada de propósito, pelo
 * `supabase` cru, e confere que o banco a reescreve.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const servico = process.env.SUPABASE_SERVICE_ROLE;

describe.skipIf(!url || !anon || !servico)('SDK sem API: exame', () => {
  const marca = `prova-exame-${Date.now()}`;
  const alunoId = `${marca}-aluno`;
  let admin: SupabaseClient;
  let exameId = '';

  const cliente = (): VivioClient =>
    new VivioClient({
      baseUrl: 'http://127.0.0.1:1',
      supabase: { url: url!, chaveAnonima: anon!, persistirSessao: false },
    });

  const medico = cliente();
  const nutri = cliente();
  const personal = cliente();

  beforeAll(async () => {
    admin = createClient(url!, servico!, { auth: { persistSession: false } });
    const idDe = async (email: string): Promise<string> =>
      ((await admin.from('User').select('id').eq('email', email).single()).data as { id: string })
        .id;
    const [mId, nId, pId] = await Promise.all(
      ['medico@viviofit.com.br', 'nutri@viviofit.com.br', 'personal@viviofit.com.br'].map(idDe),
    );

    await admin.from('User').insert({
      id: alunoId,
      email: `${marca}@teste.com`,
      nome: 'Aluno de Exame',
      papel: 'ALUNO',
      status: 'ATIVA',
      atualizadoEm: new Date().toISOString(),
    });
    await admin.from('Vinculo').insert(
      [
        ['MEDICO', mId],
        ['NUTRICIONISTA', nId],
        ['PERSONAL', pId],
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
      medico.auth.login({ email: 'medico@viviofit.com.br', senha: 'Senha@123' }),
      nutri.auth.login({ email: 'nutri@viviofit.com.br', senha: 'Senha@123' }),
      personal.auth.login({ email: 'personal@viviofit.com.br', senha: 'Senha@123' }),
    ]);
  });

  afterAll(async () => {
    await admin.from('AlertaClinico').delete().eq('alunoId', alunoId);
    await admin.from('ResultadoMarcador').delete().eq('exameId', exameId);
    await admin.from('Exame').delete().eq('alunoId', alunoId);
    await admin.from('Consentimento').delete().eq('alunoId', alunoId);
    await admin.from('Vinculo').delete().eq('alunoId', alunoId);
    await admin.from('User').delete().eq('id', alunoId);
  });

  it('o médico lança o exame, e o banco classifica cada resultado', async () => {
    const e = await medico.exames.registrar(alunoId, {
      laboratorio: 'Lab da Prova',
      dataColeta: new Date('2026-03-01'),
      sexo: 'F',
      resultados: [
        // Muito acima da faixa laboratorial: crítico.
        { marcador: 'GLICOSE_JEJUM', valor: 300 },
        // Dentro do laudo e dentro do ideal: ótimo.
        { marcador: 'FERRITINA', valor: 90 },
        // Escopo MEDICO, para o teste da nutricionista mais abaixo.
        { marcador: 'TSH', valor: 2.1 },
      ],
    });
    exameId = e.id;

    expect(e.laboratorio).toBe('Lab da Prova');
    expect(e.dataColeta).toBe('2026-03-01');
    expect(e.registradoPor.nome).toBeTruthy();

    const porMarcador = new Map(e.resultados.map((r) => [r.marcador, r]));
    expect(porMarcador.get('GLICOSE_JEJUM')?.classificacao).toBe('CRITICO');
    expect(porMarcador.get('FERRITINA')?.classificacao).toBe('OTIMO');
    // E vem enriquecido com a régua que a tela mostra ao lado do número.
    expect(porMarcador.get('FERRITINA')?.unidade).toBe('ng/mL');
    expect(porMarcador.get('FERRITINA')?.funcional).toBeDefined();
  });

  it('a contagem conta o que QUEM PERGUNTOU vê', async () => {
    // Dizer "3 marcadores" e listar 2 seria pior que não dizer nada.
    const doMedico = await medico.exames.obter(alunoId, exameId);
    const daNutri = await nutri.exames.obter(alunoId, exameId);

    expect(doMedico.resultados).toHaveLength(3);
    const somaMedico = Object.values(doMedico.contagem).reduce((a, b) => a + b, 0);
    expect(somaMedico).toBe(3);

    // TSH é de escopo MEDICO: ela não vê, e a contagem dela também não conta.
    expect(daNutri.resultados.map((r) => r.marcador)).not.toContain('TSH');
    const somaNutri = Object.values(daNutri.contagem).reduce((a, b) => a + b, 0);
    expect(somaNutri).toBe(daNutri.resultados.length);
  });

  it('o personal não alcança o exame', async () => {
    // Ele recebe a conduta pelo alerta, nunca o número.
    expect(await personal.exames.listar(alunoId)).toEqual([]);
  });

  it('a nutricionista não lança marcador fora do escopo dela', async () => {
    // Dado gravado que o próprio autor não pode reler é pior que a recusa.
    await expect(
      nutri.exames.registrar(alunoId, {
        laboratorio: 'Não devia',
        dataColeta: new Date('2026-03-02'),
        sexo: 'F',
        resultados: [{ marcador: 'TSH', valor: 3 }],
      }),
    ).rejects.toBeInstanceOf(ErroApi);
  });

  it('mandar a classificação errada não adianta: o banco reescreve', async () => {
    /*
      A prova que sustenta o alerta clínico inteiro. Vai pelo `supabase` cru
      porque o SDK não oferece esse caminho — e o que se quer provar é que o
      BANCO recusa a mentira mesmo quando alguém tenta por fora dele.
    */
    const bruto = createClient(url!, anon!, { auth: { persistSession: false } });
    await bruto.auth.signInWithPassword({
      email: 'medico@viviofit.com.br',
      password: 'Senha@123',
    });

    const r = await bruto.from('ResultadoMarcador').insert({
      id: `${marca}-mentira`,
      exameId,
      // Marcador ainda não presente neste exame: a tabela tem unique por
      // (exame, marcador), e repetir daria conflito antes de o gatilho falar.
      marcador: 'VITAMINA_D',
      // Muito abaixo da faixa laboratorial.
      valor: 5,
      classificacao: 'OTIMO',
    });
    expect(r.error).toBeNull();

    const guardado = await admin
      .from('ResultadoMarcador')
      .select('classificacao')
      .eq('id', `${marca}-mentira`)
      .single();
    expect((guardado.data as { classificacao: string }).classificacao).toBe('CRITICO');
  });

  it('a chave do arquivo não sai, e a tela sabe que existe arquivo', async () => {
    await admin
      .from('Exame')
      .update({ chaveArquivo: 'privado/laudo.pdf', mimeType: 'application/pdf' })
      .eq('id', exameId);

    const e = await medico.exames.obter(alunoId, exameId);
    expect(e.temArquivo).toBe(true);
    // Assinar a URL depende do armazenamento, que ainda não migrou.
    expect(e.arquivoUrl).toBeNull();
  });
});
