import { criarPlanoDietaSchema, type AlimentoResumo } from '@vivio/contracts';
import { describe, expect, it } from 'vitest';
import {
  corDaMeta,
  corpoDoPlano,
  macrosDaPorcao,
  macrosDaRefeicao,
  metaEmNumero,
  podeSalvarPlano,
  problemaDaQuantidade,
  problemasDoPlano,
  quantidadeEmGramas,
  somar,
  type MetasNaTela,
  type RefeicaoNaTela,
} from './dieta';

/**
 * O risco que este arquivo cobre (pendência 14b): o editor de cardápio
 * transforma texto em número antes de enviar, e a transformação erra em
 * silêncio. Campo vazio virava `0`, campo com lixo virava `NaN`, e os dois
 * chegavam ao servidor — que recusa com 400 e vira "Não foi possível salvar o
 * plano" na tela, sem dizer qual alimento estava errado.
 *
 * Por isso cada teste de montagem termina em `criarPlanoDietaSchema`, que é
 * exatamente o que a API aplica. O que a tela deixa salvar tem de passar lá.
 */

const frango: AlimentoResumo = {
  id: 'cln00000000000000000001',
  nome: 'Frango grelhado',
  grupo: 'Carnes',
  porcao100g: { kcal: 165, proteinaG: 31, carboidratoG: 0, gorduraG: 3.6, fibraG: 0 },
  medidaCaseira: 'filé médio',
  medidaGramas: 120,
};

const arroz: AlimentoResumo = {
  id: 'cln00000000000000000002',
  nome: 'Arroz branco cozido',
  grupo: 'Cereais',
  porcao100g: { kcal: 128, proteinaG: 2.5, carboidratoG: 28.1, gorduraG: 0.2, fibraG: 1.6 },
  medidaCaseira: 'escumadeira',
  medidaGramas: 100,
};

const SEM_METAS: MetasNaTela = { kcal: '', proteina: '', carbo: '', gordura: '' };

/** Uma refeição válida, para os testes mudarem só o que estão testando. */
const almoco = (quantidadeDoFrango = '150'): RefeicaoNaTela => ({
  nome: 'Almoço',
  horario: '12:30',
  itens: [
    { chave: 'a', alimento: frango, quantidadeG: quantidadeDoFrango },
    { chave: 'b', alimento: arroz, quantidadeG: '100' },
  ],
});

describe('quantidadeEmGramas', () => {
  it('lê decimal com vírgula, que é como se escreve em português', () => {
    expect(quantidadeEmGramas('1,5')).toBe(1.5);
    expect(quantidadeEmGramas('1.5')).toBe(1.5);
    expect(quantidadeEmGramas(' 150 ')).toBe(150);
  });

  /** O ponto da função: vazio é ausência, não zero. */
  it('devolve null — não 0 — quando não dá para ler', () => {
    expect(quantidadeEmGramas('')).toBeNull();
    expect(quantidadeEmGramas('   ')).toBeNull();
    expect(quantidadeEmGramas('abc')).toBeNull();
    expect(quantidadeEmGramas('1,5,5')).toBeNull();
  });

  it('zero digitado de propósito continua sendo zero, e não null', () => {
    expect(quantidadeEmGramas('0')).toBe(0);
  });
});

describe('problemaDaQuantidade', () => {
  it('aceita o que o schema aceita', () => {
    expect(problemaDaQuantidade('150')).toBeNull();
    expect(problemaDaQuantidade('0,5')).toBeNull();
    expect(problemaDaQuantidade('5000')).toBeNull();
  });

  it('recusa o que o schema recusaria, mas com a mensagem no campo', () => {
    expect(problemaDaQuantidade('')).toMatch(/informe a quantidade/);
    expect(problemaDaQuantidade('abc')).toMatch(/informe a quantidade/);
    expect(problemaDaQuantidade('0')).toMatch(/maior que zero/);
    expect(problemaDaQuantidade('-5')).toMatch(/maior que zero/);
    expect(problemaDaQuantidade('5001')).toMatch(/5000/);
  });
});

describe('problemasDoPlano', () => {
  it('plano completo não tem problema nenhum', () => {
    expect(problemasDoPlano('Cutting', [almoco()], SEM_METAS)).toEqual([]);
    expect(podeSalvarPlano('Cutting', [almoco()], SEM_METAS)).toBe(true);
  });

  it('cobra nome do plano', () => {
    expect(problemasDoPlano('C', [almoco()], SEM_METAS)).toContain(
      'Dê um nome ao plano (ao menos 2 letras).',
    );
  });

  it('cobra nome da refeição — o schema exige min(1) e a tela deixava apagar', () => {
    const semNome = { ...almoco(), nome: '  ' };
    expect(problemasDoPlano('Cutting', [semNome], SEM_METAS)).toContain('Refeição 1: dê um nome.');
  });

  it('cobra refeição vazia, chamando-a pelo nome', () => {
    const vazia: RefeicaoNaTela = { nome: 'Ceia', horario: '', itens: [] };
    expect(problemasDoPlano('Cutting', [almoco(), vazia], SEM_METAS)).toContain(
      '"Ceia" está sem alimentos.',
    );
  });

  /** A regressão que motivou o arquivo. */
  it('campo de gramas apagado impede salvar e diz qual alimento é', () => {
    const problemas = problemasDoPlano('Cutting', [almoco('')], SEM_METAS);

    expect(problemas).toContain('Frango grelhado em "Almoço": informe a quantidade em gramas.');
    expect(podeSalvarPlano('Cutting', [almoco('')], SEM_METAS)).toBe(false);
  });

  it('meta decimal ou fora da faixa é apontada antes do envio', () => {
    expect(problemasDoPlano('Cutting', [almoco()], { ...SEM_METAS, kcal: '1800,5' })).toContain(
      'Meta kcal: use um número inteiro.',
    );
    expect(problemasDoPlano('Cutting', [almoco()], { ...SEM_METAS, kcal: '100' })).toContain(
      'Meta kcal: use um valor entre 500 e 8000.',
    );
    expect(problemasDoPlano('Cutting', [almoco()], { ...SEM_METAS, gordura: '900' })).toContain(
      'Meta gordura (g): use um valor entre 0 e 400.',
    );
  });

  it('meta em branco é ausência, não erro — as quatro são opcionais', () => {
    expect(problemasDoPlano('Cutting', [almoco()], SEM_METAS)).toEqual([]);
    expect(metaEmNumero('')).toBeUndefined();
    expect(metaEmNumero('  ')).toBeUndefined();
  });
});

describe('corpoDoPlano', () => {
  it('monta um corpo que o schema do servidor aceita', () => {
    const corpo = corpoDoPlano('Cutting 1.800', SEM_METAS, [almoco()], true);

    expect(criarPlanoDietaSchema.safeParse(corpo).success).toBe(true);
    expect(corpo.refeicoes[0]!.itens[0]!.quantidadeG).toBe(150);
    expect(corpo.refeicoes[0]!.horarioSugerido).toBe('12:30');
  });

  it('vírgula vira ponto no que chega ao servidor', () => {
    const corpo = corpoDoPlano('Cutting', SEM_METAS, [almoco('152,5')], false);

    expect(corpo.refeicoes[0]!.itens[0]!.quantidadeG).toBe(152.5);
    expect(criarPlanoDietaSchema.safeParse(corpo).success).toBe(true);
  });

  it('apara o nome e converte só as metas preenchidas', () => {
    const corpo = corpoDoPlano(
      '  Cutting  ',
      { kcal: '1800', proteina: '150', carbo: '', gordura: '' },
      [almoco()],
      false,
    );

    expect(corpo.nome).toBe('Cutting');
    expect(corpo.kcalAlvo).toBe(1800);
    expect(corpo.proteinaAlvoG).toBe(150);
    expect(corpo.carboAlvoG).toBeUndefined();
    expect(corpo.gorduraAlvoG).toBeUndefined();
    expect(criarPlanoDietaSchema.safeParse(corpo).success).toBe(true);
  });

  it('horário em branco vira ausência, não string vazia', () => {
    const semHorario = { ...almoco(), horario: '' };
    const corpo = corpoDoPlano('Cutting', SEM_METAS, [semHorario], false);

    expect(corpo.refeicoes[0]!.horarioSugerido).toBeUndefined();
    expect(criarPlanoDietaSchema.safeParse(corpo).success).toBe(true);
  });

  /**
   * A prova de que o guarda é necessário: sem `problemasDoPlano` barrando
   * antes, isto é o 400 que o nutricionista via depois de montar tudo.
   */
  it('o que o guarda barra é exatamente o que o schema recusaria', () => {
    for (const invalida of ['', 'abc', '0', '6000']) {
      expect(podeSalvarPlano('Cutting', [almoco(invalida)], SEM_METAS)).toBe(false);

      const corpo = corpoDoPlano('Cutting', SEM_METAS, [almoco(invalida)], false);
      expect(criarPlanoDietaSchema.safeParse(corpo).success).toBe(false);
    }
  });
});

describe('macros', () => {
  it('é regra de três sobre a porção de 100 g', () => {
    expect(macrosDaPorcao(frango, 150)).toEqual({
      kcal: 247.5,
      proteinaG: 46.5,
      carboidratoG: 0,
      gorduraG: 5.4,
      fibraG: 0,
    });
  });

  it('arredonda em duas casas, sem lixo de ponto flutuante', () => {
    expect(macrosDaPorcao(arroz, 33)).toEqual({
      kcal: 42.24,
      proteinaG: 0.83,
      carboidratoG: 9.27,
      gorduraG: 0.07,
      fibraG: 0.53,
    });
  });

  it('soma a refeição inteira', () => {
    expect(somar([macrosDaPorcao(frango, 150), macrosDaPorcao(arroz, 100)])).toEqual({
      kcal: 375.5,
      proteinaG: 49,
      carboidratoG: 28.1,
      gorduraG: 5.6,
      fibraG: 1.6,
    });
  });

  /** Campo ilegível conta zero na soma — a tela precisa somar a cada tecla. */
  it('quantidade que não dá para ler conta zero, sem virar NaN na tela', () => {
    const total = macrosDaRefeicao(almoco(''));

    expect(total.kcal).toBe(128);
    expect(Number.isNaN(total.kcal)).toBe(false);
  });
});

describe('corDaMeta', () => {
  it('fica verde dentro de ±5% e laranja fora', () => {
    expect(corDaMeta(1800, 1800)).toBe('var(--vv-sucesso)');
    expect(corDaMeta(1750, 1800)).toBe('var(--vv-sucesso)');
    expect(corDaMeta(1600, 1800)).toBe('var(--vv-alerta)');
  });

  it('sem meta não pinta nada', () => {
    expect(corDaMeta(1800, null)).toBe('var(--vv-texto-secundario)');
  });
});
