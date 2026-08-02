import { Classificacao, SistemaCorporal, type MarcadorNoExame } from '@vivio/contracts';
import { describe, expect, it } from 'vitest';
import {
  agruparPorSistema,
  faixaEmTexto,
  fonteEmTexto,
  marcadoresPreenchidos,
  podeSalvarExame,
  problemaDoMarcador,
  problemasDoExame,
  type ValoresDigitados,
} from './exames';

const marcador = (
  m: Partial<MarcadorNoExame> & Pick<MarcadorNoExame, 'marcador' | 'sistema'>,
): MarcadorNoExame => ({
  rotulo: 'X',
  unidade: 'mg/dL',
  valor: 1,
  classificacao: Classificacao.OTIMO,
  laboratorial: {},
  funcional: {},
  fonteLaboratorial: { sigla: 'X', organizacao: 'X', documento: 'X', forca: 'DIRETRIZ' },
  fonteFuncional: { sigla: 'X', organizacao: 'X', documento: 'X', forca: 'DIRETRIZ' },
  ...m,
});

describe('problemaDoMarcador', () => {
  /**
   * A diferença em relação às outras telas: em branco NÃO é erro. Um exame
   * quase nunca traz os 20 marcadores, e cobrar os que faltam transformaria a
   * tela numa lista de reclamações.
   */
  it('campo em branco não é problema — é marcador que o laboratório não mediu', () => {
    expect(problemaDoMarcador('')).toBeNull();
    expect(problemaDoMarcador(undefined)).toBeNull();
    expect(problemaDoMarcador('   ')).toBeNull();
  });

  it('digitado e ilegível é problema', () => {
    expect(problemaDoMarcador('abc')).toBe('use só números');
    expect(problemaDoMarcador('34,5')).toBeNull();
  });
});

describe('problemasDoExame', () => {
  const valores: ValoresDigitados = { VITAMINA_D: '34,5' };

  it('exame mínimo válido não tem problema', () => {
    expect(problemasDoExame('Lab', '2026-07-25', valores)).toEqual([]);
    expect(podeSalvarExame('Lab', '2026-07-25', valores)).toBe(true);
  });

  it('cobra laboratório e data', () => {
    expect(problemasDoExame('', '2026-07-25', valores)).toContain('Informe o laboratório.');
    expect(problemasDoExame('Lab', '', valores)).toContain('Informe a data da coleta.');
  });

  it('exige ao menos um marcador — exame vazio não é exame', () => {
    expect(problemasDoExame('Lab', '2026-07-25', {})).toContain('Digite ao menos um marcador.');
    expect(problemasDoExame('Lab', '2026-07-25', { VITAMINA_D: '  ' })).toContain(
      'Digite ao menos um marcador.',
    );
  });

  it('nomeia o marcador ilegível', () => {
    expect(problemasDoExame('Lab', '2026-07-25', { VITAMINA_D: 'abc' })).toContain(
      'Vitamina D3 (25-OH): use só números.',
    );
  });
});

describe('marcadoresPreenchidos', () => {
  it('leva só os legíveis, com vírgula lida como decimal', () => {
    const r = marcadoresPreenchidos({
      VITAMINA_D: '34,5',
      TSH: '',
      FERRITINA: 'abc',
      GLICOSE_JEJUM: '92',
    });

    expect(r).toEqual([
      { marcador: 'VITAMINA_D', valor: 34.5 },
      { marcador: 'GLICOSE_JEJUM', valor: 92 },
    ]);
  });

  /** Zero é valor digitado de propósito, não campo vazio. */
  it('zero digitado vai para o servidor', () => {
    expect(marcadoresPreenchidos({ PCR_US: '0' })).toEqual([{ marcador: 'PCR_US', valor: 0 }]);
  });
});

describe('agruparPorSistema', () => {
  it('agrupa na ordem da leitura clínica e some com grupo vazio', () => {
    const grupos = agruparPorSistema([
      marcador({ marcador: 'VITAMINA_D', sistema: SistemaCorporal.VITAMINAS }),
      marcador({ marcador: 'GLICOSE_JEJUM', sistema: SistemaCorporal.GLICEMICO }),
      marcador({ marcador: 'TFG_ESTIMADA', sistema: SistemaCorporal.RENAL }),
    ]);

    expect(grupos.map((g) => g.sistema)).toEqual([
      SistemaCorporal.GLICEMICO,
      SistemaCorporal.RENAL,
      SistemaCorporal.VITAMINAS,
    ]);
    expect(grupos[0]!.rotulo).toBe('Metabolismo glicêmico');
  });

  it('lista vazia não produz grupo nenhum', () => {
    expect(agruparPorSistema([])).toEqual([]);
  });
});

describe('faixaEmTexto', () => {
  it('escreve a faixa como se lê num laudo', () => {
    expect(faixaEmTexto({ min: 70, max: 99 }, 'mg/dL')).toBe('70 a 99 mg/dL');
    expect(faixaEmTexto({ max: 190 }, 'mg/dL')).toBe('até 190 mg/dL');
    expect(faixaEmTexto({ min: 30 }, 'ng/mL')).toBe('a partir de 30 ng/mL');
  });

  it('marcador sem unidade não ganha espaço sobrando', () => {
    expect(faixaEmTexto({ max: 1.5 }, '')).toBe('até 1.5');
  });
});

describe('fonteEmTexto', () => {
  it('junta organização, documento, ano e PMID quando existem', () => {
    expect(
      fonteEmTexto({
        sigla: 'ADA',
        organizacao: 'American Diabetes Association',
        documento: 'Standards of Care in Diabetes',
        ano: 2024,
        forca: 'DIRETRIZ',
      }),
    ).toBe('American Diabetes Association · Standards of Care in Diabetes · 2024');

    expect(
      fonteEmTexto({
        sigla: 'PubMed',
        organizacao: 'National Library of Medicine',
        documento: 'Herrmann & Obeid',
        pmid: '29543324',
        forca: 'ESTUDO',
      }),
    ).toBe('National Library of Medicine · Herrmann & Obeid · PMID 29543324');
  });
});
