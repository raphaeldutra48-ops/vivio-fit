'use client';

import { useEffect } from 'react';

/**
 * Liga o trabalhador de fundo que torna o site instalável.
 *
 * Sem ele o Android não oferece "instalar", e a tela de sem conexão não
 * existe. Registra depois do carregamento para não disputar rede com a
 * primeira pintura — o trabalhador não serve nada nesta visita mesmo, e sim
 * nas próximas.
 *
 * Falha de registro não pode quebrar nada: navegador antigo, aba anônima e
 * armazenamento bloqueado são casos normais, e em todos o site continua
 * funcionando como site.
 */
export function RegistraAplicativo() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const registrar = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    };

    if (document.readyState === 'complete') {
      registrar();
      return;
    }
    window.addEventListener('load', registrar);
    return () => window.removeEventListener('load', registrar);
  }, []);

  return null;
}
