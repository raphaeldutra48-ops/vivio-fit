import { describe, expect, it } from 'vitest';
import {
  Classificacao,
  EscopoMarcador,
  ForcaDaFonte,
  MARCADORES,
  REFERENCIAS,
  classificarMarcador,
  faixaPara,
  marcadoresDoEscopo,
  referenciaDe,
  registrarExameSchema,
  type Marcador,
} from './exames';

/**
 * A regra que este arquivo protege: **nada vira CRITICO por causa da faixa
 * funcional**. Só sair da faixa do laboratório carimba vermelho.
 *
 * Sem isso, uma fonte de consenso funcional pintaria de vermelho um exame que
 * o laboratório considera normal — e o paciente veria o vermelho, não a nota
 * de rodapé.
 */

describe('classificarMarcador', () => {
  it('dentro da faixa funcional é Ótimo', () => {
    expect(classificarMarcador('GLICOSE_JEJUM', 82, 'M').classificacao).toBe(Classificacao.OTIMO);
  });

  /** O caso que justifica o produto inteiro. */
  it('normal para o laboratório e fora do ideal é Atenção, não Crítico', () => {
    // 34,5 ng/mL: acima dos 30 que o laudo pede, abaixo dos 40 de alvo.
    const r = classificarMarcador('VITAMINA_D', 34.5, 'F');

    expect(r.classificacao).toBe(Classificacao.ATENCAO);
    expect(r.laboratorial.min).toBe(30);
    expect(r.funcional.min).toBe(40);
  });

  it('fora da faixa do laboratório é Crítico', () => {
    expect(classificarMarcador('VITAMINA_D', 18, 'F').classificacao).toBe(Classificacao.CRITICO);
    expect(classificarMarcador('GLICOSE_JEJUM', 118, 'M').classificacao).toBe(
      Classificacao.CRITICO,
    );
  });

  /**
   * TFG 67 é G2 pela KDIGO — redução leve, dentro do que o laudo aceita.
   * Carimbá-la de Crítico assusta o paciente por um achado que não é doença.
   */
  it('TFG de 67 é Atenção, não Crítico', () => {
    expect(classificarMarcador('TFG_ESTIMADA', 67, 'M').classificacao).toBe(Classificacao.ATENCAO);
    expect(classificarMarcador('TFG_ESTIMADA', 55, 'M').classificacao).toBe(Classificacao.CRITICO);
    expect(classificarMarcador('TFG_ESTIMADA', 95, 'M').classificacao).toBe(Classificacao.OTIMO);
  });

  /**
   * Insulina baixa com boa sensibilidade não é achado. A tela que serviu de
   * referência marcava 2,3 como Crítico e o HOMA-IR 0,5 como Ótimo, na mesma
   * página — dois selos contraditórios sobre a mesma fisiologia.
   */
  it('insulina baixa não vira Crítico enquanto estiver dentro do laudo', () => {
    expect(classificarMarcador('INSULINA_JEJUM', 2.8, 'M').classificacao).toBe(Classificacao.OTIMO);
    expect(classificarMarcador('HOMA_IR', 0.5, 'M').classificacao).toBe(Classificacao.OTIMO);
  });

  it('respeita as faixas por sexo', () => {
    // HDL 45: dentro do laudo masculino (≥40), fora do feminino (≥48).
    expect(classificarMarcador('HDL', 45, 'M').classificacao).toBe(Classificacao.ATENCAO);
    expect(classificarMarcador('HDL', 45, 'F').classificacao).toBe(Classificacao.CRITICO);
  });

  it('faixa aberta de um lado não inventa o outro limite', () => {
    // LDL só tem teto: qualquer valor baixo é ótimo.
    expect(classificarMarcador('LDL', 55, 'M').classificacao).toBe(Classificacao.OTIMO);
    expect(classificarMarcador('LDL', 108, 'M').classificacao).toBe(Classificacao.ATENCAO);
    expect(classificarMarcador('LDL', 160, 'M').classificacao).toBe(Classificacao.CRITICO);
  });

  it('o limite é inclusivo nas duas pontas', () => {
    expect(classificarMarcador('HBA1C', 5.4, 'M').classificacao).toBe(Classificacao.OTIMO);
    expect(classificarMarcador('HBA1C', 5.7, 'M').classificacao).toBe(Classificacao.ATENCAO);
  });
});

describe('a tabela de referências', () => {
  /** A faixa funcional dentro da laboratorial é o que sustenta a regra. */
  it('toda faixa funcional cabe dentro da laboratorial', () => {
    for (const marcador of MARCADORES) {
      for (const sexo of ['M', 'F'] as const) {
        const ref = referenciaDe(marcador);
        const lab = faixaPara(ref.laboratorial, sexo);
        const fun = faixaPara(ref.funcional, sexo);

        if (lab.min !== undefined && fun.min !== undefined) {
          expect(fun.min, `${marcador} (${sexo}): mínimo funcional`).toBeGreaterThanOrEqual(lab.min);
        }
        if (lab.max !== undefined && fun.max !== undefined) {
          expect(fun.max, `${marcador} (${sexo}): máximo funcional`).toBeLessThanOrEqual(lab.max);
        }
      }
    }
  });

  it('nenhuma faixa é vazia dos dois lados', () => {
    for (const marcador of MARCADORES) {
      for (const sexo of ['M', 'F'] as const) {
        const lab = faixaPara(referenciaDe(marcador).laboratorial, sexo);
        expect(
          lab.min !== undefined || lab.max !== undefined,
          `${marcador} (${sexo}) sem nenhum limite`,
        ).toBe(true);
      }
    }
  });

  it('todo marcador declara as duas fontes, com força', () => {
    for (const marcador of MARCADORES) {
      const ref = referenciaDe(marcador);
      for (const fonte of [ref.fonteLaboratorial, ref.fonteFuncional]) {
        expect(fonte.organizacao.length, marcador).toBeGreaterThan(2);
        expect(Object.values(ForcaDaFonte)).toContain(fonte.forca);
      }
    }
  });

  /**
   * A etiqueta de força existe para isto: consenso funcional não pode ser a
   * fonte da faixa do LABORATÓRIO, que é a única que carimba vermelho.
   * Onde não há diretriz para a faixa do laudo, o marcador precisa de revisão.
   */
  it('lista os marcadores cuja faixa laboratorial não vem de diretriz', () => {
    const semDiretriz = MARCADORES.filter(
      (m) => referenciaDe(m).fonteLaboratorial.forca !== ForcaDaFonte.DIRETRIZ,
    );

    // Congelado de propósito: crescer esta lista tem de ser decisão consciente.
    expect(semDiretriz.sort()).toEqual(
      (['FERRITINA', 'HOMA_IR', 'INSULINA_JEJUM', 'PCR_US', 'VITAMINA_B12'] as Marcador[]).sort(),
    );
  });
});

describe('escopo por papel', () => {
  it('o nutricionista vê o que a avaliação nutricional usa', () => {
    const nutri = marcadoresDoEscopo(EscopoMarcador.NUTRICIONAL);

    expect(nutri).toContain('FERRITINA');
    expect(nutri).toContain('VITAMINA_D');
    expect(nutri).toContain('TFG_ESTIMADA');
    expect(nutri).not.toContain('TSH');
    expect(nutri).not.toContain('PROLACTINA');
  });

  it('o que é médico exige interpretação médica', () => {
    expect(marcadoresDoEscopo(EscopoMarcador.MEDICO)).toEqual([
      'TSH',
      'T4_LIVRE',
      'DHEA_S',
      'PROLACTINA',
    ]);
  });

  it('os dois escopos somados dão a tabela inteira, sem sobra', () => {
    const nutri = marcadoresDoEscopo(EscopoMarcador.NUTRICIONAL);
    const medico = marcadoresDoEscopo(EscopoMarcador.MEDICO);

    expect(nutri.length + medico.length).toBe(MARCADORES.length);
    expect(marcadoresDoEscopo('TODOS')).toHaveLength(MARCADORES.length);
  });
});

describe('registrarExameSchema', () => {
  const valido = {
    laboratorio: 'Emilio Ribas Medicina Diagnóstica',
    dataColeta: '2026-07-25',
    sexo: 'F',
    resultados: [
      { marcador: 'VITAMINA_D', valor: 34.5 },
      { marcador: 'TFG_ESTIMADA', valor: 67 },
    ],
  };

  it('aceita um exame completo', () => {
    expect(registrarExameSchema.safeParse(valido).success).toBe(true);
  });

  it('recusa marcador que não está na tabela', () => {
    const r = registrarExameSchema.safeParse({
      ...valido,
      resultados: [{ marcador: 'COLESTEROL_MAGICO', valor: 1 }],
    });
    expect(r.success).toBe(false);
  });

  it('recusa exame sem nenhum resultado', () => {
    expect(registrarExameSchema.safeParse({ ...valido, resultados: [] }).success).toBe(false);
  });

  it('recusa valor que não é número finito', () => {
    const r = registrarExameSchema.safeParse({
      ...valido,
      resultados: [{ marcador: 'VITAMINA_D', valor: Number.NaN }],
    });
    expect(r.success).toBe(false);
  });
});

describe('REFERENCIAS como fonte da página de Metodologia', () => {
  /**
   * A Metodologia é gerada desta tabela, não escrita à mão — página escrita
   * separado diverge da regra que roda, que é o defeito que já apareceu na
   * equação de composição corporal.
   */
  it('dá para agrupar as fontes distintas para montar a página', () => {
    const fontes = new Map<string, { organizacao: string; usadoEm: string[] }>();

    for (const marcador of MARCADORES) {
      const ref = referenciaDe(marcador);
      for (const fonte of [ref.fonteLaboratorial, ref.fonteFuncional]) {
        const atual = fontes.get(fonte.sigla) ?? { organizacao: fonte.organizacao, usadoEm: [] };
        if (!atual.usadoEm.includes(ref.rotulo)) atual.usadoEm.push(ref.rotulo);
        fontes.set(fonte.sigla, atual);
      }
    }

    expect(fontes.get('ADA')?.usadoEm).toEqual([
      'Glicose de jejum',
      'Hemoglobina glicada (HbA1c)',
    ]);
    expect(fontes.get('ATA')?.usadoEm).toEqual(['TSH ultrassensível', 'T4 livre (tiroxina livre)']);
    expect(fontes.size).toBeGreaterThan(5);
  });

  it('todo marcador tem rótulo e sistema para a tela agrupar', () => {
    for (const marcador of MARCADORES) {
      const ref = REFERENCIAS[marcador];
      expect(ref.rotulo.length, marcador).toBeGreaterThan(2);
      expect(ref.sistema, marcador).toBeTruthy();
    }
  });
});
