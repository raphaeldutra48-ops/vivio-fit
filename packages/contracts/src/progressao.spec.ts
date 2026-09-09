import { describe, expect, it } from 'vitest';
import { faixaDeReps, incrementoPara, sugerirCarga, type SerieFeita } from './progressao';

const serie = (cargaKg: number, repsFeitas: number, rpe?: number, tipo = 'NORMAL'): SerieFeita => ({
  cargaKg,
  repsFeitas,
  tipo,
  rpe,
});

describe('faixa de repetições', () => {
  it('lê intervalo em vários formatos', () => {
    expect(faixaDeReps('8-12')).toEqual({ min: 8, max: 12 });
    expect(faixaDeReps('8 - 12')).toEqual({ min: 8, max: 12 });
    expect(faixaDeReps('8a12')).toEqual({ min: 8, max: 12 });
  });

  it('número solo vira faixa de um ponto', () => {
    expect(faixaDeReps('10')).toEqual({ min: 10, max: 10 });
  });

  it('intervalo invertido é corrigido, não recusado', () => {
    expect(faixaDeReps('12-8')).toEqual({ min: 8, max: 12 });
  });

  /*
    `repsAlvo` é texto livre de propósito — "até a falha", "30s", "máximo".
    Sobre esses a sugestão silencia: melhor não opinar do que opinar sobre um
    alvo que não se entendeu.
  */
  it('texto que não é faixa devolve null', () => {
    expect(faixaDeReps('até a falha')).toBeNull();
    expect(faixaDeReps('30s')).toBeNull();
    expect(faixaDeReps('')).toBeNull();
  });
});

describe('incremento', () => {
  /** 2,5 kg no supino de 40 é muito; no leg press de 200 é nada. */
  it('é percentual, arredondado ao menor par de anilhas', () => {
    expect(incrementoPara(200)).toBe(10);
    expect(incrementoPara(100)).toBe(5);
    expect(incrementoPara(60)).toBe(2.5);
  });

  it('nunca é menor que 2,5 kg', () => {
    expect(incrementoPara(10)).toBe(2.5);
    expect(incrementoPara(1)).toBe(2.5);
  });
});

describe('sugestão de carga', () => {
  const alvo = '8-12';

  it('sem registro, não opina', () => {
    const r = sugerirCarga({ ultimaSessao: [], repsAlvo: alvo });
    expect(r.acao).toBe('SEM_DADO');
    expect(r.cargaKg).toBeNull();
  });

  it('fechou o topo da faixa em todas as séries: sobe', () => {
    const r = sugerirCarga({
      ultimaSessao: [serie(60, 12), serie(60, 12), serie(60, 12)],
      repsAlvo: alvo,
    });
    expect(r.acao).toBe('AUMENTAR');
    expect(r.cargaKg).toBe(62.5);
    expect(r.variacaoKg).toBe(2.5);
    expect(r.porque).toContain('volte para 8');
  });

  /** Uma série abaixo do topo já segura o aumento — a faixa é para todas. */
  it('uma série abaixo do topo mantém', () => {
    const r = sugerirCarga({
      ultimaSessao: [serie(60, 12), serie(60, 12), serie(60, 10)],
      repsAlvo: alvo,
    });
    expect(r.acao).toBe('MANTER');
    expect(r.variacaoKg).toBe(0);
  });

  it('abaixo do piso da faixa: reduz', () => {
    const r = sugerirCarga({
      ultimaSessao: [serie(80, 8), serie(80, 6)],
      repsAlvo: alvo,
    });
    expect(r.acao).toBe('REDUZIR');
    expect(r.cargaKg).toBe(75);
    expect(r.variacaoKg).toBe(-5);
  });

  it('aquecimento não entra na conta', () => {
    const r = sugerirCarga({
      // O aquecimento de 20 kg × 20 reps não pode virar a carga de referência.
      ultimaSessao: [serie(20, 20, undefined, 'AQUECIMENTO'), serie(60, 12), serie(60, 12)],
      repsAlvo: alvo,
    });
    expect(r.acao).toBe('AUMENTAR');
    expect(r.cargaKg).toBe(62.5);
  });

  /*
    A guarda mais importante do módulo. Quem completou as repetições sentindo
    dor é exatamente quem não deve subir carga — e é quem a regra numérica
    sozinha mandaria subir.
  */
  describe('dor vem antes do número', () => {
    it('dor no treino segura o aumento mesmo com a faixa fechada', () => {
      const r = sugerirCarga({
        ultimaSessao: [serie(60, 12), serie(60, 12)],
        repsAlvo: alvo,
        teveDorNoTreino: true,
      });
      expect(r.acao).toBe('MANTER');
      expect(r.porque).toContain('dor');
    });

    it('e também segura a redução, para não mudar duas coisas de uma vez', () => {
      const r = sugerirCarga({
        ultimaSessao: [serie(80, 5)],
        repsAlvo: alvo,
        teveDorNoTreino: true,
      });
      expect(r.acao).toBe('MANTER');
    });
  });

  /*
    RPE 10 é falha muscular. Subir carga logo depois de falhar é como começa a
    maioria das lesões de sala — e quem falhou provavelmente completou as
    repetições, então é o caso que o número mandaria subir.
  */
  describe('esforço máximo', () => {
    it('faixa fechada com tudo em RPE 10 mantém', () => {
      const r = sugerirCarga({
        ultimaSessao: [serie(60, 12, 10), serie(60, 12, 10)],
        repsAlvo: alvo,
      });
      expect(r.acao).toBe('MANTER');
      expect(r.porque).toContain('falha');
    });

    it('com margem em alguma série, sobe normalmente', () => {
      const r = sugerirCarga({
        ultimaSessao: [serie(60, 12, 8), serie(60, 12, 10)],
        repsAlvo: alvo,
      });
      expect(r.acao).toBe('AUMENTAR');
    });

    /** Quem não preencheu RPE não deve ser tratado como quem foi à falha. */
    it('RPE ausente não bloqueia o aumento', () => {
      const r = sugerirCarga({
        ultimaSessao: [serie(60, 12), serie(60, 12)],
        repsAlvo: alvo,
      });
      expect(r.acao).toBe('AUMENTAR');
    });
  });

  describe('alvo que não é faixa', () => {
    it('não opina sobre "até a falha"', () => {
      const r = sugerirCarga({
        ultimaSessao: [serie(60, 15)],
        repsAlvo: 'até a falha',
      });
      expect(r.acao).toBe('SEM_DADO');
      expect(r.porque).toContain('a seu critério');
    });
  });

  describe('alvo de número exato', () => {
    it('bater o número sobe', () => {
      const r = sugerirCarga({ ultimaSessao: [serie(100, 10), serie(100, 10)], repsAlvo: '10' });
      expect(r.acao).toBe('AUMENTAR');
      expect(r.cargaKg).toBe(105);
    });

    it('ficar abaixo reduz', () => {
      const r = sugerirCarga({ ultimaSessao: [serie(100, 8)], repsAlvo: '10' });
      expect(r.acao).toBe('REDUZIR');
    });
  });
});
