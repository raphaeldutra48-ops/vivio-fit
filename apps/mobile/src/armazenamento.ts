import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Camada fina sobre o AsyncStorage.
 *
 * Nada aqui é dado clínico bruto de terceiros: guardamos o plano do próprio
 * aluno e os treinos que ele acabou de fazer, no aparelho dele.
 */
export async function ler<T>(chave: string): Promise<T | null> {
  try {
    const bruto = await AsyncStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as T) : null;
  } catch {
    // Cache corrompido não pode derrubar o app — trata como ausente.
    return null;
  }
}

export async function gravar(chave: string, valor: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // Sem espaço ou storage indisponível: seguimos sem cache.
  }
}

export async function apagar(chave: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(chave);
  } catch {
    /* idem */
  }
}
