import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import {
  PREFIXO,
  formatoDe,
  gravacaoDura,
  planejar,
  type ExercicioParaImportar,
} from './importar-wger';
import type { MidiaDoWger } from './wger';

/**
 * A decisão do importador, sem rede e sem armazenamento.
 *
 * O caso que motivou a reescrita é o terceiro: coluna preenchida e arquivo
 * sumido. Era o estado em que o deploy deixava o catálogo — e o importador
 * antigo olhava a coluna, via "já tem", e pulava. Rodar de novo não consertava
 * nada.
 */

const imagem: MidiaDoWger = {
  url: 'https://wger.de/media/exercise-images/73/supino.png',
  credito: 'fulano — CC-BY-SA 4.0 (via wger)',
  origemUrl: 'https://wger.de/en/exercise/73/view/',
  tipo: 'IMAGEM',
};
const video: MidiaDoWger = { ...imagem, url: 'https://wger.de/media/video/73', tipo: 'VIDEO' };

const exercicio = (e: Partial<ExercicioParaImportar> = {}): ExercicioParaImportar => ({
  id: 'ex-1',
  imagemChave: null,
  videoChave: null,
  ...e,
});

const nada = { imagem: false, video: false };
const semVideo = { comVideo: false };
const comVideo = { comVideo: true };

describe('planejar a importação de um exercício', () => {
  it('coluna vazia e mídia no wger: traz a imagem', () => {
    expect(planejar(exercicio(), [imagem], nada, semVideo)).toEqual([
      { tipo: 'IMAGEM', motivo: 'NOVA', midia: imagem },
    ]);
  });

  it('coluna preenchida e arquivo no lugar: não mexe', () => {
    const e = exercicio({ imagemChave: `${PREFIXO}/ex-1.png` });
    expect(planejar(e, [imagem], { imagem: true, video: false }, semVideo)).toEqual([]);
  });

  it('coluna preenchida e arquivo SUMIDO: traz de novo', () => {
    /*
      O defeito que a reescrita corrige. A coluna diz que o arquivo foi
      gravado um dia; o armazenamento diz que ele não existe mais. Quem manda é
      o armazenamento.
    */
    const e = exercicio({ imagemChave: `${PREFIXO}/ex-1.png` });
    expect(planejar(e, [imagem], nada, semVideo)).toEqual([
      { tipo: 'IMAGEM', motivo: 'PERDIDA', midia: imagem },
    ]);
  });

  it('arquivo sumido com chave que não é do catálogo: não é dele consertar', () => {
    const e = exercicio({ imagemChave: 'exercicios/prof-9/foto.png' });
    expect(planejar(e, [imagem], nada, semVideo)).toEqual([]);
  });

  it('sem imagem no wger, não inventa', () => {
    expect(planejar(exercicio(), [], nada, semVideo)).toEqual([]);
  });

  it('vídeo só entra quando pedido', () => {
    expect(planejar(exercicio(), [imagem, video], nada, semVideo).map((a) => a.tipo)).toEqual([
      'IMAGEM',
    ]);
    expect(planejar(exercicio(), [imagem, video], nada, comVideo).map((a) => a.tipo)).toEqual([
      'IMAGEM',
      'VIDEO',
    ]);
  });

  it('vídeo do profissional nunca é trocado, nem se o arquivo sumiu', () => {
    /*
      O gravado pelo profissional mostra o aparelho da academia dele. Perder o
      arquivo é um problema a avisar — não uma vaga para uma demonstração
      genérica ocupar em silêncio.
    */
    const e = exercicio({ videoChave: 'exercicios/prof-9/demo.mp4' });
    expect(planejar(e, [video], nada, comVideo)).toEqual([]);
  });

  it('vídeo do catálogo que sumiu volta, se o vídeo foi pedido', () => {
    const e = exercicio({ videoChave: `${PREFIXO}/ex-1-video.mp4` });
    expect(planejar(e, [video], nada, comVideo)).toEqual([
      { tipo: 'VIDEO', motivo: 'PERDIDA', midia: video },
    ]);
  });
});

describe('formato do arquivo baixado', () => {
  it('vídeo servido por caminho sem extensão sai como mp4, e não como .bin', () => {
    // O wger serve vídeo assim, e a primeira versão gravou 14 arquivos `.bin`
    // que o navegador não tocava.
    expect(formatoDe('https://wger.de/media/video/73', 'video/mp4')).toEqual({
      mime: 'video/mp4',
      ext: '.mp4',
    });
  });

  it('parâmetro no Content-Type não atrapalha', () => {
    expect(formatoDe('https://x/y', 'image/jpeg; charset=binary')?.ext).toBe('.jpg');
  });

  it('sem tipo reconhecível, a extensão da URL decide — e leva o tipo junto', () => {
    // O tipo vai para o armazenamento: sem ele o R2 serve octet-stream.
    expect(formatoDe('https://x/foto.PNG', 'application/octet-stream')).toEqual({
      mime: 'image/png',
      ext: '.png',
    });
  });

  it('formato desconhecido é recusado', () => {
    expect(formatoDe('https://x/arquivo', 'application/octet-stream')).toBeNull();
  });
});

describe('a gravação sobrevive ao deploy?', () => {
  const config = (valores: Record<string, string>): ConfigService =>
    ({ get: (chave: string) => valores[chave] }) as ConfigService;

  it('fora de produção, grava', () => {
    expect(gravacaoDura(config({}), false)).toBe(true);
  });

  it('em produção com R2, grava', () => {
    expect(gravacaoDura(config({ NODE_ENV: 'production' }), true)).toBe(true);
  });

  it('em produção com o volume do Railway, grava', () => {
    /*
      O caso que a primeira versão desta trava errava: ela só perguntava pelo
      R2, e recusaria importar justamente na produção de hoje — onde o volume
      em /dados/midia guarda a mídia entre um deploy e outro.
    */
    const railway = config({
      NODE_ENV: 'production',
      RAILWAY_VOLUME_MOUNT_PATH: '/dados/midia',
      MEDIA_DIR: '/dados/midia',
    });
    expect(gravacaoDura(railway, false)).toBe(true);
  });

  it('em produção sem R2 e sem volume, recusa — seria link quebrado', () => {
    expect(gravacaoDura(config({ NODE_ENV: 'production', MEDIA_DIR: '/dados/midia' }), false)).toBe(
      false,
    );
  });
});
