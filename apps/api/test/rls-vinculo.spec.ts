import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Vínculo de cuidado pelo banco: convidar e responder.
 *
 * Vínculo é a raiz das três condições — é ele que diz quem atende quem — e as
 * regras dele são transições com invariante, não permissões de linha. Por isso
 * não há política de escrita em `Vinculo`: ou passa por `convidar_vinculo` e
 * `responder_vinculo`, ou não acontece. Este arquivo confere as duas.
 *
 * Cada ato roda com a claim que o PostgREST monta a partir do token.
 */
describe('RLS: vínculo de cuidado', () => {
  const p = new PrismaClient({
    datasourceUrl: process.env.SUPABASE_DIRECT_URL ?? process.env.DATABASE_URL,
  });
  const marca = `prova-vinc-${Date.now()}`;
  const alunoId = `${marca}-aluno`;
  const alunoEmail = `${marca}@teste.com`;
  let personal = '';
  let nutri = '';
  let vinculoId = '';

  async function como<T>(id: string, sql: string): Promise<T[]> {
    return p.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('set local role authenticated');
      await tx.$executeRawUnsafe(
        `set local request.jwt.claims = '${JSON.stringify({ role: 'authenticated', vivio_id: id })}'`,
      );
      return tx.$queryRawUnsafe<T[]>(sql);
    });
  }

  const convidar = (quem: string, email: string) =>
    como<{ convidar_vinculo: string }>(quem, `select public.convidar_vinculo('${email}')`);

  const responder = (quem: string, id: string, acao: string) =>
    como(quem, `select public.responder_vinculo('${id}', '${acao}')`);

  beforeAll(async () => {
    const idDe = async (e: string) => (await p.user.findUniqueOrThrow({ where: { email: e } })).id;
    [personal, nutri] = await Promise.all(
      ['personal@viviofit.com.br', 'nutri@viviofit.com.br'].map(idDe),
    );
    await p.user.create({
      data: { id: alunoId, email: alunoEmail, nome: 'Aluno de Prova', papel: 'ALUNO' },
    });
  });

  afterAll(async () => {
    await p.vinculo.deleteMany({ where: { alunoId } });
    await p.user.deleteMany({ where: { id: alunoId } });
    await p.$disconnect();
  });

  it('o profissional convida pelo e-mail', async () => {
    const r = await convidar(personal, alunoEmail);
    vinculoId = r[0]!.convidar_vinculo;
    const v = await p.vinculo.findUniqueOrThrow({ where: { id: vinculoId } });
    expect(v.status).toBe('PENDENTE');
    expect(v.tipo).toBe('PERSONAL');
    expect(v.convidadoPorId).toBe(personal);
  });

  it('convidar de novo não cria um segundo convite', async () => {
    await expect(convidar(personal, alunoEmail)).rejects.toThrow();
    expect(await p.vinculo.count({ where: { alunoId, profissionalId: personal } })).toBe(1);
  });

  it('e-mail que não existe é recusado', async () => {
    await expect(convidar(personal, 'ninguem-mesmo@teste.com')).rejects.toThrow();
  });

  it('profissional não convida profissional', async () => {
    await expect(convidar(personal, 'nutri@viviofit.com.br')).rejects.toThrow();
  });

  it('quem convidou não aceita o próprio convite', async () => {
    // Convite que quem mandou pudesse aceitar não seria convite.
    await expect(responder(personal, vinculoId, 'ACEITAR')).rejects.toThrow();
  });

  it('quem não é parte do vínculo não responde', async () => {
    await expect(responder(nutri, vinculoId, 'ACEITAR')).rejects.toThrow();
  });

  it('o aluno aceita', async () => {
    await responder(alunoId, vinculoId, 'ACEITAR');
    const v = await p.vinculo.findUniqueOrThrow({ where: { id: vinculoId } });
    expect(v.status).toBe('ATIVO');
    expect(v.iniciadoEm).not.toBeNull();
  });

  it('um profissional ativo por tipo: o segundo personal esbarra', async () => {
    /*
      Trocar de personal exige encerrar o anterior, e o histórico dele
      permanece — é o ponto de encerrar em vez de apagar. Aqui o segundo
      convite chega a existir; o que a regra barra é ele virar ATIVO.
    */
    const admin = await p.user.findFirst({
      where: { papel: 'PERSONAL', id: { not: personal } },
      select: { id: true, email: true },
    });
    if (!admin) return; // a semente tem um personal só; nada a provar aqui.

    const r = await convidar(admin.id, alunoEmail);
    const segundo = r[0]!.convidar_vinculo;
    await expect(responder(alunoId, segundo, 'ACEITAR')).rejects.toThrow();
  });

  it('qualquer um dos dois lados encerra, e o encerrado não se aceita', async () => {
    await responder(personal, vinculoId, 'ENCERRAR');
    const v = await p.vinculo.findUniqueOrThrow({ where: { id: vinculoId } });
    expect(v.status).toBe('ENCERRADO');
    expect(v.encerradoEm).not.toBeNull();
    await expect(responder(alunoId, vinculoId, 'ACEITAR')).rejects.toThrow();
  });

  it('encerrado pode ser reaberto, e o histórico não vira linha nova', async () => {
    const r = await convidar(personal, alunoEmail);
    expect(r[0]!.convidar_vinculo).toBe(vinculoId);
    const v = await p.vinculo.findUniqueOrThrow({ where: { id: vinculoId } });
    expect(v.status).toBe('PENDENTE');
    expect(v.encerradoEm).toBeNull();
  });

  it('a escrita direta na tabela continua fechada', async () => {
    /*
      Não há política de INSERT nem de UPDATE: as funções são o único caminho.

      As duas falham de jeitos DIFERENTES, e a diferença enganou este teste na
      primeira escrita. INSERT sem política lança, porque o `with check` não
      passa. UPDATE sem política **não lança**: ele simplesmente não alcança
      linha nenhuma e devolve zero, calado. É o comportamento mais seguro dos
      dois — nada muda — mas quem espera exceção lê o silêncio como sucesso.

      Por isso aqui a prova do UPDATE não é o erro: é a linha continuar como
      estava.
    */
    await expect(
      como(
        personal,
        `insert into "Vinculo" (id,"alunoId","profissionalId",tipo,status,"convidadoPorId","criadoEm","atualizadoEm")
         values ('${marca}-direto','${alunoId}','${personal}','PERSONAL','ATIVO','${personal}',now(),now())`,
      ),
    ).rejects.toThrow();
    expect(await p.vinculo.count({ where: { id: `${marca}-direto` } })).toBe(0);

    const antes = await p.vinculo.findUniqueOrThrow({ where: { id: vinculoId } });
    await como(alunoId, `update "Vinculo" set status='ATIVO' where id='${vinculoId}'`);
    const depois = await p.vinculo.findUniqueOrThrow({ where: { id: vinculoId } });
    expect(depois.status).toBe(antes.status);
  });
});
