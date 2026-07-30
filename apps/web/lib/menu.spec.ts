import { Papel } from '@vivio/contracts';
import { describe, expect, it } from 'vitest';
import { MENU, menuPara } from './menu';

const hrefsDe = (papel: Papel): string[] =>
  menuPara(papel)
    .flatMap((bloco) => bloco.secoes)
    .flatMap((secao) => [secao.href, ...secao.itens.map((i) => i.href)])
    .filter((h): h is string => Boolean(h));

describe('menuPara', () => {
  it('esconde de quem não é personal as telas de treino', () => {
    expect(hrefsDe(Papel.NUTRICIONISTA)).not.toContain('/exercicios');
    expect(hrefsDe(Papel.PERSONAL)).toContain('/exercicios');
  });

  /**
   * A API recusa de qualquer forma — mas mostrar um caminho que o profissional
   * não pode percorrer é convidar ao erro.
   */
  it('só o médico enxerga Medicamentos', () => {
    expect(hrefsDe(Papel.MEDICO)).toContain('/prescricoes/medicamentos');
    expect(hrefsDe(Papel.NUTRICIONISTA)).not.toContain('/prescricoes/medicamentos');
    expect(hrefsDe(Papel.PERSONAL)).not.toContain('/prescricoes/medicamentos');
  });

  it('nutricionista e médico veem o resto das prescrições', () => {
    for (const papel of [Papel.NUTRICIONISTA, Papel.MEDICO]) {
      expect(hrefsDe(papel)).toContain('/prescricoes/suplementos');
      expect(hrefsDe(papel)).toContain('/prescricoes/modelos');
    }
    expect(hrefsDe(Papel.PERSONAL)).not.toContain('/prescricoes/suplementos');
  });

  it('o aluno não vê nada do painel profissional', () => {
    expect(hrefsDe(Papel.ALUNO)).toHaveLength(0);
  });

  it('não deixa seção virar um agrupador vazio', () => {
    for (const papel of [Papel.PERSONAL, Papel.NUTRICIONISTA, Papel.MEDICO, Papel.ADMIN]) {
      for (const bloco of menuPara(papel)) {
        for (const secao of bloco.secoes) {
          expect(secao.itens.length > 0 || Boolean(secao.href)).toBe(true);
        }
      }
    }
  });

  it('cada href é único no menu inteiro', () => {
    const todos = MENU.flatMap((b) => b.secoes).flatMap((s) => [
      s.href,
      ...s.itens.map((i) => i.href),
    ]);
    const definidos = todos.filter(Boolean);
    expect(new Set(definidos).size).toBe(definidos.length);
  });
});
