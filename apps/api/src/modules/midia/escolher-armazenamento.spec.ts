import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import {
  escolherDriverDeMidia,
  faltandoParaR2,
  midiaEmDiscoPersistente,
} from './escolher-armazenamento';

/**
 * A escolha do driver decide se a foto de evolução de um aluno sobrevive ao
 * próximo deploy. Vale um teste sem instanciar cliente de S3.
 */

const configFalsa = (valores: Record<string, string>): ConfigService =>
  ({ get: (chave: string) => valores[chave] }) as ConfigService;

const R2_COMPLETO = {
  R2_BUCKET: 'vivio-midia',
  R2_ACCESS_KEY_ID: 'chave',
  R2_SECRET_ACCESS_KEY: 'segredo',
  R2_ACCOUNT_ID: 'conta',
};

const logger = () => {
  const warn = vi.fn();
  const error = vi.fn();
  const log = vi.fn();
  return { logger: { warn, error, log } as unknown as Logger, warn, error, log };
};

describe('faltandoParaR2', () => {
  it('nada falta quando as quatro estão presentes', () => {
    expect(faltandoParaR2(configFalsa(R2_COMPLETO))).toEqual([]);
  });

  /** Quem usa domínio próprio informa o endpoint em vez da conta. */
  it('endpoint substitui a conta', () => {
    const { R2_ACCOUNT_ID: _, ...semConta } = R2_COMPLETO;
    expect(
      faltandoParaR2(configFalsa({ ...semConta, R2_ENDPOINT: 'https://midia.viviofit.com.br' })),
    ).toEqual([]);
  });

  it('lista o que falta, pelo nome da variável', () => {
    const faltando = faltandoParaR2(configFalsa({ R2_BUCKET: 'vivio-midia' }));

    expect(faltando).toContain('R2_ACCESS_KEY_ID');
    expect(faltando).toContain('R2_SECRET_ACCESS_KEY');
    expect(faltando).toContain('R2_ACCOUNT_ID (ou R2_ENDPOINT)');
    expect(faltando).not.toContain('R2_BUCKET');
  });
});

describe('escolherDriverDeMidia', () => {
  it('usa R2 quando o bucket está apontado', () => {
    const { logger: l, error } = logger();
    expect(escolherDriverDeMidia(configFalsa(R2_COMPLETO), l)).toBe('R2');
    expect(error).not.toHaveBeenCalled();
  });

  /** Configuração por presença, não por NODE_ENV: dá para conferir credencial local. */
  it('usa R2 em desenvolvimento também, se estiver configurado', () => {
    const { logger: l } = logger();
    expect(escolherDriverDeMidia(configFalsa({ ...R2_COMPLETO, NODE_ENV: 'development' }), l)).toBe(
      'R2',
    );
  });

  it('cai no disco local sem configuração, e em silêncio fora de produção', () => {
    const { logger: l, warn, error } = logger();

    expect(escolherDriverDeMidia(configFalsa({}), l)).toBe('LOCAL');
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  /** O aviso que a pendência 19 pedia: alto no boot, não descoberto depois. */
  it('em produção sem R2 e sem volume, grita que as fotos serão apagadas', () => {
    const { logger: l, error } = logger();

    expect(escolherDriverDeMidia(configFalsa({ NODE_ENV: 'production' }), l)).toBe('LOCAL');
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]![0]).toMatch(/APAGADAS no próximo deploy/);
  });

  /**
   * O aviso não pode mentir. Com volume montado a foto dura, e gritar o
   * contrário ensina todo mundo a ignorar o log — aí o dia em que ele estiver
   * certo, ninguém lê.
   */
  it('com volume persistente não grita, e diz qual disco está em uso', () => {
    const { logger: l, error, warn, log } = logger();
    const config = configFalsa({
      NODE_ENV: 'production',
      RAILWAY_VOLUME_MOUNT_PATH: '/dados/midia',
      MEDIA_DIR: '/dados/midia',
    });

    expect(escolherDriverDeMidia(config, l)).toBe('LOCAL');
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(log.mock.calls[0]![0]).toMatch(/sobrevive ao deploy/);
  });

  /** R2 configurado ganha do volume: object storage é melhor que disco. */
  it('R2 tem precedência sobre o volume', () => {
    const { logger: l } = logger();
    const config = configFalsa({
      ...R2_COMPLETO,
      RAILWAY_VOLUME_MOUNT_PATH: '/dados/midia',
      MEDIA_DIR: '/dados/midia',
    });

    expect(escolherDriverDeMidia(config, l)).toBe('R2');
  });
});

describe('midiaEmDiscoPersistente', () => {
  it('reconhece o MEDIA_DIR dentro do volume montado', () => {
    expect(
      midiaEmDiscoPersistente(
        configFalsa({ RAILWAY_VOLUME_MOUNT_PATH: '/dados/midia', MEDIA_DIR: '/dados/midia' }),
      ),
    ).toBe(true);

    expect(
      midiaEmDiscoPersistente(
        configFalsa({ RAILWAY_VOLUME_MOUNT_PATH: '/dados', MEDIA_DIR: '/dados/midia/fotos' }),
      ),
    ).toBe(true);
  });

  /** Prefixo de string não basta: /dados-teste não está dentro de /dados. */
  it('não confunde prefixo de texto com pasta de dentro', () => {
    expect(
      midiaEmDiscoPersistente(
        configFalsa({ RAILWAY_VOLUME_MOUNT_PATH: '/dados', MEDIA_DIR: '/dados-teste/midia' }),
      ),
    ).toBe(false);
  });

  it('sem volume montado, ou apontando para fora dele, é efêmero', () => {
    expect(midiaEmDiscoPersistente(configFalsa({ MEDIA_DIR: '/dados/midia' }))).toBe(false);
    expect(
      midiaEmDiscoPersistente(
        configFalsa({ RAILWAY_VOLUME_MOUNT_PATH: '/dados/midia', MEDIA_DIR: './media' }),
      ),
    ).toBe(false);
  });

  /** Meia configuração é variável esquecida, não escolha — avisa mesmo em dev. */
  it('avisa quando o R2 está configurado pela metade', () => {
    const { logger: l, warn } = logger();

    expect(escolherDriverDeMidia(configFalsa({ R2_BUCKET: 'vivio-midia' }), l)).toBe('LOCAL');
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toMatch(/R2_ACCESS_KEY_ID/);
  });
});
