/**
 * Origens autorizadas a conversar com a API.
 *
 * Com `credentials: true` no CORS, refletir qualquer origem entregaria a sessão
 * do usuário a qualquer site que ele visitasse. Por isso a lista é explícita, e
 * por isso produção sem configuração devolve vazio — o bootstrap trata isso como
 * erro fatal, em vez de subir uma API que aceita todo mundo.
 */
export function origensPermitidas(
  ambiente: Record<string, string | undefined> = process.env,
): string[] {
  const configurado = ambiente.ORIGENS_PERMITIDAS?.trim();
  if (configurado) {
    return configurado
      .split(',')
      .map((origem) => origem.trim().replace(/\/$/, ''))
      .filter(Boolean);
  }

  if (ambiente.NODE_ENV === 'production') return [];

  // Desenvolvimento: a web e o Expo.
  return ['http://localhost:3000', 'http://localhost:8081'];
}
