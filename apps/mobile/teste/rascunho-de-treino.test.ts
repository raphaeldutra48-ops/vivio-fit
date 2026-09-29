import { beforeEach, describe, expect, it, vi } from 'vitest';
import { descartarRascunho, lerRascunho, salvarRascunho } from '../src/rascunhoTreino';

/**
 * O treino em andamento guardado no aparelho.
 *
 * A outra metade de "não perder o treino": a fila cuida do que já terminou, e
 * isto cuida do que está acontecendo. O aluno está na quarta série, o app vai
 * para segundo plano, o sistema mata o processo para liberar memória — e ele
 * volta esperando encontrar as três séries que já registrou.
 *
 * A REGRA de validade (mesma sessão, dentro da janela, relógio adiantado não
 * descarta) mora em `@vivio/contracts` e tem prova lá. O que se prova aqui é a
 * parte que vive no aparelho e que a regra não alcança: que um rascunho
 * inválido é **apagado** ao ser lido, e não só ignorado — deixá-lo custa
 * amanhã, quando um `salvoEm` no futuro por relógio errado o ressuscitaria.
 */
const aparelho = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (c: string) => Promise.resolve(aparelho.get(c) ?? null),
    setItem: (c: string, v: string) => {
      aparelho.set(c, v);
      return Promise.resolve();
    },
    removeItem: (c: string) => {
      aparelho.delete(c);
      return Promise.resolve();
    },
  },
}));

const CHAVE = 'vivio.rascunho.aluna-1';

const series = [
  { itemTreinoId: 'item-1', serieNum: 1, repsFeitas: 10, cargaKg: 40, tipo: 'NORMAL' },
];

beforeEach(() => {
  aparelho.clear();
});

describe('rascunho do treino em andamento', () => {
  it('o que foi registrado volta ao reabrir a mesma sessão', async () => {
    await salvarRascunho('aluna-1', { sessaoId: 'sessao-1', series } as never);

    const lido = await lerRascunho('aluna-1', 'sessao-1');

    expect(lido?.series).toHaveLength(1);
    expect(lido?.sessaoId).toBe('sessao-1');
  });

  it('rascunho de OUTRA sessão não é oferecido — e some do aparelho', async () => {
    /*
      Oferecer as séries do treino de perna no treino de peito seria pior que
      não oferecer nada: a pessoa aceitaria sem ler e registraria carga de
      exercício que não fez.
    */
    await salvarRascunho('aluna-1', { sessaoId: 'sessao-1', series } as never);

    expect(await lerRascunho('aluna-1', 'sessao-2')).toBeNull();
    // Apagado, e não só ignorado.
    expect(aparelho.has(CHAVE)).toBe(false);
  });

  it('rascunho velho demais é descartado ao ser lido', async () => {
    const ontem = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    aparelho.set(CHAVE, JSON.stringify({ sessaoId: 'sessao-1', series, salvoEm: ontem }));

    expect(await lerRascunho('aluna-1', 'sessao-1')).toBeNull();
    expect(aparelho.has(CHAVE)).toBe(false);
  });

  it('gravação truncada ou de versão antiga não derruba a tela', async () => {
    // O app abriria no meio de um treino e quebraria ao ler `series.length` de
    // algo que não é lista.
    aparelho.set(CHAVE, JSON.stringify({ sessaoId: 'sessao-1', series: 'nada disso' }));

    expect(await lerRascunho('aluna-1', 'sessao-1')).toBeNull();
    expect(aparelho.has(CHAVE)).toBe(false);
  });

  it('cada aluno tem o seu, e um não lê o do outro', async () => {
    // O aparelho pode ser compartilhado — e um rascunho por sessão deixaria
    // lixo acumulando a cada plano novo, sem ninguém para limpar.
    await salvarRascunho('aluna-1', { sessaoId: 'sessao-1', series } as never);

    expect(await lerRascunho('aluno-2', 'sessao-1')).toBeNull();
    // E o da primeira continua intacto.
    expect(await lerRascunho('aluna-1', 'sessao-1')).not.toBeNull();
  });

  it('descartar limpa de verdade, para o treino seguinte começar do zero', async () => {
    await salvarRascunho('aluna-1', { sessaoId: 'sessao-1', series } as never);

    await descartarRascunho('aluna-1');

    expect(aparelho.has(CHAVE)).toBe(false);
    expect(await lerRascunho('aluna-1', 'sessao-1')).toBeNull();
  });
});
