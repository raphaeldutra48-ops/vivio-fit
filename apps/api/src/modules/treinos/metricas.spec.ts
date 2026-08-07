import { describe, expect, it } from 'vitest';
import {
  estimar1rm,
  marcasDe,
  recordesBatidos,
  seriesDeTrabalho,
  volumeKg,
  type SerieParaMetrica,
} from './metricas';

const serie = (cargaKg: number, repsFeitas: number, tipo = 'NORMAL'): SerieParaMetrica => ({
  cargaKg,
  repsFeitas,
  tipo,
});

describe('métricas de treino', () => {
  describe('séries de trabalho', () => {
    /*
      A regra já valia no gráfico de progressão. Repeti-la aqui é o que impede
      o mesmo treino ter dois volumes diferentes em duas telas.
    */
    it('aquecimento não conta', () => {
      const series = [serie(40, 10, 'AQUECIMENTO'), serie(80, 8), serie(80, 6)];
      expect(seriesDeTrabalho(series)).toHaveLength(2);
    });

    /** Zero pareceria falha de registro; um treino leve registrado é melhor. */
    it('quando só há aquecimento, ele passa a contar', () => {
      const series = [serie(40, 10, 'AQUECIMENTO'), serie(40, 10, 'AQUECIMENTO')];
      expect(seriesDeTrabalho(series)).toHaveLength(2);
      expect(volumeKg(series)).toBe(800);
    });
  });

  describe('volume', () => {
    it('soma carga × repetições das séries de trabalho', () => {
      expect(volumeKg([serie(100, 10), serie(100, 8)])).toBe(1800);
    });

    it('o aquecimento não infla o número', () => {
      const comAquecimento = [serie(40, 15, 'AQUECIMENTO'), serie(100, 10)];
      expect(volumeKg(comAquecimento)).toBe(1000);
    });

    it('carga fracionada não vira dízima', () => {
      expect(volumeKg([serie(22.5, 12)])).toBe(270);
    });

    it('sem série nenhuma é zero, não erro', () => {
      expect(volumeKg([])).toBe(0);
    });
  });

  describe('1RM estimado (Epley)', () => {
    it('uma repetição é a própria carga', () => {
      expect(estimar1rm(120, 1)).toBe(120);
    });

    it('mais repetições estimam mais que a carga usada', () => {
      // 100 × (1 + 10/30) = 133.3
      expect(estimar1rm(100, 10)).toBeCloseTo(133.3, 1);
    });
  });

  describe('marcas', () => {
    /*
      O recorde de volume é o da MELHOR SÉRIE, não o da sessão. Somado, ele
      premiaria quem faz mais séries — e mais séries não é sinal de força.
    */
    it('volume máximo é de uma série, não a soma', () => {
      const m = marcasDe([serie(100, 10), serie(80, 10)])!;
      expect(m.volumeMaximoSerieKg).toBe(1000);
      expect(m.cargaMaximaKg).toBe(100);
    });

    it('sem série de trabalho, não há marca', () => {
      expect(marcasDe([])).toBeNull();
    });
  });

  describe('recordes batidos', () => {
    const antes = { cargaMaximaKg: 100, volumeMaximoSerieKg: 1000, melhor1rmKg: 133.3 };

    it('carga maior vira recorde de PESO', () => {
      const hoje = { cargaMaximaKg: 105, volumeMaximoSerieKg: 840, melhor1rmKg: 133 };
      const r = recordesBatidos(hoje, antes);
      expect(r).toHaveLength(1);
      expect(r[0]).toMatchObject({ tipo: 'PESO', valor: 105, anterior: 100 });
    });

    /*
      Empate não é recorde. Se fosse, todo treino de manutenção viraria três
      medalhas e o aviso perderia o sentido em duas semanas.
    */
    it('empatar não conta', () => {
      expect(recordesBatidos(antes, antes)).toEqual([]);
    });

    it('pode bater os três de uma vez', () => {
      const hoje = { cargaMaximaKg: 110, volumeMaximoSerieKg: 1100, melhor1rmKg: 150 };
      expect(recordesBatidos(hoje, antes).map((r) => r.tipo)).toEqual([
        'PESO',
        'VOLUME',
        'UM_RM',
      ]);
    });

    /** Encher a tela de medalhas no dia em que a pessoa só experimentou o aparelho vira ruído. */
    it('primeira vez no exercício não gera recorde', () => {
      const hoje = { cargaMaximaKg: 200, volumeMaximoSerieKg: 2000, melhor1rmKg: 260 };
      expect(recordesBatidos(hoje, null)).toEqual([]);
    });

    it('piorar não gera nada', () => {
      const hoje = { cargaMaximaKg: 80, volumeMaximoSerieKg: 800, melhor1rmKg: 100 };
      expect(recordesBatidos(hoje, antes)).toEqual([]);
    });
  });
});
