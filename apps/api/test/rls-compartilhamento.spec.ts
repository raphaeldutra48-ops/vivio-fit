import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Compartilhamento de dado entre profissionais, conferido no banco.
 *
 * Roda contra o Postgres de verdade e NÃO sobe o Nest: o que está sob teste é
 * política de RLS e gatilho, e nada disso passa por código nosso. Testar pelo
 * app provaria o app; aqui a pergunta é se o banco se defende sozinho, que é a
 * premissa inteira de sair da API.
 *
 * Cada ato roda com `set local role authenticated` e a claim `vivio_id`, que é
 * exatamente o que o PostgREST monta a partir do token do Supabase.
 *
 * ## Por que um aluno de sondagem, e não a Ana da semente
 *
 * Na semente todos os consentimentos são de equipe, e aí a nutricionista já
 * leria o exame sem pedir nada — o teste passaria sem testar. O cenário que
 * importa é o consentimento dado a UM profissional só.
 *
 * Os `it` correm em ordem de propósito: é um fluxo (pedir, responder, usar,
 * desligar), e cada passo depende do anterior ter acontecido.
 */
describe('RLS: pedir dado a um colega', () => {
  const p = new PrismaClient({
    datasourceUrl: process.env.SUPABASE_DIRECT_URL ?? process.env.DATABASE_URL,
  });
  const marca = `prova-comp-${Date.now()}`;
  const alunoId = `${marca}-aluno`;
  const pedido = `${marca}-s`;
  let nutri = '';
  let medico = '';
  let personal = '';

  /** Roda como alguém, com o token que o PostgREST montaria. */
  async function como<T>(id: string, sql: string): Promise<T[]> {
    return p.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('set local role authenticated');
      await tx.$executeRawUnsafe(
        `set local request.jwt.claims = '${JSON.stringify({ role: 'authenticated', vivio_id: id })}'`,
      );
      return tx.$queryRawUnsafe<T[]>(sql);
    });
  }

  const examesVisiveis = async (id: string): Promise<number> => {
    const r = await como<{ n: bigint }>(
      id,
      `select count(*)::bigint n from "Exame" where "alunoId"='${alunoId}'`,
    );
    return Number(r[0]!.n);
  };

  const aprovar = (quem: string) =>
    como(quem, `update "SolicitacaoDeAcesso" set status='APROVADA' where id='${pedido}'`);

  beforeAll(async () => {
    const idDe = async (e: string) => (await p.user.findUniqueOrThrow({ where: { email: e } })).id;
    [personal, nutri, medico] = await Promise.all(
      ['personal@viviofit.com.br', 'nutri@viviofit.com.br', 'medico@viviofit.com.br'].map(idDe),
    );

    await p.user.create({
      data: { id: alunoId, email: `${marca}@teste.com`, nome: 'Aluno de Prova', papel: 'ALUNO' },
    });
    await p.vinculo.createMany({
      data: [
        { id: `${marca}-v1`, alunoId, profissionalId: nutri, tipo: 'NUTRICIONISTA', status: 'ATIVO', convidadoPorId: nutri },
        { id: `${marca}-v2`, alunoId, profissionalId: medico, tipo: 'MEDICO', status: 'ATIVO', convidadoPorId: medico },
      ],
    });
    await p.consentimento.createMany({
      data: [
        // O ponto do cenário: clínico é do médico, e de mais ninguém.
        { id: `${marca}-c1`, alunoId, escopo: 'CLINICO', profissionalId: medico, finalidade: 'Prova', versaoTermo: '1' },
        { id: `${marca}-c2`, alunoId, escopo: 'NUTRICAO', finalidade: 'Prova', versaoTermo: '1' },
      ],
    });
    await p.exame.create({
      data: { id: `${marca}-e`, alunoId, dataColeta: new Date(), registradoPorId: medico, laboratorio: 'Prova', sexo: 'F' },
    });
  });

  afterAll(async () => {
    await p.solicitacaoDeAcesso.deleteMany({ where: { alunoId } });
    await p.exame.deleteMany({ where: { alunoId } });
    await p.consentimento.deleteMany({ where: { alunoId } });
    await p.vinculo.deleteMany({ where: { alunoId } });
    await p.user.deleteMany({ where: { id: alunoId } });
    await p.$disconnect();
  });

  it('sem autorização, quem tem vínculo mas não tem consentimento não lê', async () => {
    await expect(examesVisiveis(medico)).resolves.toBe(1);
    await expect(examesVisiveis(nutri)).resolves.toBe(0);
  });

  it('quem não atende o aluno não consegue nem pedir', async () => {
    // O personal não tem vínculo com este aluno. Pedir não pode virar porta de
    // entrada para paciente que não é seu.
    await expect(
      como(
        personal,
        `insert into "SolicitacaoDeAcesso" (id,"alunoId","solicitanteId","detentorId",escopo,justificativa,status,"criadoEm")
         values ('${marca}-x','${alunoId}','${personal}','${medico}','CLINICO','Prova','PENDENTE',now())`,
      ),
    ).rejects.toThrow();
  });

  it('a nutricionista pede ao médico, e só uma vez', async () => {
    const inserir = (id: string) =>
      como(
        nutri,
        `insert into "SolicitacaoDeAcesso" (id,"alunoId","solicitanteId","detentorId",escopo,justificativa,status,"criadoEm")
         values ('${id}','${alunoId}','${nutri}','${medico}','CLINICO','Ajustar carga proteica','PENDENTE',now())`,
      );
    await inserir(pedido);
    // Clicar de novo não enche a caixa de entrada do colega com o mesmo pedido.
    await expect(inserir(`${marca}-s2`)).rejects.toThrow();
  });

  it('nem quem pediu nem o aluno aprovam no lugar do detentor', async () => {
    await expect(aprovar(nutri)).rejects.toThrow();
    await expect(aprovar(alunoId)).rejects.toThrow();
  });

  it('o médico aprova, e o banco carimba a resposta', async () => {
    await aprovar(medico);
    const r = await como<{ respondidaEm: Date | null }>(
      medico,
      `select "respondidaEm" from "SolicitacaoDeAcesso" where id='${pedido}'`,
    );
    expect(r[0]!.respondidaEm).not.toBeNull();
  });

  it('a autorização abre a leitura', async () => {
    await expect(examesVisiveis(nutri)).resolves.toBe(1);
  });

  it('e não abre a escrita', async () => {
    /*
      A regra que mais fácil se perde. A política de escrita já aceita o papel
      NUTRICIONISTA em exame; se `pode_escrever_do_aluno` delegasse à leitura,
      "veja o exame" viraria "lance exame". Escrever exige o consentimento do
      próprio aluno a quem escreve, sempre.
    */
    await expect(
      como(
        nutri,
        `insert into "Exame" (id,"alunoId","registradoPorId",laboratorio,"dataColeta",sexo,"criadoEm")
         values ('${marca}-e2','${alunoId}','${nutri}','Prova',now(),'F',now())`,
      ),
    ).rejects.toThrow();
  });

  it('o aluno enxerga o acordo sobre ele; quem é de fora, não', async () => {
    const conta = async (id: string) =>
      Number(
        (
          await como<{ n: bigint }>(
            id,
            `select count(*)::bigint n from "SolicitacaoDeAcesso" where id='${pedido}'`,
          )
        )[0]!.n,
      );
    await expect(conta(alunoId)).resolves.toBe(1);
    await expect(conta(personal)).resolves.toBe(0);
  });

  it('a permissão é derivada: o aluno revogar o médico fecha a do colega na hora', async () => {
    await p.consentimento.update({ where: { id: `${marca}-c1` }, data: { revogadoEm: new Date() } });
    await expect(examesVisiveis(nutri)).resolves.toBe(0);
    await expect(examesVisiveis(medico)).resolves.toBe(0);

    // E sem rotina de limpeza: a linha do acordo não foi tocada.
    const linha = await p.solicitacaoDeAcesso.findUniqueOrThrow({ where: { id: pedido } });
    expect(linha.status).toBe('APROVADA');
    expect(linha.revogadoEm).toBeNull();

    await p.consentimento.update({ where: { id: `${marca}-c1` }, data: { revogadoEm: null } });
    await expect(examesVisiveis(nutri)).resolves.toBe(1);
  });

  it('o prazo é de quem concedeu, e vencido não lê', async () => {
    await expect(
      como(
        nutri,
        `update "SolicitacaoDeAcesso" set "expiraEm"=now()+interval '10 years' where id='${pedido}'`,
      ),
    ).rejects.toThrow();

    await como(medico, `update "SolicitacaoDeAcesso" set "expiraEm"=now()-interval '1 second' where id='${pedido}'`);
    await expect(examesVisiveis(nutri)).resolves.toBe(0);
    await como(medico, `update "SolicitacaoDeAcesso" set "expiraEm"=now()+interval '1 day' where id='${pedido}'`);
    await expect(examesVisiveis(nutri)).resolves.toBe(1);
  });

  it('o escopo de um acordo aprovado não se remenda', async () => {
    // Seria transformar "pode ver o treino" em "pode ver o prontuário" sem
    // passar por ninguém.
    await expect(
      como(medico, `update "SolicitacaoDeAcesso" set escopo='TREINO' where id='${pedido}'`),
    ).rejects.toThrow();
  });

  it('o aluno desliga, e desligado não ressuscita', async () => {
    await como(alunoId, `update "SolicitacaoDeAcesso" set status='REVOGADA' where id='${pedido}'`);
    await expect(examesVisiveis(nutri)).resolves.toBe(0);
    await expect(aprovar(medico)).rejects.toThrow();
  });
});
