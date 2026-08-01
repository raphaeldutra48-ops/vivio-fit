import { ProtocoloDobras, avaliacaoAdipometriaSchema } from '@vivio/contracts';
import { describe, expect, it } from 'vitest';
import {
  corpoDaAvaliacao,
  erroVisivel,
  numeroDoCampo,
  previaDaAvaliacao,
  problemaDaAltura,
  problemaDaDobra,
  problemaDaIdade,
  problemaDoPeso,
  problemasDaAvaliacao,
  podeSalvarAvaliacao,
  type EntradaNaTela,
} from './adipometria';

/**
 * O risco que este arquivo cobre (pendência 14b, adipometria): aqui o número
 * é clínico. Um campo mal lido não vira erro — vira um percentual de gordura
 * plausível e errado, escrito na avaliação de um paciente.
 *
 * As montagens terminam em `avaliacaoAdipometriaSchema`, que é o que a API
 * aplica.
 */

const ALUNO = 'cms4yfq200004uw88m1lv5ulf';

/** Homem, Pollock 3: os mesmos valores do teste da API. */
const homem = (dobras: Record<string, string> = {
  PEITORAL: '10',
  ABDOMINAL: '20',
  COXA: '15',
}): EntradaNaTela => ({
  protocolo: ProtocoloDobras.POLLOCK_3,
  sexo: 'M',
  idade: '30',
  peso: '80',
  altura: '178',
  dobras,
});

describe('numeroDoCampo', () => {
  it('lê decimal com vírgula, que é como se anota uma dobra', () => {
    expect(numeroDoCampo('12,5')).toBe(12.5);
    expect(numeroDoCampo('12.5')).toBe(12.5);
    expect(numeroDoCampo(' 12 ')).toBe(12);
  });

  it('devolve null — não 0 — quando não dá para ler', () => {
    expect(numeroDoCampo('')).toBeNull();
    expect(numeroDoCampo(undefined)).toBeNull();
    expect(numeroDoCampo('abc')).toBeNull();
    expect(numeroDoCampo('12,5,5')).toBeNull();
  });
});

describe('limites que espelham o schema', () => {
  it('dobra vale de 1 a 100 mm', () => {
    expect(problemaDaDobra('12')).toBeNull();
    expect(problemaDaDobra('')).toMatch(/preencha/);
    expect(problemaDaDobra('0,5')).toMatch(/entre 1 e 100/);
    expect(problemaDaDobra('150')).toMatch(/entre 1 e 100/);
  });

  it('idade é inteira, de 7 a 100 anos', () => {
    expect(problemaDaIdade('30')).toBeNull();
    expect(problemaDaIdade('30,5')).toMatch(/inteiros/);
    expect(problemaDaIdade('5')).toMatch(/entre 7 e 100/);
    expect(problemaDaIdade('150')).toMatch(/entre 7 e 100/);
    expect(problemaDaIdade('')).toMatch(/preencha/);
  });

  it('peso vale de 20 a 400 kg', () => {
    expect(problemaDoPeso('80')).toBeNull();
    expect(problemaDoPeso('5')).toMatch(/entre 20 e 400/);
    expect(problemaDoPeso('')).toMatch(/preencha/);
  });

  /** A altura é opcional — e a vírgula nela estava quebrada. */
  it('altura em branco não é problema, e aceita vírgula', () => {
    expect(problemaDaAltura('')).toBeNull();
    expect(problemaDaAltura('   ')).toBeNull();
    expect(problemaDaAltura('175,5')).toBeNull();
    expect(problemaDaAltura('50')).toMatch(/entre 80 e 260/);
  });
});

describe('erroVisivel', () => {
  it('não pinta campo em branco — quem cobra o que falta é a lista', () => {
    expect(erroVisivel('', 'preencha este campo')).toBeUndefined();
    expect(erroVisivel(undefined, 'preencha este campo')).toBeUndefined();
  });

  it('pinta o que foi digitado e não serve', () => {
    expect(erroVisivel('150', 'entre 1 e 100 mm')).toBe('entre 1 e 100 mm');
    expect(erroVisivel('12', null)).toBeUndefined();
  });
});

describe('problemasDaAvaliacao', () => {
  it('avaliação completa não tem problema nenhum', () => {
    expect(problemasDaAvaliacao(ALUNO, homem())).toEqual([]);
    expect(podeSalvarAvaliacao(ALUNO, homem())).toBe(true);
  });

  it('cobra o aluno', () => {
    expect(problemasDaAvaliacao('', homem())).toContain('Escolha o aluno.');
  });

  it('cobra cada dobra que falta, pelo nome do ponto anatômico', () => {
    const problemas = problemasDaAvaliacao(ALUNO, homem({ PEITORAL: '10' }));

    expect(problemas).toContain('Abdominal (mm): preencha este campo.');
    expect(problemas).toContain('Coxa (mm): preencha este campo.');
    expect(problemas).not.toContain('Peitoral (mm): preencha este campo.');
  });

  /** A idade entra na equação e nao era conferida em lugar nenhum. */
  it('cobra idade fora da faixa, que antes ia direto para o 400', () => {
    expect(problemasDaAvaliacao(ALUNO, { ...homem(), idade: '150' })).toContain(
      'Idade (anos): entre 7 e 100 anos.',
    );
    expect(problemasDaAvaliacao(ALUNO, { ...homem(), idade: '' })).toContain(
      'Idade (anos): preencha a idade.',
    );
  });

  it('o protocolo feminino cobra as dobras dele, não as do masculino', () => {
    const mulher: EntradaNaTela = {
      ...homem({ TRICEPS: '18', SUPRAILIACA: '14', COXA: '25' }),
      sexo: 'F',
      peso: '62',
    };

    expect(problemasDaAvaliacao(ALUNO, mulher)).toEqual([]);
    // As dobras masculinas não são exigidas nem atrapalham.
    expect(problemasDaAvaliacao(ALUNO, { ...mulher, dobras: { ...mulher.dobras, ABDOMINAL: '99' } })).toEqual([]);
  });
});

describe('previaDaAvaliacao', () => {
  /** A regressão que motivou o arquivo. */
  it('não mostra número nenhum com o protocolo pela metade', () => {
    expect(previaDaAvaliacao(homem({ PEITORAL: '10', ABDOMINAL: '20' }))).toBeNull();
    expect(previaDaAvaliacao(homem({}))).toBeNull();
  });

  /**
   * Prova de que a recusa importa: meio protocolo daria um percentual BAIXO,
   * que parece razoável. É esse número que não pode chegar à tela.
   */
  it('o que a soma parcial produziria seria plausível e errado', () => {
    const inteiro = previaDaAvaliacao(homem())!;
    // Mesma entrada, mas fingindo que a dobra que falta vale zero.
    const comoEraAntes = previaDaAvaliacao(
      homem({ PEITORAL: '10', ABDOMINAL: '20', COXA: '0,0001' }),
    );

    expect(inteiro.percentualGordura).toBeGreaterThan(8);
    // O antigo `|| 0` produzia exatamente este tipo de numero menor.
    expect(comoEraAntes).toBeNull();
  });

  it('idade em branco também segura a prévia', () => {
    expect(previaDaAvaliacao({ ...homem(), idade: '' })).toBeNull();
  });

  it('confere com a equação publicada de Jackson & Pollock e Siri', () => {
    // Mesmos coeficientes do teste da API. Mexer neles quebra os dois.
    const soma = 45;
    const d = 1.10938 - 0.0008267 * soma + 0.0000016 * soma * soma - 0.0002574 * 30;
    const esperado = Math.round((495 / d - 450) * 10) / 10;

    const previa = previaDaAvaliacao(homem())!;

    expect(previa.somaMm).toBe(45);
    expect(previa.percentualGordura).toBe(esperado);
    expect(previa.percentualGordura).toBeGreaterThan(8);
    expect(previa.percentualGordura).toBeLessThan(18);
  });

  it('massa gorda e massa magra fecham com o peso', () => {
    const previa = previaDaAvaliacao(homem())!;

    expect(previa.massaGordaKg! + previa.massaMagraKg!).toBeCloseTo(80, 1);
    expect(previa.faixa).toBeTruthy();
  });

  it('sem peso válido mostra o percentual, mas não inventa as massas', () => {
    const previa = previaDaAvaliacao({ ...homem(), peso: '' })!;

    expect(previa.percentualGordura).toBeGreaterThan(0);
    expect(previa.massaGordaKg).toBeNull();
    expect(previa.massaMagraKg).toBeNull();
  });

  /** Erro clássico: centímetros no lugar de milímetros. */
  it('recusa resultado fora da faixa fisiológica, como o servidor', () => {
    expect(previaDaAvaliacao(homem({ PEITORAL: '1', ABDOMINAL: '1', COXA: '1' }))).toBeNull();
  });

  it('vírgula na dobra entra na conta', () => {
    const comVirgula = previaDaAvaliacao(homem({ PEITORAL: '10,5', ABDOMINAL: '20', COXA: '15' }))!;
    const comPonto = previaDaAvaliacao(homem({ PEITORAL: '10.5', ABDOMINAL: '20', COXA: '15' }))!;

    expect(comVirgula.somaMm).toBe(45.5);
    expect(comVirgula.percentualGordura).toBe(comPonto.percentualGordura);
  });
});

describe('corpoDaAvaliacao', () => {
  const data = new Date('2026-08-01T12:00:00Z');

  it('monta um corpo que o schema do servidor aceita', () => {
    const corpo = corpoDaAvaliacao(homem(), data);

    expect(avaliacaoAdipometriaSchema.safeParse(corpo).success).toBe(true);
    expect(corpo.dobras).toEqual({ PEITORAL: 10, ABDOMINAL: 20, COXA: 15 });
    expect(corpo.pesoKg).toBe(80);
    expect(corpo.idade).toBe(30);
  });

  /** A altura fazia `Number(altura)` sem trocar a vírgula: virava NaN. */
  it('vírgula na altura chega como número, não como NaN', () => {
    const corpo = corpoDaAvaliacao({ ...homem(), altura: '175,5' }, data);

    expect(corpo.alturaCm).toBe(175.5);
    expect(avaliacaoAdipometriaSchema.safeParse(corpo).success).toBe(true);
  });

  it('altura em branco vira ausência, não zero', () => {
    const corpo = corpoDaAvaliacao({ ...homem(), altura: '' }, data);

    expect(corpo.alturaCm).toBeUndefined();
    expect(avaliacaoAdipometriaSchema.safeParse(corpo).success).toBe(true);
  });

  it('manda só as dobras do protocolo em vigor', () => {
    const corpo = corpoDaAvaliacao(
      { ...homem({ PEITORAL: '10', ABDOMINAL: '20', COXA: '15', TRICEPS: '99' }) },
      data,
    );

    expect(Object.keys(corpo.dobras).sort()).toEqual(['ABDOMINAL', 'COXA', 'PEITORAL']);
  });

  it('o que o guarda barra é exatamente o que o schema recusaria', () => {
    const invalidas: EntradaNaTela[] = [
      { ...homem(), idade: '150' },
      { ...homem(), peso: '5' },
      { ...homem(), altura: '10' },
      homem({ PEITORAL: '10', ABDOMINAL: '20', COXA: '150' }),
    ];

    for (const entrada of invalidas) {
      expect(podeSalvarAvaliacao(ALUNO, entrada)).toBe(false);
      expect(avaliacaoAdipometriaSchema.safeParse(corpoDaAvaliacao(entrada, data)).success).toBe(
        false,
      );
    }
  });
});
