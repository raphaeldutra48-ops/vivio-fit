import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { urlDoBanco } from '../conexao';

/**
 * A verificação do conselho, imposta pelo banco.
 *
 * É o selo que decide quem pode ler dado de saúde de outra pessoa: `verificadoEm`
 * preenchido é o que abre o acompanhamento, a página pública e o recebimento de
 * alunos novos. Quem carimba é o administrador, depois de conferir o registro no
 * site do conselho.
 *
 * Duas regras sustentam isso, as duas em `15-perfil.sql`, e nenhuma tinha prova:
 *
 * 1. **Ninguém se verifica.** Um profissional que consiga escrever `verificadoEm`
 *    no próprio perfil dispensa a conferência inteira — e passa a ler exame e
 *    prescrição de aluno sem que ninguém tenha olhado o registro dele.
 * 2. **Trocar o registro derruba a verificação.** Sem isso, bastaria ser
 *    aprovado com um número válido e depois trocar para outro: o selo ficaria de
 *    pé sobre um registro que ninguém conferiu. O gatilho zera o selo mesmo que o
 *    cliente peça para preservá-lo, porque quem quer burlar é exatamente quem
 *    escreve o pedido.
 *
 * A tela de perfil AVISA que a troca remove a verificação. Este arquivo prova que
 * o aviso é verdade — se um dia a imposição cair numa migração, é aqui que
 * aparece, e não na primeira pessoa que perceber que dá para burlar.
 */
describe('verificação do conselho é do administrador', () => {
  const p = new PrismaClient({ datasourceUrl: urlDoBanco() });
  const marca = `prova-verif-${Date.now()}`;
  const profissionalId = `${marca}-prof`;
  const registroOriginal = `CREF ${marca}`;

  /** Roda como o PostgREST rodaria, com a claim que o token carrega. */
  async function como<T>(id: string, sql: string): Promise<T[]> {
    return p.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('set local role authenticated');
      await tx.$executeRawUnsafe(
        `set local request.jwt.claims = '${JSON.stringify({ role: 'authenticated', vivio_id: id })}'`,
      );
      return tx.$queryRawUnsafe<T[]>(sql);
    });
  }

  const perfil = () =>
    p.perfilProfissional.findUniqueOrThrow({ where: { userId: profissionalId } });

  beforeAll(async () => {
    await p.user.create({
      data: {
        id: profissionalId,
        email: `${marca}@teste.com`,
        nome: 'Personal de Prova',
        papel: 'PERSONAL',
        status: 'ATIVA',
        perfilProfissional: {
          create: {
            tipo: 'PERSONAL',
            registroConselho: registroOriginal,
            ufRegistro: 'SP',
            // Já verificado: as duas regras sob teste só existem depois do selo.
            verificadoEm: new Date(),
          },
        },
      },
    });
  });

  afterAll(async () => {
    await p.perfilProfissional.deleteMany({ where: { userId: profissionalId } });
    await p.user.deleteMany({ where: { id: profissionalId } });
    await p.$disconnect();
  });

  it('o profissional não consegue se verificar', async () => {
    /*
      O caso mais direto: escrever o próprio selo. Se passar, a análise do
      administrador é decorativa.
    */
    await p.perfilProfissional.update({
      where: { userId: profissionalId },
      data: { verificadoEm: null, verificadoPorId: null },
    });

    await expect(
      como(
        profissionalId,
        `update public."PerfilProfissional" set "verificadoEm" = now() where "userId" = '${profissionalId}'`,
      ),
    ).rejects.toThrow(/verificação do conselho é do administrador/i);

    expect((await perfil()).verificadoEm).toBeNull();
  });

  it('nem consegue apagar uma recusa que recebeu', async () => {
    // O outro lado da mesma regra: limpar `recusadoEm` faria a recusa
    // desaparecer do histórico, e o próximo administrador analisaria sem saber
    // que alguém já disse não.
    await p.perfilProfissional.update({
      where: { userId: profissionalId },
      data: { recusadoEm: new Date(), motivoRecusa: 'Registro consta como cancelado.' },
    });

    await expect(
      como(
        profissionalId,
        `update public."PerfilProfissional" set "recusadoEm" = null, "motivoRecusa" = null where "userId" = '${profissionalId}'`,
      ),
    ).rejects.toThrow(/verificação do conselho é do administrador/i);

    expect((await perfil()).motivoRecusa).toBe('Registro consta como cancelado.');
  });

  it('trocar o registro DERRUBA a verificação, mesmo pedindo para mantê-la', async () => {
    /*
      A regra que a tela de perfil promete ao avisar "sua verificação será
      removida". A escrita aqui tenta o contrário do aviso — muda o registro E
      manda o selo de novo, no mesmo update — porque é exatamente isso que um
      cliente modificado faria.
    */
    await p.perfilProfissional.update({
      where: { userId: profissionalId },
      data: {
        registroConselho: registroOriginal,
        ufRegistro: 'SP',
        verificadoEm: new Date(),
        recusadoEm: null,
        motivoRecusa: null,
      },
    });

    await como(
      profissionalId,
      `update public."PerfilProfissional"
         set "registroConselho" = 'CREF 999999-G',
             "verificadoEm" = now()
       where "userId" = '${profissionalId}'`,
    );

    const depois = await perfil();
    expect(depois.registroConselho).toBe('CREF 999999-G');
    // O selo caiu: o número novo ainda não foi conferido por ninguém.
    expect(depois.verificadoEm).toBeNull();
    expect(depois.verificadoPorId).toBeNull();
  });

  it('trocar só a UF também derruba — é outro conselho', async () => {
    /*
      CREF 12345 de São Paulo e CREF 12345 do Ceará são pessoas diferentes. Se a
      UF passasse batida, daria para mudar de estado mantendo o selo conferido
      em outro lugar.
    */
    await p.perfilProfissional.update({
      where: { userId: profissionalId },
      data: { registroConselho: registroOriginal, ufRegistro: 'SP', verificadoEm: new Date() },
    });

    await como(
      profissionalId,
      `update public."PerfilProfissional" set "ufRegistro" = 'CE' where "userId" = '${profissionalId}'`,
    );

    expect((await perfil()).verificadoEm).toBeNull();
  });

  it('mexer no resto do perfil NÃO derruba a verificação', async () => {
    /*
      O contrário também precisa valer, senão a regra vira armadilha: corrigir o
      telefone ou escrever a bio custaria uma nova análise, e o profissional
      ficaria sem receber alunos por ter arrumado um dígito.
    */
    await p.perfilProfissional.update({
      where: { userId: profissionalId },
      data: { registroConselho: registroOriginal, ufRegistro: 'SP', verificadoEm: new Date() },
    });

    await como(
      profissionalId,
      `update public."PerfilProfissional" set bio = 'Atendo presencial e online.' where "userId" = '${profissionalId}'`,
    );

    const depois = await perfil();
    expect(depois.bio).toBe('Atendo presencial e online.');
    expect(depois.verificadoEm).not.toBeNull();
  });

  it('a nota média vem de quem avaliou, não de quem é avaliado', async () => {
    // Regra vizinha e do mesmo tipo: quem é avaliado não escreve a própria nota.
    await expect(
      como(
        profissionalId,
        `update public."PerfilProfissional" set "notaMedia" = 5, "totalAvaliacoes" = 99 where "userId" = '${profissionalId}'`,
      ),
    ).rejects.toThrow(/nota vem das avaliações/i);
  });
});
