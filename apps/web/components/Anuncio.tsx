/**
 * Região viva para leitor de tela.
 *
 * Reordenar com os botões ↑ ↓ muda a lista sem mudar o foco: para quem enxerga
 * a tela, o item visivelmente subiu; para quem ouve, nada aconteceu. Esta
 * região é o que transforma o movimento em informação.
 *
 * `polite` e não `assertive`: reordenar não é urgente, e interromper a leitura
 * em curso a cada clique seria pior do que esperar a pausa.
 */
export function Anuncio({ texto }: { texto: string }) {
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {texto}
    </p>
  );
}
