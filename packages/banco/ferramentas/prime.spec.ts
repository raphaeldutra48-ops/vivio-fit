import { describe, expect, it } from 'vitest';
import { EXERCICIOS_GLOBAIS } from '../prisma/exercicios-globais';
import { BIBLIOTECA_PRIME, MAPA_PRIME, origemPrime } from './prime';

/**
 * O mapa Prime → catálogo é escrito à mão e ligado por **nome**, como o do
 * wger. Um acento trocado não quebra nada: o exercício só fica sem vídeo para
 * sempre, e ninguém percebe. Estes testes transformam esse silêncio em falha —
 * e barram o erro que o comparador automático cometeu de verdade.
 */
describe('mapa Prime → catálogo', () => {
  const nossosNomes = new Set(EXERCICIOS_GLOBAIS.map(([nome]) => nome));

  it('todo nome do mapa existe no catálogo, escrito igual', () => {
    for (const nome of Object.keys(MAPA_PRIME)) {
      expect(nossosNomes.has(nome), `"${nome}" não está em EXERCICIOS_GLOBAIS`).toBe(true);
    }
  });

  it('todo vídeo é um id do Bunny', () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    for (const [nome, v] of Object.entries(MAPA_PRIME)) {
      expect(uuid.test(v.video), `${nome} → ${v.video}`).toBe(true);
    }
  });

  /*
    O erro que motivou este teste: "Rotação externa de ombro na polia" pontuou
    0,75 contra a nossa "Rotação INTERNA" — o movimento oposto, no mesmo
    músculo. É o tipo de troca que ninguém nota olhando a lista, e que ensina o
    aluno a fazer o contrário do que foi prescrito.
  */
  it('palavras opostas nunca se cruzam entre o nosso nome e o do Prime', () => {
    const opostos: ReadonlyArray<readonly [string, string]> = [
      ['externa', 'interna'],
      ['flexao', 'extensao'],
      ['supinad', 'pronad'],
      ['inclinad', 'declinad'],
    ];
    const normal = (s: string) =>
      s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

    for (const [nosso, v] of Object.entries(MAPA_PRIME)) {
      const a = normal(nosso);
      const b = normal(v.nomeNoPrime);
      for (const [x, y] of opostos) {
        const cruzou = (a.includes(x) && b.includes(y)) || (a.includes(y) && b.includes(x));
        expect(cruzou, `${nosso} ← ${v.nomeNoPrime}`).toBe(false);
      }
    }
  });

  /*
    Um vídeo pode servir a dois nomes nossos só quando os dois são o mesmo
    exercício — os sinônimos que o catálogo tem hoje. Repetição fora desta
    lista é engano de digitação no mapa.
  */
  it('só os sinônimos declarados compartilham vídeo', () => {
    const sinonimos = [
      ['Face pull', 'Face pull para ombro'],
      ['Agachamento sumô', 'Agachamento sumô com halter'],
      ['Supino fechado', 'Supino fechado (tríceps)'],
      ['Afundo', 'Afundo com halteres'],
    ].map((par) => par.slice().sort().join(' + '));

    const porVideo = new Map<string, string[]>();
    for (const [nome, v] of Object.entries(MAPA_PRIME)) {
      porVideo.set(v.video, [...(porVideo.get(v.video) ?? []), nome]);
    }
    for (const nomes of porVideo.values()) {
      if (nomes.length > 1) {
        expect(sinonimos, `vídeo repetido em: ${nomes.join(', ')}`).toContain(
          nomes.slice().sort().join(' + '),
        );
      }
    }
  });

  it('o que é para conferir diz o que conferir', () => {
    for (const [nome, v] of Object.entries(MAPA_PRIME)) {
      if (v.conferir !== undefined) expect(v.conferir.trim().length, nome).toBeGreaterThan(10);
    }
  });

  it('a procedência aponta para o player da biblioteca de origem', () => {
    expect(origemPrime('abc')).toBe(`https://iframe.mediadelivery.net/embed/${BIBLIOTECA_PRIME}/abc`);
  });

  /** Queda brusca de cobertura significa mapa quebrado, não decisão. */
  it('cobre ao menos 60% do catálogo', () => {
    expect(Object.keys(MAPA_PRIME).length / EXERCICIOS_GLOBAIS.length).toBeGreaterThan(0.6);
  });
});
