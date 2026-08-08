import { describe, expect, it } from 'vitest';
import {
  LIMIARES_PADRAO,
  motivoDeAtencao,
  precisaDeAtencao,
  type LinhaDoRelatorio,
} from './relatorios';

const linha = (parcial: Partial<LinhaDoRelatorio> = {}): LinhaDoRelatorio => ({
  alunoId: 'a1',
  nome: 'Aluno',
  autorizou: { treino: true, evolucao: true, nutricao: false },
  treinosNoPeriodo: 8,
  ultimoTreinoEm: new Date().toISOString(),
  diasSemTreinar: 2,
  pesoInicialKg: null,
  pesoAtualKg: null,
  variacaoPesoKg: null,
  adesaoDietaPercentual: null,
  diasSemCheckin: 1,
  ...parcial,
});

describe('quem precisa de atenção', () => {
  it('aluno em dia não aparece', () => {
    expect(motivoDeAtencao(linha())).toBeNull();
    expect(precisaDeAtencao(linha())).toBe(false);
  });

  /** Quem nunca começou precisa de ajuda para começar — é o caso mais urgente. */
  it('nunca treinou é o motivo mais grave, e vem primeiro', () => {
    const r = motivoDeAtencao(linha({ diasSemTreinar: null, treinosNoPeriodo: 0 }));
    expect(r).toBe('NUNCA_TREINOU');
  });

  it('sumiu do treino a partir do limiar', () => {
    expect(motivoDeAtencao(linha({ diasSemTreinar: 13 }))).toBeNull();
    expect(motivoDeAtencao(linha({ diasSemTreinar: 14 }))).toBe('SUMIU_DO_TREINO');
  });

  /*
    O check-in some antes do treino. Quem para de registrar costuma estar a
    caminho de parar de aparecer, e chegar cedo é o ponto de um alerta de
    adesão.
  */
  it('parou de registrar acusa mais cedo que sumir do treino', () => {
    // Treinando em dia, mas sem check-in há 8 dias.
    expect(motivoDeAtencao(linha({ diasSemCheckin: 8 }))).toBe('PAROU_DE_REGISTRAR');
    expect(motivoDeAtencao(linha({ diasSemCheckin: 6 }))).toBeNull();
  });

  /*
    Quem nunca usou o recurso não "parou". Marcá-lo de vermelho faria o
    profissional cobrar algo que talvez nem tenha sido apresentado.
  */
  it('quem nunca fez check-in não conta como quem parou', () => {
    expect(motivoDeAtencao(linha({ diasSemCheckin: null }))).toBeNull();
  });

  describe('consentimento', () => {
    it('sem autorização de treino, o treino não gera alerta', () => {
      const r = motivoDeAtencao(
        linha({
          autorizou: { treino: false, evolucao: true, nutricao: false },
          diasSemTreinar: 60,
        }),
      );
      expect(r).toBeNull();
    });

    it('sem autorização de evolução, o check-in não gera alerta', () => {
      const r = motivoDeAtencao(
        linha({
          autorizou: { treino: true, evolucao: false, nutricao: false },
          diasSemCheckin: 90,
        }),
      );
      expect(r).toBeNull();
    });
  });

  describe('limiar configurável', () => {
    it('personal mais exigente enxerga mais cedo', () => {
      const apertado = { diasSemTreinar: 5, diasSemCheckin: 3 };
      expect(motivoDeAtencao(linha({ diasSemTreinar: 6 }), apertado)).toBe('SUMIU_DO_TREINO');
      // Com o padrão, 6 dias sem treinar ainda não acusa.
      expect(motivoDeAtencao(linha({ diasSemTreinar: 6 }), LIMIARES_PADRAO)).toBeNull();
    });

    it('personal mais folgado enxerga mais tarde', () => {
      const folgado = { diasSemTreinar: 30, diasSemCheckin: 21 };
      expect(motivoDeAtencao(linha({ diasSemTreinar: 20, diasSemCheckin: 20 }), folgado)).toBeNull();
    });
  });
});
