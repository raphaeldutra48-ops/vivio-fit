import { describe, expect, it } from 'vitest';
import { DIAS_PARA_ATENCAO, diasSemSinal, estaSumido } from './resumo';

/**
 * A regra que decide quem entra na lista de atenção do profissional.
 *
 * O erro que estes testes existem para impedir é o mais fácil de cometer:
 * tratar "nunca registrou treino" como "está há zero dias sem treinar". Feito
 * assim, todo aluno recém-vinculado apareceria como sumido — ou nenhum
 * apareceria, dependendo do sinal do engano. Nos dois casos a lista deixa de
 * valer, e uma lista de atenção em que não se confia é pior que nenhuma:
 * ensina o profissional a fechar a tela sem ler.
 */

describe('diasSemSinal', () => {
  it('com treino registrado, vale o tempo desde o último', () => {
    expect(diasSemSinal(12, 300)).toBe(12);
  });

  /* O caso central. Sem treino nenhum, a régua é o tempo de vínculo. */
  it('sem treino nenhum, vale o tempo de vínculo', () => {
    expect(diasSemSinal(null, 45)).toBe(45);
  });

  it('treinou hoje é zero, e zero não é ausência', () => {
    expect(diasSemSinal(0, 300)).toBe(0);
  });
});

describe('estaSumido', () => {
  it('quem treinou ontem não está sumido', () => {
    expect(estaSumido(1, 300)).toBe(false);
  });

  it('quem passou do limiar está', () => {
    expect(estaSumido(DIAS_PARA_ATENCAO, 300)).toBe(true);
    expect(estaSumido(DIAS_PARA_ATENCAO + 30, 300)).toBe(true);
  });

  /* O dia exato do limiar conta — `>` em vez de `>=` esconderia um dia inteiro
     de alunos, todo dia. */
  it('o limiar é inclusivo', () => {
    expect(estaSumido(DIAS_PARA_ATENCAO - 1, 300)).toBe(false);
    expect(estaSumido(DIAS_PARA_ATENCAO, 300)).toBe(true);
  });

  /*
    Aluno novo que ainda não treinou não é caso de cobrança. Cobrar quem aceitou
    o convite ontem é cobrar pelo que a pessoa ainda não teve tempo de fazer —
    e é a forma mais rápida de o profissional perder a confiança na lista.
  */
  it('aluno recém-vinculado que nunca treinou não entra', () => {
    expect(estaSumido(null, 2)).toBe(false);
  });

  it('aluno antigo que nunca treinou entra', () => {
    expect(estaSumido(null, 60)).toBe(true);
  });

  /*
    A fronteira entre os dois casos acima. Vínculo com exatamente o limiar e
    nenhum treino: entrou e nunca apareceu por uma semana inteira — é
    exatamente quem o profissional precisa ver.
  */
  it('nunca treinou, vínculo no limiar: entra', () => {
    expect(estaSumido(null, DIAS_PARA_ATENCAO)).toBe(true);
    expect(estaSumido(null, DIAS_PARA_ATENCAO - 1)).toBe(false);
  });
});
