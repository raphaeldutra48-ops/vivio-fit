/**
 * Move um item de posição, empurrando o resto.
 *
 * Não é troca de pares: arrastar o 5º para o 1º tem de deixar os outros na
 * mesma ordem relativa, e uma troca embaralharia. Os botões ↑ ↓ são o caso
 * particular `reordenar(itens, i, i ± 1)`, que dá no mesmo — por isso uma
 * função só serve às duas formas de reordenar.
 */
export function reordenar<T>(itens: T[], de: number, para: number): T[] {
  if (de === para) return itens;
  if (de < 0 || de >= itens.length) return itens;

  // Fora da lista, encosta na ponta: arrastar para baixo do último item é uma
  // intenção clara, e devolver a lista intacta pareceria travamento.
  const destino = Math.max(0, Math.min(itens.length - 1, para));
  if (de === destino) return itens;

  const copia = [...itens];
  const [movido] = copia.splice(de, 1);
  copia.splice(destino, 0, movido!);
  return copia;
}

/** Texto lido pelo leitor de tela depois de mover — ver `lib/anuncio.ts`. */
export function anuncioDeMovimento(nome: string, posicao: number, total: number): string {
  return `${nome} movido para a posição ${posicao} de ${total}.`;
}
