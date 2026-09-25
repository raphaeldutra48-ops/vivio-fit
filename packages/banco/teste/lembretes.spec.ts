import { PrismaClient } from '@prisma/client';
import { PREVIA_LEMBRETE, type TipoLembrete } from '@vivio/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { urlDoBanco } from '../conexao';

/**
 * O disparo de lembretes, agora dentro do banco (`42-disparo-de-lembretes.sql`).
 *
 * Os casos são os da suíte da API que morreu com ela, mais dois que ela não
 * tinha: o "hoje" do treino no dia LOCAL (a API usava as bordas do dia em UTC)
 * e a garantia de que o app não chama o disparador.
 *
 * ## O horário do teste nunca é o horário de agora
 *
 * O `pg_cron` roda a mesma função a cada minuto, com o relógio de verdade, no
 * mesmo banco. Se a configuração de prova usasse o minuto atual, o agendador
 * poderia criar um aviso no meio do teste e ele leria a contagem errada. Por
 * isso o horário configurado é o de daqui a seis horas, e o instante injetado
 * é esse horário numa data passada — 2026-07-29, uma quarta-feira.
 */
const marca = `prova-lembrete-${Date.now()}`;
const alunoId = `${marca}-aluno`;

function horarioDaquiASeisHoras(): string {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(Date.now() + 6 * 3600_000));
  const valor = (t: string) => partes.find((p) => p.type === t)!.value;
  return `${valor('hour') === '24' ? '00' : valor('hour')}:${valor('minute')}`;
}

const HORARIO = horarioDaquiASeisHoras();
/** Quarta-feira, no horário configurado, em São Paulo (UTC-3, sem horário de verão). */
const QUARTA = new Date(`2026-07-29T${HORARIO}:00-03:00`);

describe('Lembretes: o disparo pelo banco', () => {
  const p = new PrismaClient({
    datasourceUrl: urlDoBanco(),
  });

  const disparar = async (agora: Date): Promise<number> => {
    const r = await p.$queryRawUnsafe<{ n: number }[]>(
      'select public.disparar_lembretes_devidos($1::timestamptz) as n',
      agora.toISOString(),
    );
    return Number(r[0]!.n);
  };

  const configurar = (
    tipo: TipoLembrete,
    dados: { horarios?: string[]; diasDaSemana?: number[]; ativo?: boolean } = {},
  ) =>
    p.configuracaoLembrete.upsert({
      where: { alunoId_tipo: { alunoId, tipo } },
      create: {
        alunoId,
        tipo,
        horarios: dados.horarios ?? [HORARIO],
        diasDaSemana: dados.diasDaSemana ?? [],
        ativo: dados.ativo ?? true,
      },
      update: {
        horarios: dados.horarios ?? [HORARIO],
        diasDaSemana: dados.diasDaSemana ?? [],
        ativo: dados.ativo ?? true,
      },
    });

  const avisos = () => p.notificacao.findMany({ where: { userId: alunoId } });

  beforeAll(async () => {
    await p.user.create({
      data: {
        id: alunoId,
        email: `${marca}@teste.com`,
        nome: 'Aluno do Lembrete',
        papel: 'ALUNO',
        perfilAluno: {
          create: { dataNascimento: new Date('1997-06-01'), timezone: 'America/Sao_Paulo' },
        },
      },
    });
  });

  beforeEach(async () => {
    await p.notificacao.deleteMany({ where: { userId: alunoId } });
    await p.configuracaoLembrete.deleteMany({ where: { alunoId } });
    await p.tokenDispositivo.deleteMany({ where: { userId: alunoId } });
    await p.execucaoTreino.deleteMany({ where: { alunoId } });
    await p.perfilAluno.update({
      where: { userId: alunoId },
      data: { timezone: 'America/Sao_Paulo' },
    });
  });

  afterAll(async () => {
    await p.notificacao.deleteMany({ where: { userId: alunoId } });
    await p.configuracaoLembrete.deleteMany({ where: { alunoId } });
    await p.tokenDispositivo.deleteMany({ where: { userId: alunoId } });
    await p.execucaoTreino.deleteMany({ where: { alunoId } });
    await p.perfilAluno.deleteMany({ where: { userId: alunoId } });
    await p.user.deleteMany({ where: { id: alunoId } });
    await p.$disconnect();
  });

  it('o agendador existe e chama a função a cada minuto', async () => {
    const r = await p.$queryRawUnsafe<{ schedule: string; command: string; active: boolean }[]>(
      "select schedule, command, active from cron.job where jobname = 'vivio-disparar-lembretes'",
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.schedule).toBe('* * * * *');
    expect(r[0]!.command).toContain('disparar_lembretes_devidos');
    expect(r[0]!.active).toBe(true);
  });

  it('dispara no horário configurado, com o texto e o link do tipo', async () => {
    await configurar('TREINO');
    expect(await disparar(QUARTA)).toBe(1);

    const [aviso] = await avisos();
    expect(aviso!.tipo).toBe('TREINO');
    expect(aviso!.titulo).toBe(PREVIA_LEMBRETE.TREINO.titulo);
    expect(aviso!.deeplink).toBe('viviofit://treino');
    // O dia a que o aviso se refere é o dia local, que é a base da duplicata.
    expect(aviso!.referenteA.toISOString().slice(0, 10)).toBe('2026-07-29');
  });

  it('cada tipo chega com a frase que a tela de configuração promete', async () => {
    /*
      Os textos moram em dois lugares — `PREVIA_LEMBRETE` e a função — porque
      o banco não importa TypeScript. Este teste é o que impede os dois de
      divergirem em silêncio.
    */
    const tipos = Object.keys(PREVIA_LEMBRETE) as TipoLembrete[];
    for (const tipo of tipos) await configurar(tipo);
    expect(await disparar(QUARTA)).toBe(tipos.length);

    for (const aviso of await avisos()) {
      expect({ titulo: aviso.titulo, corpo: aviso.corpo }).toEqual(PREVIA_LEMBRETE[aviso.tipo]);
    }
  });

  it('fora do horário, não dispara', async () => {
    await configurar('TREINO');
    expect(await disparar(new Date(QUARTA.getTime() + 3600_000))).toBe(0);
  });

  it('o horário é o do fuso do aluno, não o do servidor', async () => {
    // Rio Branco é UTC-5: o mesmo instante lá é duas horas mais cedo.
    await p.perfilAluno.update({
      where: { userId: alunoId },
      data: { timezone: 'America/Rio_Branco' },
    });
    await configurar('TREINO');
    expect(await disparar(QUARTA)).toBe(0);
    expect(await disparar(new Date(QUARTA.getTime() + 2 * 3600_000))).toBe(1);
  });

  it('fuso que o Postgres não conhece cai no padrão, sem derrubar a varredura', async () => {
    await p.perfilAluno.update({ where: { userId: alunoId }, data: { timezone: 'Marte/Olimpo' } });
    await configurar('TREINO');
    expect(await disparar(QUARTA)).toBe(1);
  });

  it('rodar duas vezes no mesmo minuto avisa uma vez só', async () => {
    await configurar('TREINO');
    expect(await disparar(QUARTA)).toBe(1);
    expect(await disparar(QUARTA)).toBe(0);
    expect(await avisos()).toHaveLength(1);
  });

  it('varreduras simultâneas também geram um aviso só', async () => {
    await configurar('TREINO');
    const [a, b] = await Promise.all([disparar(QUARTA), disparar(QUARTA)]);
    expect(a + b).toBe(1);
    expect(await avisos()).toHaveLength(1);
  });

  it('respeita os dias da semana escolhidos', async () => {
    await configurar('TREINO', { diasDaSemana: [1, 5] }); // segunda e sexta
    expect(await disparar(QUARTA)).toBe(0);
    await configurar('TREINO', { diasDaSemana: [3] }); // quarta
    expect(await disparar(QUARTA)).toBe(1);
  });

  it('lembrete desativado não dispara', async () => {
    await configurar('TREINO', { ativo: false });
    expect(await disparar(QUARTA)).toBe(0);
  });

  describe('não incomodar quem já treinou', () => {
    const treinarEm = async (iniciadoEm: string) => {
      const sessao = await p.sessaoTreino.findFirstOrThrow({ select: { id: true } });
      await p.execucaoTreino.create({
        data: {
          alunoId,
          sessaoId: sessao.id,
          clienteUuid: `${marca}-${iniciadoEm}`,
          iniciadoEm: new Date(iniciadoEm),
        },
      });
    };

    it('quem treinou no dia local não recebe lembrete de treino', async () => {
      await configurar('TREINO');
      await treinarEm('2026-07-29T11:00:00.000Z'); // 08:00 em São Paulo
      expect(await disparar(QUARTA)).toBe(0);
    });

    it('o treino das 22h de ontem não cala o lembrete de hoje', async () => {
      /*
        01h de 29/07 em UTC é 22h de 28/07 em São Paulo — ontem, para o aluno.
        A API comparava com as bordas do dia em UTC e contava esse treino como
        de hoje: quem treinou tarde perdia o lembrete do dia seguinte.
      */
      await configurar('TREINO');
      await treinarEm('2026-07-29T01:00:00.000Z');
      expect(await disparar(QUARTA)).toBe(1);
    });

    it('ter treinado não cala o lembrete de água', async () => {
      await configurar('AGUA');
      await treinarEm('2026-07-29T11:00:00.000Z');
      expect(await disparar(QUARTA)).toBe(1);
    });
  });

  describe('a linha diz a verdade sobre a entrega', () => {
    it('sem aparelho: registrado e não enviado', async () => {
      await configurar('TREINO');
      await disparar(QUARTA);
      const [aviso] = await avisos();
      expect(aviso!.enviadaEm).toBeNull();
      expect(aviso!.erro).toBe('SEM_DISPOSITIVO');
    });

    it('com aparelho: também não enviado, porque não há provedor de push', async () => {
      /*
        A API marcava "enviada" com um driver que só escrevia no log. Uma
        caixa de avisos que diz "entregue" sem ter entregue esconde justamente
        o que alguém vai procurar quando o lembrete não chegar.
      */
      await p.tokenDispositivo.create({
        data: { userId: alunoId, token: `${marca}-token`, plataforma: 'ANDROID' },
      });
      await configurar('TREINO');
      await disparar(QUARTA);
      const [aviso] = await avisos();
      expect(aviso!.enviadaEm).toBeNull();
      expect(aviso!.erro).toBe('PUSH_NAO_CONFIGURADO');
    });
  });

  it('o app não chama o disparador', async () => {
    // Quem pudesse chamar escolheria `p_agora` e fabricaria aviso de qualquer dia.
    const chamar = p.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('set local role authenticated');
      await tx.$executeRawUnsafe(
        `set local request.jwt.claims = '${JSON.stringify({ role: 'authenticated', vivio_id: alunoId })}'`,
      );
      return tx.$queryRawUnsafe('select public.disparar_lembretes_devidos()');
    });
    await expect(chamar).rejects.toThrow(/permission denied/i);
  });
});
