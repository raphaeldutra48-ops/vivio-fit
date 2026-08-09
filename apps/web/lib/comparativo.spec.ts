import type { ComparativoDeEvolucao, LadoDoComparativo } from '@vivio/contracts';
import { describe, expect, it } from 'vitest';
import {
  comSinal,
  linhasDoComparativo,
  paresDeFotos,
  porExtenso,
  resumoDoPeriodo,
} from './comparativo';

const ladoVazio: LadoDoComparativo = {
  data: null,
  pesoKg: null,
  percentualGordura: null,
  massaMagraKg: null,
  cinturaCm: null,
  quadrilCm: null,
  bracoCm: null,
  coxaCm: null,
  toraxCm: null,
  fotos: [],
};

const base: ComparativoDeEvolucao = {
  dias: 60,
  aluno: { id: 'a1', nome: 'Maria Silva' },
  antes: { ...ladoVazio },
  agora: { ...ladoVazio },
  diferenca: {
    pesoKg: null,
    percentualGordura: null,
    massaMagraKg: null,
    cinturaCm: null,
    quadrilCm: null,
    bracoCm: null,
    coxaCm: null,
    toraxCm: null,
  },
  treino: null,
  geradoEm: '2026-08-09T12:00:00.000Z',
};

const foto = (angulo: string, data: string) => ({
  id: `${angulo}-${data}`,
  data,
  angulo: angulo as never,
  url: `https://exemplo/${angulo}`,
});

describe('comSinal', () => {
  /*
    O sinal é o conteúdo da coluna. "2 kg" sem sinal, num documento de
    evolução, é ambíguo entre ganhou e perdeu.
  */
  it('sempre marca a direção', () => {
    expect(comSinal(2)).toBe('+2');
    expect(comSinal(-5.4)).toBe('−5,4');
  });

  it('zero não leva sinal — não andou para lado nenhum', () => {
    expect(comSinal(0)).toBe('0');
  });
});

describe('linhasDoComparativo', () => {
  it('mostra a linha, a variação e se é boa notícia', () => {
    const linhas = linhasDoComparativo({
      ...base,
      antes: { ...ladoVazio, pesoKg: 84, cinturaCm: 96, massaMagraKg: 60 },
      agora: { ...ladoVazio, pesoKg: 79, cinturaCm: 90, massaMagraKg: 62 },
      diferenca: { ...base.diferenca, pesoKg: -5, cinturaCm: -6, massaMagraKg: 2 },
    });

    const cintura = linhas.find((l) => l.chave === 'cinturaCm');
    expect(cintura?.variacao).toBe('−6');
    expect(cintura?.positiva).toBe(true);

    const magra = linhas.find((l) => l.chave === 'massaMagraKg');
    expect(magra?.positiva).toBe(true);
  });

  /*
    Peso caindo é bom para quem emagrece e ruim para quem ganha massa. Pintar
    de verde ou vermelho seria o app opinar sobre um objetivo que ele não sabe
    qual é.
  */
  it('peso fica neutro', () => {
    const linhas = linhasDoComparativo({
      ...base,
      antes: { ...ladoVazio, pesoKg: 84 },
      agora: { ...ladoVazio, pesoKg: 79 },
      diferenca: { ...base.diferenca, pesoKg: -5 },
    });
    expect(linhas.find((l) => l.chave === 'pesoKg')?.positiva).toBeNull();
  });

  it('campo sem dado nenhum dos dois lados não vira linha de travessão', () => {
    const linhas = linhasDoComparativo({
      ...base,
      antes: { ...ladoVazio, pesoKg: 84 },
      agora: { ...ladoVazio, pesoKg: 79 },
      diferenca: { ...base.diferenca, pesoKg: -5 },
    });
    expect(linhas).toHaveLength(1);
    expect(linhas[0].chave).toBe('pesoKg');
  });

  /* Medida de um lado só é informação para quem for medir da próxima vez. */
  it('mas campo medido só de um lado fica, sem variação', () => {
    const linhas = linhasDoComparativo({
      ...base,
      agora: { ...ladoVazio, bracoCm: 34 },
    });
    const braco = linhas.find((l) => l.chave === 'bracoCm');
    expect(braco?.antes).toBeNull();
    expect(braco?.agora).toBe('34');
    expect(braco?.variacao).toBeNull();
  });
});

describe('paresDeFotos', () => {
  it('emparelha pelo ângulo, na ordem de leitura do corpo', () => {
    const pares = paresDeFotos(
      { ...ladoVazio, fotos: [foto('COSTAS', '2026-06-01'), foto('FRENTE', '2026-06-01')] },
      { ...ladoVazio, fotos: [foto('FRENTE', '2026-08-01'), foto('COSTAS', '2026-08-01')] },
    );
    expect(pares.map((p) => p.angulo)).toEqual(['FRENTE', 'COSTAS']);
    expect(pares[0].antes?.data).toBe('2026-06-01');
    expect(pares[0].agora?.data).toBe('2026-08-01');
  });

  /*
    Sumir com a foto sem par faria parecer que o app a perdeu. Ela entra com o
    outro lado vazio.
  */
  it('ângulo presente de um lado só entra mesmo assim', () => {
    const pares = paresDeFotos(ladoVazio, { ...ladoVazio, fotos: [foto('LADO', '2026-08-01')] });
    expect(pares).toHaveLength(1);
    expect(pares[0].antes).toBeNull();
    expect(pares[0].agora?.angulo).toBe('LADO');
  });

  it('sem foto nenhuma, nenhum par', () => {
    expect(paresDeFotos(ladoVazio, ladoVazio)).toEqual([]);
  });
});

describe('porExtenso', () => {
  /*
    Data sem hora não pode virar `new Date('2026-08-09')`, que é interpretada
    como UTC e no Brasil volta um dia — o documento sairia com a data errada.
  */
  it('não anda um dia para trás por causa de fuso', () => {
    expect(porExtenso('2026-08-09')).toBe('9 de agosto de 2026');
  });

  it('sem data, sem texto', () => {
    expect(porExtenso(null)).toBeNull();
  });
});

describe('resumoDoPeriodo', () => {
  /* O documento nunca sai mudo: tabela vazia sem explicação lê-se como "não evoluí". */
  it('explica a tabela vazia em vez de deixar a pessoa concluir sozinha', () => {
    expect(resumoDoPeriodo(base)).toContain('Ainda não há medidas registradas');
  });

  it('sem o "antes", diz que esta avaliação é o ponto de partida', () => {
    const texto = resumoDoPeriodo({ ...base, agora: { ...ladoVazio, data: '2026-08-01' } });
    expect(texto).toContain('ponto de partida');
  });

  it('com os dois lados, nomeia as duas datas', () => {
    const texto = resumoDoPeriodo({
      ...base,
      antes: { ...ladoVazio, data: '2026-06-10' },
      agora: { ...ladoVazio, data: '2026-08-09' },
    });
    expect(texto).toContain('10 de junho de 2026');
    expect(texto).toContain('9 de agosto de 2026');
  });
});
