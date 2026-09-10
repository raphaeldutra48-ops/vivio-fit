import type { ConfigService } from '@nestjs/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ArmazenamentoLocal } from './armazenamento-local';
import { ArmazenamentoR2 } from './armazenamento-r2';

/**
 * `existe` e `gravar` nos dois drivers.
 *
 * O ponto delicado é o mesmo nos dois: só "não existe" pode virar `false`.
 * Qualquer outro erro respondido como ausência faria o importador regravar o
 * catálogo inteiro por cima de um problema que ninguém veria — credencial
 * trocada no R2, chave inválida no disco.
 */

const configFalsa = (valores: Record<string, string>): ConfigService =>
  ({
    get: (chave: string) => valores[chave],
    getOrThrow: (chave: string) => {
      const v = valores[chave];
      if (v === undefined) throw new Error(`faltou ${chave}`);
      return v;
    },
  }) as unknown as ConfigService;

describe('armazenamento local', () => {
  let raiz = '';
  let local: ArmazenamentoLocal;

  beforeAll(async () => {
    raiz = await mkdtemp(join(tmpdir(), 'vivio-midia-'));
    local = new ArmazenamentoLocal(configFalsa({ MEDIA_DIR: raiz, JWT_ACCESS_SECRET: 'segredo' }));
  });

  afterAll(async () => {
    await rm(raiz, { recursive: true, force: true });
  });

  it('o que não foi gravado não existe; o que foi, existe', async () => {
    const chave = 'catalogo/exercicios/ex-1.png';
    expect(await local.existe(chave)).toBe(false);

    await local.gravar(chave, Buffer.from('imagem'), 'image/png');

    expect(await local.existe(chave)).toBe(true);
    expect((await local.ler(chave)).toString()).toBe('imagem');
  });

  it('chave que foge da pasta é erro, e não "não existe"', async () => {
    await expect(local.existe('../../fora-da-pasta.png')).rejects.toThrow(/inválida/);
  });
});

describe('armazenamento R2', () => {
  const r2 = new ArmazenamentoR2(
    configFalsa({
      R2_BUCKET: 'vivio-midia',
      R2_ACCOUNT_ID: 'conta',
      R2_ACCESS_KEY_ID: 'chave',
      R2_SECRET_ACCESS_KEY: 'segredo',
    }),
  );
  // O cliente S3 é privado; o teste troca só o envio, que é a parte que sairia
  // pela rede.
  const cliente = (r2 as unknown as { cliente: { send: (c: unknown) => Promise<unknown> } })
    .cliente;

  it('404 é "não existe"', async () => {
    vi.spyOn(cliente, 'send').mockRejectedValueOnce(
      Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } }),
    );
    expect(await r2.existe('catalogo/exercicios/ex-1.png')).toBe(false);
  });

  it('403 não é "não existe" — o erro sobe', async () => {
    vi.spyOn(cliente, 'send').mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), {
        name: 'Forbidden',
        $metadata: { httpStatusCode: 403 },
      }),
    );
    await expect(r2.existe('catalogo/exercicios/ex-1.png')).rejects.toThrow('Forbidden');
  });

  it('resposta do HEAD é "existe"', async () => {
    vi.spyOn(cliente, 'send').mockResolvedValueOnce({});
    expect(await r2.existe('catalogo/exercicios/ex-1.png')).toBe(true);
  });

  it('gravar leva o tipo do conteúdo junto', async () => {
    // Sem ele o R2 serve octet-stream, e o navegador baixa o vídeo em vez de
    // tocá-lo.
    const envio = vi.spyOn(cliente, 'send').mockResolvedValueOnce({});
    await r2.gravar('catalogo/exercicios/ex-1-video.mp4', Buffer.from('v'), 'video/mp4');

    const comando = envio.mock.calls[0]![0] as { input: Record<string, unknown> };
    expect(comando.input).toMatchObject({
      Bucket: 'vivio-midia',
      Key: 'catalogo/exercicios/ex-1-video.mp4',
      ContentType: 'video/mp4',
    });
  });
});
