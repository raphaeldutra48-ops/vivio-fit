import { describe, expect, it } from 'vitest';
import { ehUsuarioDeVerdade } from './guarda-de-producao';

/**
 * A régua que decide se a suíte pode apagar dados neste banco.
 *
 * Testada aqui, e não criando um usuário falso no banco, porque escrever em
 * produção para verificar a proteção de produção é o contrário do que ela
 * defende.
 *
 * O erro caro é o falso negativo: classificar gente de verdade como semente
 * libera a suíte para apagar treino, medida e exame de alguém. Por isso a lista
 * de exceções é fechada e pequena — qualquer domínio novo cai como real.
 */
describe('ehUsuarioDeVerdade', () => {
  it('a equipe da semente não conta', () => {
    for (const e of [
      'admin@viviofit.com.br',
      'personal@viviofit.com.br',
      'nutri@viviofit.com.br',
      'medico@viviofit.com.br',
    ]) {
      expect(ehUsuarioDeVerdade(e)).toBe(false);
    }
  });

  it('os alunos de exemplo não contam', () => {
    for (const e of ['ana@exemplo.com', 'bruno@exemplo.com', 'carla@exemplo.com']) {
      expect(ehUsuarioDeVerdade(e)).toBe(false);
    }
  });

  it('o que os próprios e2e criam não conta', () => {
    expect(ehUsuarioDeVerdade('resumo.autoriza.mt7aqyt0@teste.com')).toBe(false);
  });

  /* O caso que fecha o portão. */
  it('qualquer outro domínio é gente de verdade', () => {
    for (const e of [
      'raphael@gmail.com',
      'aluna@hotmail.com',
      'personal@minhaacademia.com.br',
      'medico@clinica.med.br',
    ]) {
      expect(ehUsuarioDeVerdade(e)).toBe(true);
    }
  });

  /*
    Sufixo, não pedaço. `@exemplo.com.br` é outro domínio, e alguém com esse
    e-mail é gente — deixá-lo passar como semente liberaria a suíte a apagar os
    dados dele.
  */
  it('não confunde domínio parecido com o da semente', () => {
    expect(ehUsuarioDeVerdade('alguem@exemplo.com.br')).toBe(true);
    expect(ehUsuarioDeVerdade('alguem@viviofit.com')).toBe(true);
    // `naoteste.com` nao e `teste.com`: o `@` vem antes de `nao`, entao o
    // sufixo nao casa. E gente de verdade, e tem de barrar.
    expect(ehUsuarioDeVerdade('alguem@naoteste.com')).toBe(true);
  });
});
