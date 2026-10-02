import { describe, expect, it, vi } from 'vitest';
import { diaLocal, diaLocalMenos, diasEntre, inicioDoDiaUtc, novoId } from './datas';
import { registrarCheckinSchema } from './checkin';
import { soData } from './financeiro';

/**
 * A conta que o app errava em cinco lugares: que dia é hoje.
 *
 * A suíte deste pacote roda em `America/Sao_Paulo` (ver `vitest.config.ts`),
 * porque o defeito que estas provas fixam **só existe num fuso atrás do UTC** —
 * em UTC a divergência não acontece e a asserção que a exige cairia.
 */
describe('diaLocal', () => {
  it('devolve o dia do relógio local, com zero à esquerda', () => {
    expect(diaLocal(new Date(2026, 7, 9, 14, 0))).toBe('2026-08-09');
    expect(diaLocal(new Date(2026, 0, 5, 8, 30))).toBe('2026-01-05');
  });

  /*
    O motivo de a função existir. Às 22h de 9 de agosto no horário de Brasília
    (UTC-3), `toISOString()` já está em 10 de agosto — e tudo que é gravado por
    DIA cai no dia seguinte: o check-in antes de dormir, o copo de água, a
    refeição marcada, o pagamento recebido à noite.
  */
  it('não pula para o dia seguinte à noite', () => {
    const noiteDeNove = new Date(2026, 7, 9, 22, 30);
    expect(diaLocal(noiteDeNove)).toBe('2026-08-09');
    expect(diaLocal(noiteDeNove)).not.toBe(noiteDeNove.toISOString().slice(0, 10));
  });

  it('nem volta um dia de madrugada', () => {
    expect(diaLocal(new Date(2026, 7, 9, 0, 15))).toBe('2026-08-09');
  });

  it('o formato passa no schema que o servidor exige', () => {
    const corpo = {
      data: diaLocal(new Date(2026, 10, 3, 23, 59)),
      treinou: true,
      energia: 4,
    };
    expect(registrarCheckinSchema.safeParse(corpo).success).toBe(true);
  });
});

describe('diaLocal e soData resolvem perguntas diferentes', () => {
  /*
    É aqui que a confusão nasce, e por isso as duas funções têm prova lado a
    lado: `soData` lê componentes UTC e está CERTA para um dia escolhido num
    `<input type="date">`, porque `new Date('2026-10-10')` é 10/10 às 00:00Z.
    Trocar uma pela outra erra em qualquer direção.
  */
  it('um dia vindo de campo de data não muda ao passar por soData', () => {
    expect(soData(new Date('2026-10-10'))).toBe('2026-10-10');
  });

  it('e o MESMO valor lido como instante local daria o dia anterior', () => {
    // A prova de que não se substituem: no Brasil, 00:00Z é 21h do dia 9.
    expect(diaLocal(new Date('2026-10-10'))).toBe('2026-10-09');
  });

  it('um instante da noite, ao contrário, só está certo em diaLocal', () => {
    const noite = new Date(2026, 9, 9, 22, 0);
    expect(diaLocal(noite)).toBe('2026-10-09');
    expect(soData(noite)).toBe('2026-10-10');
  });
});

describe('inicioDoDiaUtc', () => {
  it('leva um dia do calendário para a meia-noite UTC', () => {
    expect(inicioDoDiaUtc('2026-10-09').toISOString()).toBe('2026-10-09T00:00:00.000Z');
  });

  it('não escorrega de dia por causa do fuso de quem roda', () => {
    // O erro oposto: construir com `new Date(2026, 9, 9)` daria 03:00Z aqui, e a
    // comparação entre dois dias passaria a depender do relógio da máquina.
    expect(inicioDoDiaUtc('2026-10-09').getUTCDate()).toBe(9);
  });
});

describe('diasEntre', () => {
  it('conta dias inteiros do calendário', () => {
    expect(diasEntre('2026-10-09', '2026-10-09')).toBe(0);
    expect(diasEntre('2026-10-09', '2026-10-10')).toBe(1);
    expect(diasEntre('2026-09-30', '2026-10-01')).toBe(1);
  });

  /*
    O caso que o painel errava: o check-in é gravado com o dia local, e o "hoje"
    era calculado em UTC. Às 22h os dois discordavam, e o profissional lia "1 dia
    sem check-in" sobre alguém que havia registrado naquela mesma noite.
  */
  it('quem registrou hoje à noite está a ZERO dias sem check-in', () => {
    const noite = new Date(2026, 9, 9, 22, 30);
    expect(diasEntre(diaLocal(noite), diaLocal(noite))).toBe(0);
  });

  it('atravessa o horário de verão sem meio dia sobrando', () => {
    // Datas em meia-noite UTC dos dois lados: nenhuma hora a mais ou a menos
    // entra na conta, e `Math.round` não tem o que consertar.
    expect(diasEntre('2026-02-20', '2026-03-20')).toBe(28);
  });
});

describe('diaLocalMenos', () => {
  it('anda para trás no calendário, não em 24h fixas', () => {
    expect(diaLocalMenos(1, new Date(2026, 9, 9, 22, 0))).toBe('2026-10-08');
    expect(diaLocalMenos(29, new Date(2026, 9, 9, 22, 0))).toBe('2026-09-10');
  });

  it('a borda de uma janela de 30 dias inclui o dia de hoje', () => {
    // `dias - 1` é o que os chamadores passam: 30 dias contados com o de hoje
    // dentro, que é o que "últimos 30 dias" quer dizer para quem lê.
    const hoje = new Date(2026, 9, 9, 22, 0);
    expect(diasEntre(diaLocalMenos(29, hoje), diaLocal(hoje))).toBe(29);
  });
});

describe('novoId', () => {
  it('guarda o prefixo, para o id ser legível no banco', () => {
    expect(novoId('aluna-1')).toMatch(/^aluna-1-\d+-[a-z0-9]+$/);
  });

  /*
    O defeito que esta prova fixa. O id era `${alunoId}-${Date.now()}`, e dois
    registros no mesmo milissegundo colidiam na chave primária — o segundo gole
    de água voltava como "Esse registro já existe". Com o relógio CONGELADO, que
    é o pior caso possível, os ids continuam diferentes.
  */
  it('dois ids no MESMO milissegundo não colidem', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T12:00:00.000Z'));
    try {
      const ids = new Set(Array.from({ length: 200 }, () => novoId('aluna-1')));
      expect(ids.size).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });
});
