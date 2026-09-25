import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { urlDoBanco } from '../conexao';

/**
 * A trilha "quem viu meus dados" volta a ser escrita (`43-trilha-de-auditoria.sql`).
 *
 * Desde que o SDK deixou a API, nada anotava acesso: a última linha era de
 * 11/09. Este arquivo prova as duas metades pela porta do banco, com a claim
 * que o PostgREST monta a partir do token — a escrita pelo gatilho, a leitura
 * pela função — e o que cada uma NÃO anota, que importa tanto quanto.
 */
describe('Auditoria: a trilha pelo banco', () => {
  const p = new PrismaClient({
    datasourceUrl: urlDoBanco(),
  });
  const marca = `prova-trilha-${Date.now()}`;
  const alunoId = `${marca}-aluno`;
  let personal = '';
  let nutri = '';

  async function como<T = unknown>(id: string, sql: string, ...args: unknown[]): Promise<T[]> {
    return p.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('set local role authenticated');
      await tx.$executeRawUnsafe(
        `set local request.jwt.claims = '${JSON.stringify({ role: 'authenticated', vivio_id: id })}'`,
      );
      await tx.$executeRawUnsafe(
        `set local request.headers = '${JSON.stringify({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'prova/1.0' })}'`,
      );
      return tx.$queryRawUnsafe<T[]>(sql, ...args);
    });
  }

  const ler = (quem: string, recurso: string, escopo: string) =>
    como(
      quem,
      'select public.registrar_leitura($1, $2, $3)::text as ok',
      alunoId,
      recurso,
      escopo,
    );

  const trilha = () =>
    p.logAuditoria.findMany({ where: { alunoId }, orderBy: { criadoEm: 'asc' } });

  beforeAll(async () => {
    const idDe = async (e: string) => (await p.user.findUniqueOrThrow({ where: { email: e } })).id;
    [personal, nutri] = await Promise.all(
      ['personal@viviofit.com.br', 'nutri@viviofit.com.br'].map(idDe),
    );
    await p.user.create({
      data: { id: alunoId, email: `${marca}@teste.com`, nome: 'Aluno da Trilha', papel: 'ALUNO' },
    });
    // O personal atende e tem EVOLUCAO; a nutricionista não atende este aluno.
    await p.vinculo.create({
      data: {
        id: `${marca}-v`,
        alunoId,
        profissionalId: personal,
        tipo: 'PERSONAL',
        status: 'ATIVO',
        convidadoPorId: personal,
      },
    });
    await p.consentimento.create({
      data: {
        id: `${marca}-c`,
        alunoId,
        profissionalId: personal,
        escopo: 'EVOLUCAO',
        finalidade: 'Prova',
        versaoTermo: '1',
      },
    });
  });

  beforeEach(async () => {
    await p.logAuditoria.deleteMany({ where: { alunoId } });
  });

  afterAll(async () => {
    await p.logAuditoria.deleteMany({ where: { alunoId } });
    await p.medida.deleteMany({ where: { alunoId } });
    await p.consentimento.deleteMany({ where: { alunoId } });
    await p.vinculo.deleteMany({ where: { alunoId } });
    await p.user.deleteMany({ where: { id: alunoId } });
    await p.$disconnect();
  });

  describe('escrita, pelo gatilho', () => {
    it('o profissional registrar medida do aluno vira CRIAR, com escopo, recurso e origem', async () => {
      await como(
        personal,
        `insert into public."Medida" (id, "alunoId", data, "pesoKg", fonte, "registradoPorId", "atualizadoEm")
         values ($1, $2, '2026-07-29', 80, 'MANUAL', $3, now())`,
        `${marca}-m1`,
        alunoId,
        personal,
      );

      const [linha, ...resto] = await trilha();
      expect(resto).toHaveLength(0);
      expect(linha).toMatchObject({
        atorId: personal,
        acao: 'CRIAR',
        recursoTipo: 'MEDIDA',
        recursoId: `${marca}-m1`,
        escopo: 'EVOLUCAO',
        ip: '203.0.113.7',
        userAgent: 'prova/1.0',
      });
    });

    it('alterar vira ATUALIZAR', async () => {
      await como(
        personal,
        `update public."Medida" set "pesoKg" = 79 where id = $1`,
        `${marca}-m1`,
      );
      expect((await trilha()).map((l) => l.acao)).toEqual(['ATUALIZAR']);
    });

    it('o titular mexendo no que é dele não entra na trilha', async () => {
      await como(
        alunoId,
        `update public."Medida" set "pesoKg" = 78 where id = $1`,
        `${marca}-m1`,
      );
      expect(await trilha()).toHaveLength(0);
    });

    it('escrita sem sessão (agendador, manutenção) não inventa um ator', async () => {
      await p.medida.update({ where: { id: `${marca}-m1` }, data: { pesoKg: 77 } });
      expect(await trilha()).toHaveLength(0);
    });

    /*
      Remover é testado com a sessão do profissional mas SEM trocar de papel.

      A primeira versão tentava apagar como `authenticated`, e `Medida` não tem
      política de DELETE: nada era apagado, nada era anotado, e a asserção
      aceitava as duas saídas — passava sem provar nada. O que está sob teste
      aqui é o gatilho, não a política; a claim basta para ele saber quem é.
    */
    async function comSessao(id: string, sql: string, ...args: unknown[]): Promise<void> {
      await p.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `set local request.jwt.claims = '${JSON.stringify({ role: 'authenticated', vivio_id: id })}'`,
        );
        await tx.$executeRawUnsafe(sql, ...args);
      });
    }

    it('carimbar remoção vira REMOVER, e não ATUALIZAR', async () => {
      await comSessao(
        personal,
        `update public."Medida" set "deletadoEm" = now() where id = $1 and "deletadoEm" is null`,
        `${marca}-m1`,
      );
      expect((await trilha()).map((l) => l.acao)).toEqual(['REMOVER']);
    });

    it('apagar a linha vira REMOVER', async () => {
      await comSessao(personal, `delete from public."Medida" where id = $1`, `${marca}-m1`);
      expect(await p.medida.count({ where: { id: `${marca}-m1` } })).toBe(0);
      const [linha, ...resto] = await trilha();
      expect(resto).toHaveLength(0);
      expect(linha).toMatchObject({ acao: 'REMOVER', recursoId: `${marca}-m1`, atorId: personal });
    });
  });

  describe('leitura, pela função', () => {
    it('quem pode ler fica anotado como LER', async () => {
      await ler(personal, 'MEDIDA', 'EVOLUCAO');
      const [linha] = await trilha();
      expect(linha).toMatchObject({ atorId: personal, acao: 'LER', recursoTipo: 'MEDIDA' });
    });

    it('quem não pode ler fica anotado como NEGADO — a linha que mais importa', async () => {
      // Consentimento é de EVOLUCAO; CLINICO ninguém deu.
      await ler(personal, 'EXAME', 'CLINICO');
      // E a nutricionista nem atende este aluno.
      await ler(nutri, 'PLANO_DIETA', 'NUTRICAO');
      const linhas = await trilha();
      expect(linhas.map((l) => [l.atorId, l.acao]).sort()).toEqual(
        [
          [nutri, 'NEGADO'],
          [personal, 'NEGADO'],
        ].sort(),
      );
    });

    it('o titular lendo o que é dele não entra', async () => {
      await ler(alunoId, 'MEDIDA', 'EVOLUCAO');
      expect(await trilha()).toHaveLength(0);
    });

    it('a mesma leitura repetida em seguida conta uma vez — nem em paralelo duplica', async () => {
      await Promise.all([
        ler(personal, 'MEDIDA', 'EVOLUCAO'),
        ler(personal, 'MEDIDA', 'EVOLUCAO'),
        ler(personal, 'MEDIDA', 'EVOLUCAO'),
      ]);
      await ler(personal, 'MEDIDA', 'EVOLUCAO');
      expect(await trilha()).toHaveLength(1);
      // Recurso diferente é outra linha.
      await ler(personal, 'META', 'EVOLUCAO');
      expect(await trilha()).toHaveLength(2);
    });

    it('recurso ou escopo inventado é recusado, e não vira linha', async () => {
      await expect(ler(personal, 'QUALQUER_COISA', 'EVOLUCAO')).rejects.toThrow();
      await expect(ler(personal, 'MEDIDA', 'MENSAGENS')).rejects.toThrow();
      expect(await trilha()).toHaveLength(0);
    });

    it('sem sessão, recusa', async () => {
      await expect(
        p.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('set local role authenticated');
          return tx.$queryRawUnsafe(
            `select public.registrar_leitura($1, 'MEDIDA', 'EVOLUCAO')::text`,
            alunoId,
          );
        }),
      ).rejects.toThrow();
    });

    it('ninguém escreve direto na trilha', async () => {
      await expect(
        como(
          personal,
          `insert into public."LogAuditoria" (id, "atorId", acao, "recursoTipo", "alunoId")
           values ($1, $2, 'LER', 'MEDIDA', $3)`,
          `${marca}-forjada`,
          nutri,
          alunoId,
        ),
      ).rejects.toThrow();
    });
  });
});
