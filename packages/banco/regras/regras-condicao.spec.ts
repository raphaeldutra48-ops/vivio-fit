import {
  GravidadeCondicao,
  Papel,
  RegiaoCorpo,
  SeveridadeAlerta,
  TipoCondicao,
} from '@vivio/contracts';
import { describe, expect, it } from 'vitest';
import { CUIDADO_POR_REGIAO, alertasDaCondicao, type CondicaoParaRegra } from './regras-condicao';

/**
 * A metade do diferencial que não vem de exame: o fato clínico que muda a
 * conduta de quem prescreve treino e dieta. A especificação nomeia o caso
 * central — condição ativa do tipo LESÃO com região do corpo dispara alerta
 * para o PERSONAL.
 */

const condicao = (mudanca: Partial<CondicaoParaRegra> = {}): CondicaoParaRegra => ({
  tipo: TipoCondicao.LESAO,
  descricao: 'Tendinopatia do supraespinhal à direita',
  regiao: RegiaoCorpo.OMBRO,
  gravidade: GravidadeCondicao.MODERADA,
  ...mudanca,
});

const para = (papel: Papel) => (a: { papelDestino: string }) => a.papelDestino === papel;

describe('lesão com região', () => {
  /** O caso que a especificação nomeia. */
  it('avisa o personal com orientação específica da região', () => {
    const alertas = alertasDaCondicao(condicao());
    const doPersonal = alertas.find(para(Papel.PERSONAL))!;

    expect(doPersonal.titulo).toContain('ombro');
    expect(doPersonal.orientacao).toContain('Tendinopatia do supraespinhal');
    expect(doPersonal.orientacao).toMatch(/acima da cabeça/);
  });

  /**
   * Genérico não serve: "cuidado com o joelho" não ajuda ninguém a montar
   * treino. Cada região precisa dizer que movimento evitar.
   */
  it('cada região tem orientação própria, e nenhuma é genérica', () => {
    const textos = new Set<string>();

    for (const regiao of Object.values(RegiaoCorpo)) {
      const alertas = alertasDaCondicao(condicao({ regiao }));
      const doPersonal = alertas.find(para(Papel.PERSONAL))!;

      expect(doPersonal, regiao).toBeTruthy();
      expect(CUIDADO_POR_REGIAO[regiao].length, regiao).toBeGreaterThan(60);
      textos.add(CUIDADO_POR_REGIAO[regiao]);
    }

    // Nenhuma repetida: texto colado entre regiões é sinal de preguiça.
    expect(textos.size).toBe(Object.values(RegiaoCorpo).length);
  });

  it('joelho fala de impacto e agachamento; lombar fala de carga axial', () => {
    const joelho = alertasDaCondicao(condicao({ regiao: RegiaoCorpo.JOELHO })).find(
      para(Papel.PERSONAL),
    )!;
    const lombar = alertasDaCondicao(condicao({ regiao: RegiaoCorpo.COLUNA_LOMBAR })).find(
      para(Papel.PERSONAL),
    )!;

    expect(joelho.orientacao).toMatch(/impacto/i);
    expect(lombar.orientacao).toMatch(/carga axial/i);
  });

  it('o médico é avisado para dar alta quando for o caso', () => {
    const doMedico = alertasDaCondicao(condicao()).find(para(Papel.MEDICO))!;
    expect(doMedico.orientacao).toMatch(/alta/);
  });

  /** Sem região não há o que dizer de útil — melhor nenhum alerta que um vago. */
  it('lesão sem região não gera alerta nenhum', () => {
    expect(alertasDaCondicao(condicao({ regiao: null }))).toEqual([]);
  });

  it('gravidade grave sobe a severidade', () => {
    const moderada = alertasDaCondicao(condicao())[0]!;
    const grave = alertasDaCondicao(condicao({ gravidade: GravidadeCondicao.GRAVE }))[0]!;

    expect(moderada.severidade).toBe(SeveridadeAlerta.MEDIA);
    expect(grave.severidade).toBe(SeveridadeAlerta.ALTA);
  });
});

describe('cirurgia recente', () => {
  it('acrescenta a espera por liberação médica', () => {
    const alertas = alertasDaCondicao(
      condicao({ tipo: TipoCondicao.CIRURGIA_RECENTE, regiao: RegiaoCorpo.JOELHO }),
    );
    const doPersonal = alertas.find(para(Papel.PERSONAL))!;

    expect(doPersonal.orientacao).toMatch(/liberação médica/);
    expect(alertas[0]!.regra).toBe('cirurgia-regiao');
  });
});

describe('alergia alimentar', () => {
  const alergia = condicao({
    tipo: TipoCondicao.ALERGIA_ALIMENTAR,
    descricao: 'Alergia a amendoim',
    regiao: null,
  });

  it('avisa o nutricionista sobre o plano', () => {
    const doNutri = alertasDaCondicao(alergia).find(para(Papel.NUTRICIONISTA))!;
    expect(doNutri.orientacao).toMatch(/traços/);
  });

  /** O personal indica suplemento — e é aí que a alergia costuma escapar. */
  it('avisa o personal sobre suplemento, que é por onde escapa', () => {
    const doPersonal = alertasDaCondicao(alergia).find(para(Papel.PERSONAL))!;
    expect(doPersonal.orientacao).toMatch(/suplemento/i);
  });
});

describe('outros tipos', () => {
  it('restrição e intolerância avisam só o nutricionista', () => {
    for (const tipo of [TipoCondicao.RESTRICAO_ALIMENTAR, TipoCondicao.INTOLERANCIA]) {
      const alertas = alertasDaCondicao(condicao({ tipo, regiao: null }));
      expect(alertas).toHaveLength(1);
      expect(alertas[0]!.papelDestino).toBe(Papel.NUTRICIONISTA);
    }
  });

  it('gestação avisa os três', () => {
    const alertas = alertasDaCondicao(condicao({ tipo: TipoCondicao.GESTACAO, regiao: null }));

    expect(alertas.map((a) => a.papelDestino).sort()).toEqual(
      [Papel.MEDICO, Papel.NUTRICIONISTA, Papel.PERSONAL].sort(),
    );
    expect(alertas.find(para(Papel.PERSONAL))!.orientacao).toMatch(/Valsalva/);
  });

  it('medicação contínua avisa nutricionista e médico', () => {
    const alertas = alertasDaCondicao(
      condicao({ tipo: TipoCondicao.MEDICACAO_CONTINUA, regiao: null }),
    );
    expect(alertas.map((a) => a.papelDestino).sort()).toEqual(
      [Papel.MEDICO, Papel.NUTRICIONISTA].sort(),
    );
  });

  it('doença crônica avisa os três, cada um com o que é dele', () => {
    const alertas = alertasDaCondicao(
      condicao({ tipo: TipoCondicao.DOENCA_CRONICA, regiao: null }),
    );
    expect(alertas).toHaveLength(3);
    expect(alertas.find(para(Papel.PERSONAL))!.orientacao).toMatch(/intensidades/);
    expect(alertas.find(para(Papel.NUTRICIONISTA))!.orientacao).toMatch(/plano alimentar/);
  });
});

describe('formato do alerta gerado', () => {
  it('não carrega marcador de exame — a origem é a condição', () => {
    for (const a of alertasDaCondicao(condicao())) {
      expect(a.marcador).toBeNull();
    }
  });

  it('nenhum alerta vai para o aluno', () => {
    for (const tipo of Object.values(TipoCondicao)) {
      const alertas = alertasDaCondicao(condicao({ tipo, regiao: RegiaoCorpo.JOELHO }));
      for (const a of alertas) {
        expect([Papel.PERSONAL, Papel.NUTRICIONISTA, Papel.MEDICO]).toContain(a.papelDestino);
      }
    }
  });

  it('todo aviso tem título e orientação de verdade', () => {
    for (const tipo of Object.values(TipoCondicao)) {
      for (const a of alertasDaCondicao(condicao({ tipo, regiao: RegiaoCorpo.OMBRO }))) {
        expect(a.titulo.length, tipo).toBeGreaterThan(8);
        expect(a.orientacao.length, tipo).toBeGreaterThan(40);
      }
    }
  });
});
