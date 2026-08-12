import { describe, expect, it } from 'vitest';
import {
  MET_MUSCULACAO,
  MET_POR_ATIVIDADE,
  TipoCardio,
  estimarCalorias,
  metDe,
  registrarCardioSchema,
} from './cardio';

describe('estimarCalorias', () => {
  /*
    A decisão mais importante do módulo. Sem peso não existe estimativa —
    existe chute com aparência de número, e número na tela é lido como
    verdade. Travessão ensina que falta registrar a medida.
  */
  it('devolve null sem peso, em vez de inventar', () => {
    expect(estimarCalorias(8.3, 30, null)).toBeNull();
    expect(estimarCalorias(8.3, 30, 0)).toBeNull();
  });

  it('devolve null para duração zero ou negativa', () => {
    expect(estimarCalorias(8.3, 0, 70)).toBeNull();
    expect(estimarCalorias(8.3, -10, 70)).toBeNull();
  });

  /*
    Fórmula do ACSM: kcal/min = MET × 3,5 × peso / 200.
    Corrida moderada (8,3), 30 min, 70 kg → 8,3 × 3,5 × 70 / 200 = 10,17 kcal/min
    × 30 = 305 → arredondado para 310.
  */
  it('segue a fórmula do ACSM', () => {
    expect(estimarCalorias(8.3, 30, 70)).toBe(310);
  });

  /*
    Arredondar para dezenas é proposital: a margem real é de 20% a 30%, e
    "437 kcal" finge uma precisão que a fisiologia não tem.
  */
  it('arredonda para dezenas', () => {
    for (const kcal of [
      estimarCalorias(5, 45, 82),
      estimarCalorias(11, 20, 63),
      estimarCalorias(3.5, 60, 91),
    ]) {
      expect(kcal).not.toBeNull();
      expect(kcal! % 10).toBe(0);
    }
  });

  it('mais peso gasta mais, mesmo esforço', () => {
    const leve = estimarCalorias(6, 30, 60)!;
    const pesado = estimarCalorias(6, 30, 90)!;
    expect(pesado).toBeGreaterThan(leve);
  });
});

describe('metDe', () => {
  it('a intensidade muda o gasto dentro da mesma atividade', () => {
    expect(metDe('CORRIDA', 'INTENSA')).toBeGreaterThan(metDe('CORRIDA', 'LEVE'));
  });

  /*
    O ponto de a tabela ser por tipo E intensidade: correr devagar gasta menos
    que pedalar forte. Um MET por atividade apagaria isso.
  */
  it('correr leve gasta menos que pedalar forte', () => {
    expect(metDe('CORRIDA', 'LEVE')).toBeLessThan(metDe('BICICLETA', 'INTENSA'));
  });

  it('toda atividade tem os três níveis, em ordem crescente', () => {
    for (const tipo of Object.values(TipoCardio)) {
      const { LEVE, MODERADA, INTENSA } = MET_POR_ATIVIDADE[tipo];
      expect(LEVE).toBeLessThan(MODERADA);
      expect(MODERADA).toBeLessThanOrEqual(INTENSA);
    }
  });

  /* Nenhum valor fora da faixa fisiológica plausível do Compendium. */
  it('os METs ficam numa faixa que existe na vida real', () => {
    for (const tipo of Object.values(TipoCardio)) {
      for (const met of Object.values(MET_POR_ATIVIDADE[tipo])) {
        expect(met).toBeGreaterThanOrEqual(2);
        expect(met).toBeLessThanOrEqual(14);
      }
    }
  });

  /* Musculação gasta menos que corrida — se inverter, algo está trocado. */
  it('musculação moderada gasta menos que corrida moderada', () => {
    expect(MET_MUSCULACAO.MODERADA).toBeLessThan(metDe('CORRIDA', 'MODERADA'));
  });
});

describe('registrarCardioSchema', () => {
  const base = { tipo: 'CORRIDA', duracaoMin: 30, data: '2026-08-12' };

  it('aceita o mínimo e assume intensidade moderada', () => {
    const r = registrarCardioSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.intensidade).toBe('MODERADA');
  });

  it('recusa duração zero — atividade de zero minuto não aconteceu', () => {
    expect(registrarCardioSchema.safeParse({ ...base, duracaoMin: 0 }).success).toBe(false);
  });

  it('recusa data em outro formato', () => {
    expect(registrarCardioSchema.safeParse({ ...base, data: '12/08/2026' }).success).toBe(false);
  });

  /* Nem toda esteira mostra distância, e nem todo mundo olha. */
  it('distância é opcional', () => {
    expect(registrarCardioSchema.safeParse(base).success).toBe(true);
    expect(registrarCardioSchema.safeParse({ ...base, distanciaKm: 5.2 }).success).toBe(true);
  });
});
