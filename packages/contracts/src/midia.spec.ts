import { describe, expect, it } from 'vitest';
import {
  caminhoDeMidia,
  chaveDeMidia,
  comoDemonstracao,
  partesDaChave,
  playerExternoSeguro,
  urlPublicaDoCatalogo,
  videoDeMaiorPrioridade,
} from './midia';

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

describe('endereço do arquivo no Storage', () => {
  it('a primeira pasta é o dono — é ela que a política lê', () => {
    const caminho = caminhoDeMidia('user-1', 'image/png');
    expect(caminho.startsWith('user-1/')).toBe(true);
    expect(caminho.endsWith('.png')).toBe(true);
  });

  it('dois envios seguidos não se atropelam', () => {
    const a = caminhoDeMidia('user-1', 'image/png');
    const b = caminhoDeMidia('user-1', 'image/png');
    expect(a).not.toBe(b);
  });

  it('cada tipo cai no seu compartimento', () => {
    expect(chaveDeMidia('FOTO_EVOLUCAO', 'u', 'image/jpeg').startsWith('evolucao/u/')).toBe(true);
    expect(chaveDeMidia('LAUDO_EXAME', 'u', 'application/pdf').startsWith('exames/u/')).toBe(true);
    expect(chaveDeMidia('VIDEO_EXERCICIO', 'u', 'video/mp4').startsWith('exercicios/u/')).toBe(true);
  });

  it('formato desconhecido vira .bin, e não quebra o envio', () => {
    expect(caminhoDeMidia('u', 'application/sei-la').endsWith('.bin')).toBe(true);
  });

  it('desmonta a chave guardada, e recusa o que não dá para usar', () => {
    expect(partesDaChave('evolucao/u1/foto.png')).toEqual({
      compartimento: 'evolucao',
      caminho: 'u1/foto.png',
    });
    for (const ruim of ['', null, undefined, 'sembarra', '/comeca-com-barra', 'termina/']) {
      expect(partesDaChave(ruim), String(ruim)).toBeNull();
    }
  });

  it('só o catálogo tem URL pública', () => {
    expect(urlPublicaDoCatalogo('https://x.supabase.co', 'catalogo/exercicios/a.png')).toBe(
      'https://x.supabase.co/storage/v1/object/public/catalogo/exercicios/a.png',
    );
    // Foto de evolução por URL pública seria dado de saúde aberto na internet.
    expect(urlPublicaDoCatalogo('https://x.supabase.co', 'evolucao/u1/foto.png')).toBeNull();
  });
});
