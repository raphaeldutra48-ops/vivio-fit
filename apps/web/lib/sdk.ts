import { VivioClient, type TokensArmazenados } from '@vivio/sdk';

const CHAVE = 'vivio.tokens';

function ler(): TokensArmazenados | null {
  if (typeof window === 'undefined') return null;
  const bruto = window.localStorage.getItem(CHAVE);
  return bruto ? (JSON.parse(bruto) as TokensArmazenados) : null;
}

function gravar(tokens: TokensArmazenados | null): void {
  if (typeof window === 'undefined') return;
  if (tokens) window.localStorage.setItem(CHAVE, JSON.stringify(tokens));
  else window.localStorage.removeItem(CHAVE);
}

export const limparTokens = (): void => gravar(null);

export const sdk = new VivioClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333',
  carregarTokens: ler,
  aoAtualizarTokens: (par) =>
    gravar({ accessToken: par.accessToken, refreshToken: par.refreshToken }),
  aoPerderSessao: () => {
    gravar(null);
    if (typeof window !== 'undefined') window.location.href = '/login';
  },
});
