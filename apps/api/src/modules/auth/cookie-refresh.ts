import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

export const COOKIE_REFRESH = 'vivio_refresh';

/**
 * Cabeçalho com que o cliente declara que quer o refresh em cookie httpOnly.
 *
 * Só a web pede: no mobile não existe cookie jar compartilhado e o token vive
 * no SecureStore, que é armazenamento do sistema, não do JavaScript.
 */
export const CABECALHO_CLIENTE = 'x-vivio-cliente';

export const querCookie = (req: Request): boolean =>
  req.header(CABECALHO_CLIENTE)?.toLowerCase() === 'web';

export const refreshDoCookie = (req: Request): string | undefined =>
  (req.cookies as Record<string, string> | undefined)?.[COOKIE_REFRESH];

/**
 * `Path` restrito a /auth: o cookie não acompanha nenhuma outra requisição da
 * API, então nem o servidor nem um proxy o veem fora do fluxo de sessão.
 *
 * `sameSite=lax` já barra CSRF aqui, porque o navegador não manda cookie Lax em
 * POST cross-site — e refresh e logout são POST. Se um dia a web e a API
 * ficarem em domínios diferentes (não subdomínios do mesmo), isto precisa virar
 * `none` e aí um token anti-CSRF passa a ser necessário.
 */
function opcoes(config: ConfigService) {
  const producao = config.get<string>('NODE_ENV') === 'production';
  return {
    httpOnly: true,
    secure: producao,
    sameSite: (config.get<string>('COOKIE_SAMESITE') ?? 'lax') as 'lax' | 'strict' | 'none',
    path: '/api/v1/auth',
  };
}

/** Converte "30d", "12h", "45m" em milissegundos. */
function paraMilissegundos(ttl: string): number {
  const casou = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!casou) return 30 * 24 * 60 * 60 * 1000;
  const fator = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[casou[2]]!;
  return Number(casou[1]) * fator;
}

export function definirCookieDeRefresh(
  res: Response,
  config: ConfigService,
  refreshToken: string,
): void {
  res.cookie(COOKIE_REFRESH, refreshToken, {
    ...opcoes(config),
    maxAge: paraMilissegundos(config.get<string>('JWT_REFRESH_TTL') ?? '30d'),
  });
}

export function limparCookieDeRefresh(res: Response, config: ConfigService): void {
  // Sem maxAge: os demais atributos precisam bater com os do cookie original,
  // senão o navegador cria um segundo cookie em vez de apagar o primeiro.
  res.clearCookie(COOKIE_REFRESH, opcoes(config));
}
