import { describe, expect, it } from 'vitest';
import { CREDITO_PRIME, origemPrime, type VideoPrime } from './prime';
import { planejarVinculo, type ExercicioParaVincular } from './vincular-prime';

/** O que o vínculo grava em cada exercício — e, principalmente, onde não mexe. */
describe('vincular o player do Prime', () => {
  const certo: VideoPrime = { nomeNoPrime: 'Supino reto com barra', video: 'aaaa' };
  const aConferir: VideoPrime = { ...certo, conferir: 'o nome não diz o aparelho' };
  const vazio: ExercicioParaVincular = { videoChave: null, videoExternoUrl: null, videoCredito: null };

  it('grava o player, o crédito e a procedência', () => {
    expect(planejarVinculo(vazio, certo, { comConferir: false })).toEqual({
      videoExternoUrl: origemPrime('aaaa'),
      videoCredito: CREDITO_PRIME,
      videoOrigemUrl: origemPrime('aaaa'),
    });
  });

  it('o par a conferir só entra quando pedido', () => {
    expect(planejarVinculo(vazio, aConferir, { comConferir: false })).toBeNull();
    expect(planejarVinculo(vazio, aConferir, { comConferir: true })).not.toBeNull();
  });

  it('exercício com vídeo nosso não é tocado — nem o crédito dele', () => {
    /*
      O crédito que está ali é o do arquivo nosso. Trocá-lo pelo do Prime
      atribuiria a eles um vídeo que não é deles.
    */
    const comArquivo = { ...vazio, videoChave: 'catalogo/exercicios/x-video.mp4', videoCredito: 'Fulano — CC-BY 4.0' };
    expect(planejarVinculo(comArquivo, certo, { comConferir: true })).toBeNull();
  });

  it('rodar de novo não escreve nada', () => {
    const jaVinculado = { ...vazio, videoExternoUrl: origemPrime('aaaa'), videoCredito: CREDITO_PRIME };
    expect(planejarVinculo(jaVinculado, certo, { comConferir: false })).toBeNull();
  });

  it('fora do mapa, nada', () => {
    expect(planejarVinculo(vazio, undefined, { comConferir: true })).toBeNull();
  });
});
