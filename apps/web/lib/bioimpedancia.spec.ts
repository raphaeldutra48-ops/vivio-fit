import { avaliacaoBioimpedanciaSchema } from '@vivio/contracts';
import { describe, expect, it } from 'vitest';
import {
  CAMPOS,
  corpoDaBioimpedancia,
  podeSalvarBioimpedancia,
  previaDaBioimpedancia,
  problemaDoCampo,
  problemasDaBioimpedancia,
  type ValoresDaBalanca,
} from './bioimpedancia';

/**
 * O risco (pendência 14b, bioimpedância): a tela é uma transcrição do que a
 * balança mostrou. Oito números digitados à mão, nenhum conferível contra
 * outra fonte, e faixa no schema para todos.
 */

const ALUNO = 'cms4yfq200004uw88m1lv5ulf';

const balanca = (extra: ValoresDaBalanca = {}): ValoresDaBalanca => ({
  pesoKg: '70',
  percentualGordura: '25',
  ...extra,
});

const campo = (chave: string) => CAMPOS.find((c) => c.chave === chave)!;

describe('a tabela de campos espelha o schema', () => {
  it('cobre exatamente os campos numéricos que a API aceita', () => {
    expect(CAMPOS.map((c) => c.chave).sort()).toEqual([
      'aguaCorporalPercentual',
      'alturaCm',
      'gorduraVisceral',
      'massaMagraKg',
      'massaOsseaKg',
      'percentualGordura',
      'pesoKg',
      'taxaMetabolicaBasal',
    ]);
  });

  it('só peso e gordura são obrigatórios', () => {
    expect(CAMPOS.filter((c) => c.obrigatorio).map((c) => c.chave)).toEqual([
      'pesoKg',
      'percentualGordura',
    ]);
  });
});

describe('problemaDoCampo', () => {
  it('aceita o que o schema aceita', () => {
    expect(problemaDoCampo(campo('pesoKg'), balanca())).toBeNull();
    expect(problemaDoCampo(campo('percentualGordura'), balanca())).toBeNull();
  });

  it('cobra as faixas de cada campo', () => {
    expect(problemaDoCampo(campo('pesoKg'), balanca({ pesoKg: '5' }))).toMatch(/entre 20 e 400/);
    expect(problemaDoCampo(campo('percentualGordura'), balanca({ percentualGordura: '90' }))).toMatch(
      /entre 1 e 70/,
    );
    expect(problemaDoCampo(campo('massaOsseaKg'), balanca({ massaOsseaKg: '0,1' }))).toMatch(
      /entre 0.5 e 10/,
    );
    expect(
      problemaDoCampo(campo('aguaCorporalPercentual'), balanca({ aguaCorporalPercentual: '10' })),
    ).toMatch(/entre 20 e 80/);
    expect(problemaDoCampo(campo('gorduraVisceral'), balanca({ gorduraVisceral: '99' }))).toMatch(
      /entre 1 e 60/,
    );
  });

  /** A TMB é a única inteira no schema. */
  it('a taxa metabólica basal precisa ser inteira', () => {
    expect(problemaDoCampo(campo('taxaMetabolicaBasal'), balanca({ taxaMetabolicaBasal: '1500' })))
      .toBeNull();
    expect(
      problemaDoCampo(campo('taxaMetabolicaBasal'), balanca({ taxaMetabolicaBasal: '1500,5' })),
    ).toMatch(/inteiro/);
    expect(problemaDoCampo(campo('taxaMetabolicaBasal'), balanca({ taxaMetabolicaBasal: '100' })))
      .toMatch(/entre 500 e 5000/);
  });

  it('campo opcional em branco não é problema', () => {
    for (const c of CAMPOS.filter((c) => !c.obrigatorio)) {
      expect(problemaDoCampo(c, balanca())).toBeNull();
    }
  });

  /**
   * O `opcional()` antigo devolvia `|| 0`, e o schema recusava o zero. Agora é
   * problema — e a mensagem distingue "vazio" de "ilegível", porque dizer
   * "preencha este campo" a quem acabou de digitar nele não ajuda ninguém.
   */
  it('campo opcional com lixo digitado é problema, não zero silencioso', () => {
    expect(problemaDoCampo(campo('massaOsseaKg'), balanca({ massaOsseaKg: 'abc' }))).toBe(
      'use só números',
    );
    expect(problemaDoCampo(campo('massaOsseaKg'), balanca())).toBeNull();
  });
});

describe('problemasDaBioimpedancia', () => {
  it('transcrição mínima válida não tem problema nenhum', () => {
    expect(problemasDaBioimpedancia(ALUNO, balanca())).toEqual([]);
    expect(podeSalvarBioimpedancia(ALUNO, balanca())).toBe(true);
  });

  it('cobra o aluno e os dois obrigatórios em branco', () => {
    const problemas = problemasDaBioimpedancia('', {});

    expect(problemas).toContain('Escolha o aluno.');
    expect(problemas).toContain('Peso (kg): preencha este campo.');
    expect(problemas).toContain('Gordura (%): preencha este campo.');
  });

  it('nomeia o campo opcional que está fora da faixa', () => {
    expect(problemasDaBioimpedancia(ALUNO, balanca({ massaOsseaKg: '50' }))).toContain(
      'Massa óssea (kg): entre 0.5 e 10 kg.',
    );
  });
});

describe('previaDaBioimpedancia', () => {
  it('deriva massa gorda e magra do percentual, como o servidor', () => {
    const previa = previaDaBioimpedancia(balanca(), 'F')!;

    expect(previa.percentualGordura).toBe(25);
    expect(previa.massaGordaKg).toBe(17.5);
    expect(previa.massaMagraKg).toBe(52.5);
    expect(previa.massaMagraInformada).toBe(false);
    // ACSM feminino: Bom até 24, Aceitável até 32.
    expect(previa.faixa).toBe('Aceitável');
  });

  /**
   * A divergência que a tela tinha: a legenda prometia que a massa magra
   * informada prevalece, o servidor fazia isso, e a prévia mostrava a derivada.
   * O número mudava depois de salvar.
   */
  it('a massa magra informada pela balança prevalece sobre a derivada', () => {
    const previa = previaDaBioimpedancia(balanca({ massaMagraKg: '51,2' }), 'F')!;

    expect(previa.massaMagraKg).toBe(51.2);
    expect(previa.massaMagraInformada).toBe(true);
    // A derivada seria 52.5 — é justamente o número que aparecia antes.
    expect(previa.massaMagraKg).not.toBe(52.5);
  });

  it('massa magra fora da faixa volta para a derivada, sem inventar número', () => {
    const previa = previaDaBioimpedancia(balanca({ massaMagraKg: '500' }), 'F')!;

    expect(previa.massaMagraKg).toBe(52.5);
    expect(previa.massaMagraInformada).toBe(false);
  });

  it('sem peso ou sem gordura válidos não mostra nada', () => {
    expect(previaDaBioimpedancia({}, 'F')).toBeNull();
    expect(previaDaBioimpedancia(balanca({ pesoKg: '' }), 'F')).toBeNull();
    expect(previaDaBioimpedancia(balanca({ percentualGordura: 'abc' }), 'F')).toBeNull();
    expect(previaDaBioimpedancia(balanca({ pesoKg: '5' }), 'F')).toBeNull();
  });

  /** O mesmo 22% é "Aceitável" para homem e "Bom" para mulher (ACSM). */
  it('a faixa de referência muda com o sexo', () => {
    const valores = balanca({ percentualGordura: '22' });

    expect(previaDaBioimpedancia(valores, 'M')!.faixa).toBe('Aceitável');
    expect(previaDaBioimpedancia(valores, 'F')!.faixa).toBe('Bom');
  });
});

describe('corpoDaBioimpedancia', () => {
  const data = new Date('2026-08-01T12:00:00Z');

  it('monta um corpo que o schema do servidor aceita', () => {
    const corpo = corpoDaBioimpedancia(balanca(), data);

    expect(avaliacaoBioimpedanciaSchema.safeParse(corpo).success).toBe(true);
    expect(corpo.pesoKg).toBe(70);
    expect(corpo.percentualGordura).toBe(25);
  });

  it('campos opcionais em branco viram ausência, não zero', () => {
    const corpo = corpoDaBioimpedancia(balanca(), data);

    expect(corpo.alturaCm).toBeUndefined();
    expect(corpo.massaMagraKg).toBeUndefined();
    expect(corpo.massaOsseaKg).toBeUndefined();
    expect(corpo.taxaMetabolicaBasal).toBeUndefined();
    expect(avaliacaoBioimpedanciaSchema.safeParse(corpo).success).toBe(true);
  });

  it('leva os opcionais preenchidos, com vírgula lida como decimal', () => {
    const corpo = corpoDaBioimpedancia(
      balanca({
        alturaCm: '165',
        massaMagraKg: '51,2',
        aguaCorporalPercentual: '55',
        massaOsseaKg: '2,8',
        taxaMetabolicaBasal: '1450',
        gorduraVisceral: '7',
      }),
      data,
    );

    expect(corpo).toMatchObject({
      alturaCm: 165,
      massaMagraKg: 51.2,
      aguaCorporalPercentual: 55,
      massaOsseaKg: 2.8,
      taxaMetabolicaBasal: 1450,
      gorduraVisceral: 7,
    });
    expect(avaliacaoBioimpedanciaSchema.safeParse(corpo).success).toBe(true);
  });

  it('o que o guarda barra é o que o schema recusaria', () => {
    const invalidas: ValoresDaBalanca[] = [
      balanca({ pesoKg: '5' }),
      balanca({ percentualGordura: '90' }),
      balanca({ massaOsseaKg: '50' }),
      balanca({ taxaMetabolicaBasal: '1500,5' }),
      balanca({ gorduraVisceral: '99' }),
    ];

    for (const valores of invalidas) {
      expect(podeSalvarBioimpedancia(ALUNO, valores)).toBe(false);
      expect(
        avaliacaoBioimpedanciaSchema.safeParse(corpoDaBioimpedancia(valores, data)).success,
      ).toBe(false);
    }
  });

  /**
   * Um caso em que o guarda é mais rígido que o schema, de propósito.
   *
   * Texto ilegível num campo OPCIONAL vira ausência no corpo, e o schema
   * aceita de bom grado — a altura simplesmente não vai. Mas alguém digitou
   * ali: mandar sem a altura seria descartar em silêncio o que a pessoa
   * escreveu. A tela prefere parar e pedir a correção.
   */
  it('lixo em campo opcional trava a tela, mesmo que o schema aceitasse o corpo', () => {
    const valores = balanca({ alturaCm: 'abc' });

    expect(podeSalvarBioimpedancia(ALUNO, valores)).toBe(false);

    const corpo = corpoDaBioimpedancia(valores, data);
    expect(corpo.alturaCm).toBeUndefined();
    expect(avaliacaoBioimpedanciaSchema.safeParse(corpo).success).toBe(true);
  });
});
