import { VivioClient } from '@vivio/sdk';

/**
 * Telas que existem justamente para quem ainda não tem sessão.
 *
 * Sem esta lista, o `me.obter()` que o SessaoProvider dispara no boot falha,
 * o SDK conclui que a sessão morreu e manda todo mundo para /login — inclusive
 * quem acabou de clicar no link de confirmação do e-mail, que é exatamente
 * quem nunca está autenticado.
 */
const ROTAS_PUBLICAS = ['/login', '/cadastrar', '/verificar-email'];

const emRotaPublica = (): boolean =>
  typeof window !== 'undefined' &&
  ROTAS_PUBLICAS.some((rota) => window.location.pathname.startsWith(rota));

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
    if (typeof window !== 'undefined' && !emRotaPublica()) {
      window.location.href = '/login';
    }
  },
});

/** Sessão encerrada: o cookie quem apaga é o servidor, no /auth/logout. */
export const limparTokens = (): void => sdk.definirTokens(null);
