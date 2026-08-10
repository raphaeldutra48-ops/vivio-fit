import { VivioClient, type TokensArmazenados } from '@vivio/sdk';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CHAVE = 'vivio.tokens';

/**
 * No dispositivo os tokens ficam no SecureStore (Keychain / Keystore).
 * No navegador (expo web, usado para desenvolver) cai no localStorage —
 * o SecureStore não existe lá.
 */
async function ler(): Promise<TokensArmazenados | null> {
  const bruto =
    Platform.OS === 'web'
      ? globalThis.localStorage?.getItem(CHAVE)
      : await SecureStore.getItemAsync(CHAVE);
  return bruto ? (JSON.parse(bruto) as TokensArmazenados) : null;
}

async function gravar(tokens: TokensArmazenados | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (tokens) globalThis.localStorage?.setItem(CHAVE, JSON.stringify(tokens));
    else globalThis.localStorage?.removeItem(CHAVE);
    return;
  }
  if (tokens) await SecureStore.setItemAsync(CHAVE, JSON.stringify(tokens));
  else await SecureStore.deleteItemAsync(CHAVE);
}

export const limparTokens = (): Promise<void> => gravar(null);

/*
  A variável vem primeiro para dar como apontar o app para a API local sem
  editar o `app.json` — que guarda o endereço de produção e não deve ser
  mexido para rodar em casa. Um `app.json` alterado por engano é a forma mais
  fácil de publicar uma versão do app falando com o servidor errado.

  No navegador use `127.0.0.1`, não `localhost`: `localhost` resolve para IPv6
  (::1) e a API de desenvolvimento escuta só em IPv4.
*/
const apiUrl =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'http://localhost:3333';

export const sdk = new VivioClient({
  baseUrl: apiUrl,
  carregarTokens: ler,
  aoAtualizarTokens: (par) =>
    gravar({ accessToken: par.accessToken, refreshToken: par.refreshToken }),
  aoPerderSessao: () => gravar(null),
});
