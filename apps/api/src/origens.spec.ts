import { describe, expect, it } from 'vitest';
import { origensPermitidas } from './origens';

describe('origensPermitidas', () => {
  it('lê a lista da configuração, separada por vírgula', () => {
    expect(
      origensPermitidas({
        ORIGENS_PERMITIDAS: 'https://app.viviofit.com.br, https://outro.com.br',
      }),
    ).toEqual(['https://app.viviofit.com.br', 'https://outro.com.br']);
  });

  /** Origem no CORS é comparada como string: "…/" nunca casaria com "…". */
  it('remove a barra final', () => {
    expect(origensPermitidas({ ORIGENS_PERMITIDAS: 'https://app.viviofit.com.br/' })).toEqual([
      'https://app.viviofit.com.br',
    ]);
  });

  /**
   * O bootstrap trata lista vazia como erro fatal. Devolver algo aqui seria
   * subir em produção com uma origem que ninguém revisou.
   */
  it('em produção sem configuração, não autoriza ninguém', () => {
    expect(origensPermitidas({ NODE_ENV: 'production' })).toEqual([]);
    expect(origensPermitidas({ NODE_ENV: 'production', ORIGENS_PERMITIDAS: '  ' })).toEqual([]);
  });

  it('em desenvolvimento, a web e o Expo', () => {
    expect(origensPermitidas({})).toEqual(['http://localhost:3000', 'http://localhost:8081']);
  });

  it('configuração explícita vence o padrão de desenvolvimento', () => {
    expect(origensPermitidas({ ORIGENS_PERMITIDAS: 'http://localhost:4000' })).toEqual([
      'http://localhost:4000',
    ]);
  });

  it('ignora vírgulas sobrando', () => {
    expect(origensPermitidas({ ORIGENS_PERMITIDAS: 'https://a.com,,https://b.com,' })).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });
});
