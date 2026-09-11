import { describe, expect, it } from 'vitest';
import { comoDemonstracao, playerExternoSeguro, videoDeMaiorPrioridade } from './midia';

/**
 * O endereço do player vem do banco e vira `src` de iframe e de WebView. O que
 * estes testes guardam é a porta: só o player do acervo entra.
 */
describe('player externo', () => {
  const bunny = 'https://iframe.mediadelivery.net/embed/693551/cfbfd8aa-ad9c-4d86-a7a8-62b4c06420b1';

  it('aceita o player do acervo', () => {
    expect(playerExternoSeguro(bunny)).toBe(bunny);
  });

  it('recusa o que não é o player do acervo', () => {
    for (const url of [
      'http://iframe.mediadelivery.net/embed/693551/x', // sem TLS
      'https://iframe.mediadelivery.net.golpe.com/embed/693551/x', // host parecido
      'https://golpe.com/?iframe.mediadelivery.net/embed/', // host no texto
      'https://iframe.mediadelivery.net/play/693551/x', // outra rota do mesmo host
      'javascript:alert(1)',
      'não é url',
      '',
    ]) {
      expect(playerExternoSeguro(url), url).toBeNull();
    }
    expect(playerExternoSeguro(null)).toBeNull();
    expect(playerExternoSeguro(undefined)).toBeNull();
  });

  it('como demonstração: começa sozinho, mudo e em loop', () => {
    const u = new URL(comoDemonstracao(bunny));
    expect(u.hostname).toBe('iframe.mediadelivery.net');
    expect(u.pathname).toBe('/embed/693551/cfbfd8aa-ad9c-4d86-a7a8-62b4c06420b1');
    expect(u.searchParams.get('autoplay')).toBe('true');
    // Sem mudo o navegador não deixa começar sozinho.
    expect(u.searchParams.get('muted')).toBe('true');
    expect(u.searchParams.get('loop')).toBe('true');
  });
});

describe('qual vídeo tocar', () => {
  const bunny = 'https://iframe.mediadelivery.net/embed/693551/cfbfd8aa-ad9c-4d86-a7a8-62b4c06420b1';
  const arquivo = 'https://api.viviofit.com.br/api/v1/midia/arquivo?chave=x&assinatura=y';

  it('o arquivo nosso vence o player de fora', () => {
    /*
      O arquivo pode ser a gravação do personal do aluno. Mostrar a
      demonstração genérica por cima dela seria esconder justamente o vídeo
      que mostra o aparelho da academia dele.
    */
    expect(videoDeMaiorPrioridade({ arquivoUrl: arquivo, playerUrl: bunny })).toEqual({
      tipo: 'ARQUIVO',
      url: arquivo,
    });
  });

  it('sem arquivo, o player de fora cobre — já como demonstração', () => {
    const v = videoDeMaiorPrioridade({ playerUrl: bunny });
    expect(v?.tipo).toBe('PLAYER');
    expect(new URL(v!.url).searchParams.get('loop')).toBe('true');
  });

  it('player de host não aceito é como não ter vídeo', () => {
    expect(videoDeMaiorPrioridade({ playerUrl: 'https://golpe.com/embed/x' })).toBeNull();
  });

  it('sem nada, nada', () => {
    expect(videoDeMaiorPrioridade({})).toBeNull();
  });

  it('arquivo que existe mas ainda não foi pedido não é coberto pelo de fora', () => {
    // O site só busca o link ao clicar em "Ver vídeo". Até lá, nada de player
    // genérico por cima da gravação do personal.
    expect(videoDeMaiorPrioridade({ temArquivo: true, playerUrl: bunny })).toBeNull();
  });
});
