import { VivioClient } from '@vivio/sdk';

/**
 * Nada de token em `localStorage`.
 *
 * O refresh de 30 dias mora num cookie httpOnly emitido pela API — o
 * JavaScript da página não consegue lê-lo, então um XSS não consegue roubá-lo.
 * O access token de 15 minutos fica só na memória do cliente e some ao recarregar;
 * na volta, o SDK troca o cookie por um par novo sozinho.
 */
export const sdk = new VivioClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333',
  usarCookieDeRefresh: true,
  aoPerderSessao: () => {
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  },
});

/** Sessão encerrada: o cookie quem apaga é o servidor, no /auth/logout. */
export const limparTokens = (): void => sdk.definirTokens(null);
