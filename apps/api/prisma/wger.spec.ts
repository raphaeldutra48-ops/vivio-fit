import { describe, expect, it } from 'vitest';
import { EXERCICIOS_GLOBAIS } from './exercicios-globais';
import { MAPA } from './wger';

/**
 * O mapa é escrito à mão e ligado por **nome**. Um nome com acento trocado ou
 * palavra a mais não quebra nada: o importador simplesmente não acha o
 * exercício e segue em frente, e o item fica sem imagem para sempre sem que
 * ninguém perceba. Este teste é o que transforma esse silêncio em falha.
 */
describe('mapa wger → catálogo', () => {
  const nossosNomes = new Set(EXERCICIOS_GLOBAIS.map(([nome]) => nome));

  it('todo nome do mapa existe no catálogo, escrito igual', () => {
    for (const nome of Object.keys(MAPA)) {
      expect(nossosNomes.has(nome), `"${nome}" não está em EXERCICIOS_GLOBAIS`).toBe(true);
    }
  });

  it('todo id do wger é um inteiro positivo', () => {
    for (const [nome, id] of Object.entries(MAPA)) {
      expect(Number.isInteger(id) && id > 0, `${nome} → ${id}`).toBe(true);
    }
  });

  /*
    Dois exercícios nossos podem apontar para o mesmo id do wger quando são o
    mesmo movimento com nome diferente ("Face pull" e "Face pull para ombro").
    O que não pode passar em branco é uma repetição NÃO intencional — então a
    lista de duplicatas aceitas fica escrita.
  */
  it('só os pares declarados compartilham a mesma origem', () => {
    const permitidos = new Set(['222', '91']);

    const porId = new Map<number, string[]>();
    for (const [nome, id] of Object.entries(MAPA)) {
      porId.set(id, [...(porId.get(id) ?? []), nome]);
    }

    for (const [id, nomes] of porId) {
      if (nomes.length > 1) {
        expect(permitidos.has(String(id)), `id ${id} repetido em: ${nomes.join(', ')}`).toBe(true);
      }
    }
  });

  /** Cobertura é baixa por natureza — mas queda brusca significa mapa quebrado. */
  it('cobre ao menos 15% do catálogo', () => {
    const cobertura = Object.keys(MAPA).length / EXERCICIOS_GLOBAIS.length;
    expect(cobertura).toBeGreaterThan(0.15);
  });
});
