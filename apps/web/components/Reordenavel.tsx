'use client';

import { useRef, useState, type DragEvent } from 'react';

/**
 * Arrastar para reordenar (pendência 6), sem biblioteca e **sem tirar nada**.
 *
 * Os botões ↑ ↓ continuam onde estavam: arrastar não existe no teclado nem no
 * leitor de tela, e trocar um pelo outro seria pagar polimento com
 * acessibilidade. Quem usa mouse ganha o gesto; quem não usa não perde o que
 * já tinha.
 *
 * Só o punho é arrastável. Tornar o cartão inteiro arrastável impediria
 * selecionar o texto dos campos de série e repetição que moram dentro dele.
 */
export function useArrasteParaReordenar(aoReordenar: (de: number, para: number) => void) {
  // A origem vive num ref, não só no estado: `onDragOver` e `onDrop` precisam
  // dela agora, e o estado só chega no render seguinte. Numa sequência rápida
  // de eventos o manipulador ainda leria `null` e o gesto não faria nada. O
  // estado existe em paralelo porque é dele que o destaque visual depende.
  const origem = useRef<number | null>(null);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [alvo, setAlvo] = useState<number | null>(null);

  const encerrar = () => {
    origem.current = null;
    setArrastando(null);
    setAlvo(null);
  };

  return {
    /** Índice sobre o qual o item pairaria — para destacar onde vai cair. */
    alvo,
    arrastando,

    propsDoPunho: (indice: number) => ({
      draggable: true,
      onDragStart: (e: DragEvent) => {
        origem.current = indice;
        setArrastando(indice);
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          // Firefox só inicia o arrasto se algum dado for definido.
          e.dataTransfer.setData('text/plain', String(indice));
        }
      },
      onDragEnd: encerrar,
    }),

    propsDoItem: (indice: number) => ({
      onDragOver: (e: DragEvent) => {
        if (origem.current === null) return;
        // Sem o preventDefault o navegador recusa a soltura — é assim que a
        // API de arrastar do HTML sinaliza "aqui pode".
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        setAlvo(indice);
      },
      onDragLeave: () => setAlvo((atual) => (atual === indice ? null : atual)),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        const de = origem.current;
        if (de !== null && de !== indice) aoReordenar(de, indice);
        encerrar();
      },
    }),
  };
}

/** Estilo do cartão enquanto o gesto acontece. */
export function estiloDeArraste(
  indice: number,
  arrastando: number | null,
  alvo: number | null,
): React.CSSProperties {
  if (arrastando === indice) return { opacity: 0.4 };
  if (alvo === indice && arrastando !== null) {
    return { outline: '2px solid var(--vv-acao-fundo)', outlineOffset: '2px' };
  }
  return {};
}

/**
 * Punho de arraste.
 *
 * `aria-hidden`: para quem navega por teclado ele não faz nada — os botões
 * ↑ ↓ ao lado é que movem. Anunciá-lo como controle seria oferecer uma parada
 * de tabulação que não leva a lugar nenhum.
 */
export function PunhoDeArraste({
  titulo,
  ...props
}: { titulo: string } & Record<string, unknown>) {
  return (
    <span
      {...props}
      aria-hidden="true"
      title={titulo}
      className="min-h-toque cursor-grab select-none px-xs text-lg active:cursor-grabbing"
      style={{ color: 'var(--vv-texto-secundario)' }}
    >
      ⠿
    </span>
  );
}
