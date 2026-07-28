import { describe, expect, it } from 'vitest';
import { AA_TEXTO_NORMAL, razaoDeContraste } from '../src/contraste';
import { paresDeContraste, temaClaro } from '../src/tema';
import { cores } from '../src/tokens';

/**
 * Trava de acessibilidade da paleta.
 *
 * Sem isto, uma "melhoria visual" futura pode deixar um botão ilegível sem que
 * ninguém perceba até um usuário reclamar.
 */
describe('contraste da paleta (WCAG AA)', () => {
  it.each(paresDeContraste)('$nome atinge o mínimo', ({ frente, fundo, minimo }) => {
    const razao = razaoDeContraste(frente, fundo);
    expect(
      razao,
      `${frente} sobre ${fundo} deu ${razao.toFixed(2)}:1, mínimo ${minimo}:1`,
    ).toBeGreaterThanOrEqual(minimo);
  });

  /**
   * Registra o motivo da regra "cor viva recebe texto escuro". Se alguém trocar
   * o texto do botão de ação para branco, este teste explica por que não pode.
   */
  it('branco sobre o laranja de ação reprova — por isso o texto é escuro', () => {
    expect(razaoDeContraste(cores.neutro[0], cores.acao[500])).toBeLessThan(AA_TEXTO_NORMAL);
    expect(razaoDeContraste(temaClaro.acaoTexto, temaClaro.acaoFundo)).toBeGreaterThanOrEqual(
      AA_TEXTO_NORMAL,
    );
  });

  it('laranja não serve como cor de texto sobre fundo claro', () => {
    expect(razaoDeContraste(cores.acao[500], cores.neutro[50])).toBeLessThan(AA_TEXTO_NORMAL);
  });
});
