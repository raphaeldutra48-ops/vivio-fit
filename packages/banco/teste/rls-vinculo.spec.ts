import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { urlDoBanco } from '../conexao';

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
    datasourceUrl: urlDoBanco(),
  });
  const marca = `prova-vinc-${Date.now()}`;
  const alunoId = `${marca}-aluno`;
  const alunoEmail = `${marca}@teste.com`;
  const segundoPersonal = `${marca}-personal2`;
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
    // Verificado de propósito: a regra sob teste é "um ativo por tipo", e um
    // convite parado na trava do conselho nunca chegaria a ela.
    await p.user.create({
      data: {
        id: segundoPersonal,
        email: `${marca}-personal2@teste.com`,
        nome: 'Segundo Personal',
        papel: 'PERSONAL',
        status: 'ATIVA',
        perfilProfissional: {
          create: {
            tipo: 'PERSONAL',
            registroConselho: `CREF ${marca}`,
            ufRegistro: 'SP',
            verificadoEm: new Date(),
          },
        },
      },
    });
  });

  afterAll(async () => {
    await p.vinculo.deleteMany({ where: { alunoId } });
    await p.user.deleteMany({ where: { id: { in: [alunoId, segundoPersonal] } } });
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

      O segundo personal é criado por este arquivo, e não procurado no banco.

      A versão anterior pegava "qualquer outro PERSONAL" com `findFirst` — e,
      como a semente tem um só, caía no `return` e passava sem provar nada. A
      regra nunca tinha rodado de verdade contra o Supabase. Ela só apareceu
      quando uma execução interrompida deixou para trás um profissional SEM
      verificação: o `findFirst` o achou, e o convite parou na trava do
      conselho, antes de chegar à regra. Teste que depende de quem mais está
      no banco de produção decide pela sorte.

      Pelo mesmo motivo a recusa não pode ser só "deu algum erro": qualquer
      outra trava no caminho passaria por esta. A mensagem não serve de prova
      aqui — o Prisma troca o texto de todo `23505` cru por "Unique constraint
      failed" (o PostgREST, que é o que o app usa, entrega o texto inteiro).
      Então a prova é o CÓDIGO, que separa esta recusa da trava do conselho
      (`42501`), e o ESTADO que ficou: o segundo convite pendente, e o personal
      de antes como o único ativo.
    */
    const r = await convidar(segundoPersonal, alunoEmail);
    const segundo = r[0]!.convidar_vinculo;

    const recusa = await responder(alunoId, segundo, 'ACEITAR').then(
      () => null,
      (e: { meta?: { code?: string } }) => e,
    );
    expect(recusa?.meta?.code).toBe('23505');

    expect((await p.vinculo.findUniqueOrThrow({ where: { id: segundo } })).status).toBe('PENDENTE');
    const ativos = await p.vinculo.findMany({
      where: { alunoId, tipo: 'PERSONAL', status: 'ATIVO' },
      select: { id: true },
    });
    expect(ativos.map((v) => v.id)).toEqual([vinculoId]);
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

      As duas já falharam de jeitos DIFERENTES, e a diferença enganou este
      teste na primeira escrita. INSERT sem política lança, porque o `with
      check` não passa. UPDATE sem política NÃO lançava: não alcançava linha
      nenhuma e devolvia zero, calado. Nada mudava — mas quem esperasse exceção
      lia o silêncio como sucesso.

      Hoje as duas lançam, e a mudança foi de propósito: `99-fechar-portas.sql`
      tira a permissão de escrita de toda tabela que não tem política para
      aquele comando. Sem `grant update`, o Postgres recusa na porta em vez de
      deixar entrar e não fazer nada.

      Ainda assim a linha é conferida depois do erro. O erro prova que a porta
      está fechada; a linha prova que nada passou por ela — e é a segunda
      metade que continuaria valendo se um dia alguém devolvesse o `grant` sem
      escrever a política junto.
    */
    await expect(
      como(
        personal,
        `insert into "Vinculo" (id,"alunoId","profissionalId",tipo,status,"convidadoPorId","criadoEm","atualizadoEm")
         values ('${marca}-direto','${alunoId}','${personal}','PERSONAL','ATIVO','${personal}',now(),now())`,
      ),
    ).rejects.toThrow();
    expect(await p.vinculo.count({ where: { id: `${marca}-direto` } })).toBe(0);

    // O aluno tentando ativar sozinho o vínculo que ainda está pendente.
    const antes = await p.vinculo.findUniqueOrThrow({ where: { id: vinculoId } });
    await expect(
      como(alunoId, `update "Vinculo" set status='ATIVO' where id='${vinculoId}'`),
    ).rejects.toThrow();
    const depois = await p.vinculo.findUniqueOrThrow({ where: { id: vinculoId } });
    expect(depois.status).toBe(antes.status);
  });
});
