'use client';

import { useEffect, useRef } from 'react';

/**
 * Repetir uma ação de tempos em tempos — só com a aba visível.
 *
 * Irmão do gancho de mesmo nome no aplicativo, e existe pelo mesmo motivo: uma
 * sondagem que não sabe se alguém está olhando continua consumindo rede e
 * bateria de quem já foi fazer outra coisa.
 *
 * O navegador estrangula temporizador em aba oculta, mas não o desliga — ele
 * passa a disparar cerca de uma vez por minuto. O profissional que deixa o
 * painel aberto num pino a manhã inteira ainda paga por isso, e o servidor
 * responde a todas.
 *
 * Ao voltar a ficar visível, a ação roda **na hora**: quem volta para a aba
 * quer o dado atual, não o de quinze segundos atrás.
 */
export function useSondagem(acao: () => void, intervaloMs: number, ativa = true): void {
  // A ação quase sempre chega como função nova a cada render; sem a referência,
  // o efeito se refaria e o intervalo reiniciaria antes de vencer.
  const ultima = useRef(acao);
  ultima.current = acao;

  useEffect(() => {
    if (!ativa) return;

    let intervalo: ReturnType<typeof setInterval> | null = null;

    const ligar = () => {
      if (intervalo === null) intervalo = setInterval(() => ultima.current(), intervaloMs);
    };
    const desligar = () => {
      if (intervalo !== null) {
        clearInterval(intervalo);
        intervalo = null;
      }
    };

    if (!document.hidden) ligar();

    const aoMudarVisibilidade = () => {
      if (document.hidden) {
        desligar();
      } else {
        ultima.current();
        ligar();
      }
    };

    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    return () => {
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      desligar();
    };
  }, [intervaloMs, ativa]);
}
