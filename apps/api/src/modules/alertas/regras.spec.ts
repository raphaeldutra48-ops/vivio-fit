import { Classificacao, Papel, SeveridadeAlerta, referenciaDe } from '@vivio/contracts';
import { describe, expect, it } from 'vitest';
import { podeVerMarcador } from '../exames/escopo';
import { REGRAS, alertasDoExame, ladoDoValor, severidadeDe } from './regras';

/**
 * O teste mais importante deste arquivo é o de vazamento: um alerta destinado
 * a quem não pode ver o marcador não pode citar o marcador. Se citasse, o
 * alerta seria um caminho indireto para mostrar o exame a quem a especificação
 * diz que não pode vê-lo.
 */

const para = (papel: Papel) => (a: { papelDestino: string }) => a.papelDestino === papel;

describe('privacidade dos alertas', () => {
  /** A regra dura. Vale para as regras de hoje e para as de amanhã. */
  it('alerta não cita o marcador para quem não pode vê-lo', () => {
    for (const regra of REGRAS) {
      const rotulo = referenciaDe(regra.marcador).rotulo;

      for (const aviso of regra.avisos) {
        if (podeVerMarcador(aviso.papel, regra.marcador)) continue;

        const texto = `${aviso.titulo} ${aviso.orientacao}`;
        expect(texto, `${regra.id} → ${aviso.papel}`).not.toContain(rotulo);
        expect(texto, `${regra.id} → ${aviso.papel}`).not.toContain(regra.marcador);
      }
    }
  });

  /** O personal não lê marcador nenhum, então nenhum texto dele pode citar um. */
  it('nenhum texto do personal cita marcador de exame', () => {
    const doPersonal = REGRAS.flatMap((r) => r.avisos.filter((a) => a.papel === Papel.PERSONAL));
    expect(doPersonal.length).toBeGreaterThan(0);

    for (const aviso of doPersonal) {
      const texto = `${aviso.titulo} ${aviso.orientacao}`;
      for (const regra of REGRAS) {
        expect(texto).not.toContain(referenciaDe(regra.marcador).rotulo);
      }
      // Nenhum número solto: valor de exame nunca vai para o personal.
      expect(texto).not.toMatch(/\d+[,.]?\d*\s*(mg\/dL|ng\/mL|µUI\/mL|pg\/mL|mL\/min)/);
    }
  });

  it('nenhum alerta é destinado ao aluno — orientação passa pelo profissional', () => {
    for (const regra of REGRAS) {
      for (const aviso of regra.avisos) {
        expect([Papel.PERSONAL, Papel.NUTRICIONISTA, Papel.MEDICO]).toContain(aviso.papel);
      }
    }
  });

  it('todo aviso tem título e orientação de verdade', () => {
    for (const regra of REGRAS) {
      expect(regra.avisos.length, regra.id).toBeGreaterThan(0);
      for (const aviso of regra.avisos) {
        expect(aviso.titulo.length, regra.id).toBeGreaterThan(8);
        expect(aviso.orientacao.length, regra.id).toBeGreaterThan(30);
      }
    }
  });

  it('cada regra tem id único — a dedupe depende disso', () => {
    const ids = REGRAS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('ladoDoValor', () => {
  it('distingue abaixo, acima e dentro da faixa funcional', () => {
    // TFG funcional: a partir de 90.
    expect(ladoDoValor('TFG_ESTIMADA', 67, 'F')).toBe('ABAIXO');
    expect(ladoDoValor('TFG_ESTIMADA', 95, 'F')).toBe('DENTRO');
    // PCR funcional: até 1.
    expect(ladoDoValor('PCR_US', 2.5, 'F')).toBe('ACIMA');
    expect(ladoDoValor('PCR_US', 0.4, 'F')).toBe('DENTRO');
  });
});

describe('severidadeDe', () => {
  it('crítico muda a conduta agora; atenção ajusta na revisão', () => {
    expect(severidadeDe(Classificacao.CRITICO)).toBe(SeveridadeAlerta.ALTA);
    expect(severidadeDe(Classificacao.ATENCAO)).toBe(SeveridadeAlerta.MEDIA);
  });
});

describe('alertasDoExame', () => {
  /** O caso que resume o produto. */
  it('TFG reduzida avisa os três, cada um com o que é dele', () => {
    const alertas = alertasDoExame(
      [{ marcador: 'TFG_ESTIMADA', valor: 67, classificacao: Classificacao.ATENCAO }],
      'F',
    );

    expect(alertas).toHaveLength(3);

    const doPersonal = alertas.find(para(Papel.PERSONAL))!;
    expect(doPersonal.orientacao).toMatch(/creatina/);
    expect(doPersonal.orientacao).not.toMatch(/67|filtração/);
    expect(doPersonal.severidade).toBe(SeveridadeAlerta.MEDIA);

    expect(alertas.find(para(Papel.NUTRICIONISTA))!.orientacao).toMatch(/proteína/);
    expect(alertas.find(para(Papel.MEDICO))).toBeTruthy();
  });

  /**
   * O nutricionista não pode ler TSH e mesmo assim é avisado — sem o nome do
   * marcador. É o desenho inteiro num caso só.
   */
  it('TSH crítico avisa o nutricionista sem dizer que é TSH', () => {
    const alertas = alertasDoExame(
      [{ marcador: 'TSH', valor: 8.4, classificacao: Classificacao.CRITICO }],
      'F',
    );

    const doNutri = alertas.find(para(Papel.NUTRICIONISTA))!;
    expect(doNutri.orientacao).toMatch(/metabólica/);
    expect(`${doNutri.titulo} ${doNutri.orientacao}`).not.toContain('TSH');
    expect(doNutri.severidade).toBe(SeveridadeAlerta.ALTA);

    // O médico recebe o achado com nome e sobrenome.
    expect(alertas.find(para(Papel.MEDICO))!.titulo).toContain('TSH');
  });

  it('respeita o lado da faixa — TFG alta não dispara alerta renal', () => {
    const alertas = alertasDoExame(
      [{ marcador: 'TFG_ESTIMADA', valor: 130, classificacao: Classificacao.OTIMO }],
      'F',
    );
    expect(alertas).toHaveLength(0);
  });

  it('marcador dentro do alvo não gera alerta nenhum', () => {
    const alertas = alertasDoExame(
      [
        { marcador: 'FERRITINA', valor: 80, classificacao: Classificacao.OTIMO },
        { marcador: 'VITAMINA_D', valor: 50, classificacao: Classificacao.OTIMO },
      ],
      'F',
    );
    expect(alertas).toEqual([]);
  });

  it('um exame com vários achados gera os alertas de todos eles', () => {
    const alertas = alertasDoExame(
      [
        { marcador: 'FERRITINA', valor: 22, classificacao: Classificacao.ATENCAO },
        { marcador: 'VITAMINA_D', valor: 34.5, classificacao: Classificacao.ATENCAO },
        { marcador: 'GLICOSE_JEJUM', valor: 118, classificacao: Classificacao.CRITICO },
      ],
      'F',
    );

    expect(alertas.map((a) => a.regra).sort()).toEqual([
      'ferro-baixo',
      'ferro-baixo',
      'glicemia-alterada',
      'glicemia-alterada',
      'vitamina-d-baixa',
      'vitamina-d-baixa',
    ]);
    // A glicemia crítica sobe a severidade só do alerta dela.
    const glicemia = alertas.filter((a) => a.regra === 'glicemia-alterada');
    expect(glicemia.every((a) => a.severidade === SeveridadeAlerta.ALTA)).toBe(true);
    const ferro = alertas.filter((a) => a.regra === 'ferro-baixo');
    expect(ferro.every((a) => a.severidade === SeveridadeAlerta.MEDIA)).toBe(true);
  });

  it('cada alerta guarda o marcador de origem para auditoria', () => {
    const alertas = alertasDoExame(
      [{ marcador: 'PCR_US', valor: 4, classificacao: Classificacao.CRITICO }],
      'M',
    );
    expect(alertas.every((a) => a.marcador === 'PCR_US')).toBe(true);
  });
});
