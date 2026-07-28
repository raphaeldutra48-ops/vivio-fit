/**
 * UUID v4 para identificar a execução no cliente.
 *
 * É gerado no aparelho ANTES do envio: é ele que torna o registro idempotente
 * quando a fila offline reenvia o mesmo treino.
 */
export function gerarUuid(): string {
  const nativo = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (typeof nativo?.randomUUID === 'function') return nativo.randomUUID();

  // React Native nem sempre expõe crypto.randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (caractere) => {
    const aleatorio = Math.trunc(Math.random() * 16);
    const valor = caractere === 'x' ? aleatorio : (aleatorio & 0x3) | 0x8;
    return valor.toString(16);
  });
}
