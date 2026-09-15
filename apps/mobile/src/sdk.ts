import { PROJETO_SUPABASE, VivioClient } from '@vivio/sdk';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * A sessão fica no SecureStore (Keychain no iOS, Keystore no Android).
 *
 * É armazenamento do sistema operacional, fora do alcance do JavaScript de
 * qualquer outro app — a mesma proteção que o cookie httpOnly dava no
 * navegador, e que no navegador se perdeu ao falar direto com o banco. Aqui
 * não se perde.
 *
 * No navegador (expo web, usado para desenvolver) cai no localStorage: o
 * SecureStore não existe lá.
 *
 * O `supabase-js` grava valores grandes; o SecureStore tem limite de 2 KB por
 * chave e avisa acima disso. Por isso o valor é quebrado em pedaços, com o
 * índice guardado na chave original.
 */
const LIMITE = 1800;

const armazenamento = {
  async getItem(chave: string): Promise<string | null> {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(chave) ?? null;

    const cabeca = await SecureStore.getItemAsync(chave);
    if (cabeca === null) return null;
    // Guardado inteiro (o caso comum), ou o número de pedaços.
    const pedacos = /^(\d+)$/.exec(cabeca);
    if (!pedacos) return cabeca;

    const partes: string[] = [];
    for (let i = 0; i < Number(pedacos[1]); i += 1) {
      partes.push((await SecureStore.getItemAsync(`${chave}.${i}`)) ?? '');
    }
    return partes.join('');
  },

  async setItem(chave: string, valor: string): Promise<void> {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(chave, valor);
      return;
    }
    await limparPedacos(chave);
    if (valor.length <= LIMITE) {
      await SecureStore.setItemAsync(chave, valor);
      return;
    }
    const total = Math.ceil(valor.length / LIMITE);
    for (let i = 0; i < total; i += 1) {
      await SecureStore.setItemAsync(`${chave}.${i}`, valor.slice(i * LIMITE, (i + 1) * LIMITE));
    }
    await SecureStore.setItemAsync(chave, `${total}`);
  },

  async removeItem(chave: string): Promise<void> {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.removeItem(chave);
      return;
    }
    await limparPedacos(chave);
    await SecureStore.deleteItemAsync(chave);
  },
};

/** Apaga os pedaços de uma gravação anterior, para não sobrar cauda. */
async function limparPedacos(chave: string): Promise<void> {
  const cabeca = await SecureStore.getItemAsync(chave);
  const m = cabeca === null ? null : /^(\d+)$/.exec(cabeca);
  if (!m) return;
  for (let i = 0; i < Number(m[1]); i += 1) {
    await SecureStore.deleteItemAsync(`${chave}.${i}`);
  }
}

const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;

export const sdk = new VivioClient({
  supabase: {
    // O padrão vem do código pelo mesmo motivo da web: a chave `anon` é
    // pública por desenho, e quem protege os dados é o RLS. Aqui pesa ainda
    // mais — um build publicado na loja sem a variável não tem como ser
    // corrigido por painel nenhum.
    url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra?.supabaseUrl ?? PROJETO_SUPABASE.url,
    chaveAnonima:
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
      extra?.supabaseAnonKey ??
      PROJETO_SUPABASE.chaveAnonima,
    armazenamento,
    urlDeRetorno: 'viviofit://redefinir-senha',
  },
});
