import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Abrir a mesma conversa ao mesmo tempo não cria duas (pendência 24).
 *
 * `abrir_conversa` procura a conversa da dupla e, se não acha, cria. Sem fila,
 * aberturas simultâneas não enxergam uma à outra: foi o que duplicou a conversa
 * da Ana no desenvolvimento, e o que dois aparelhos ou um retry de rede
 * reproduzem sem passar pela tela.
 */
describe('Conversa: aberturas simultâneas', () => {
  const p = new PrismaClient({
    datasourceUrl: process.env.SUPABASE_DIRECT_URL ?? process.env.DATABASE_URL,
  });
  const marca = `prova-conversa-${Date.now()}`;
  const alunoId = `${marca}-aluno`;
  let personal = '';

  const abrirComo = (quem: string, com: string) =>
    p.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('set local role authenticated');
      await tx.$executeRawUnsafe(
        `set local request.jwt.claims = '${JSON.stringify({ role: 'authenticated', vivio_id: quem })}'`,
      );
      const r = await tx.$queryRawUnsafe<{ id: string }[]>(
        `select public.abrir_conversa('${com}') as id`,
      );
      return r[0]!.id;
    });

  beforeAll(async () => {
    personal = (await p.user.findUniqueOrThrow({ where: { email: 'personal@viviofit.com.br' } })).id;
    await p.user.create({
      data: { id: alunoId, email: `${marca}@teste.com`, nome: 'Aluno da Conversa', papel: 'ALUNO' },
    });
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
  });

  afterAll(async () => {
    await p.conversa.deleteMany({ where: { alunoId } });
    await p.vinculo.deleteMany({ where: { alunoId } });
    await p.user.deleteMany({ where: { id: alunoId } });
    await p.$disconnect();
  });

  it('a abertura espera a trava da dupla antes de procurar', async () => {
    /*
      A corrida é de milissegundos e não se reproduz sob comando: o teste de
      seis aberturas simultâneas, logo abaixo, passava também SEM a trava. Um
      teste que passa de qualquer jeito não prova nada. Então este segura a
      trava da dupla por fora e confere que a abertura FICA ESPERANDO — é o que
      impede duas de procurarem ao mesmo tempo.
    */
    const chave = `abrir_conversa:${alunoId}:${personal}`;
    let aberta = false;
    let abertura: Promise<string> | null = null;

    await p.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('select pg_advisory_xact_lock(hashtextextended($1, 0))', chave);
        abertura = abrirComo(personal, alunoId).then((id) => {
          aberta = true;
          return id;
        });
        await new Promise((r) => setTimeout(r, 1500));
        expect(aberta).toBe(false);
      },
      { timeout: 20_000 },
    );

    // Soltou a trava: a abertura segue e termina.
    expect(typeof (await abertura!)).toBe('string');
    expect(aberta).toBe(true);
  });

  it('seis aberturas ao mesmo tempo, pelos dois lados, dão uma conversa só', async () => {
    const ids = await Promise.all([
      abrirComo(personal, alunoId),
      abrirComo(alunoId, personal),
      abrirComo(personal, alunoId),
      abrirComo(alunoId, personal),
      abrirComo(personal, alunoId),
      abrirComo(alunoId, personal),
    ]);

    expect(new Set(ids).size).toBe(1);
    expect(await p.conversa.count({ where: { alunoId } })).toBe(1);
  });

  it('e abrir de novo depois devolve a mesma', async () => {
    const [existente] = await p.conversa.findMany({ where: { alunoId }, select: { id: true } });
    expect(await abrirComo(personal, alunoId)).toBe(existente!.id);
  });
});
