'use client';

import { useEffect, useState } from 'react';

/**
 * Escolha de tema: claro, escuro ou o do sistema.
 *
 * O CSS dos dois temas já existia e já respondia a `prefers-color-scheme` — mas
 * `data-tema`, o atributo que permite escolher, era lido pela folha de estilo e
 * nunca escrito por ninguém. Quem quisesse o painel claro num computador
 * configurado no escuro não tinha como.
 *
 * Três estados, e não um interruptor de dois: "seguir o sistema" é o padrão e
 * precisa continuar disponível depois que a pessoa experimenta os outros dois.
 * Um botão de liga-desliga obriga a escolher para sempre.
 */

type Escolha = 'sistema' | 'claro' | 'escuro';

const CHAVE = 'vivio:tema';

const ROTULO: Record<Escolha, string> = {
  sistema: 'Sistema',
  claro: 'Claro',
  escuro: 'Escuro',
};

/**
 * Aplica no `<html>`. `sistema` REMOVE o atributo em vez de escrever um valor —
 * é a ausência dele que devolve a decisão para a media query.
 */
function aplicar(escolha: Escolha): void {
  const raiz = document.documentElement;
  if (escolha === 'sistema') raiz.removeAttribute('data-tema');
  else raiz.setAttribute('data-tema', escolha);
}

function lerGuardada(): Escolha {
  try {
    const guardada = localStorage.getItem(CHAVE);
    return guardada === 'claro' || guardada === 'escuro' ? guardada : 'sistema';
  } catch {
    // Navegador com armazenamento bloqueado: segue o sistema e não quebra.
    return 'sistema';
  }
}

export function EscolhaDeTema() {
  const [escolha, setEscolha] = useState<Escolha>('sistema');
  /*
    O servidor não sabe o que está no localStorage. Renderizar o estado real no
    primeiro passe faria o HTML do servidor divergir do cliente — o React
    reclama e o botão pisca no valor errado. Só depois de montar é que a escolha
    guardada aparece.
  */
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    const guardada = lerGuardada();
    setEscolha(guardada);
    aplicar(guardada);
    setMontado(true);
  }, []);

  function escolher(nova: Escolha) {
    setEscolha(nova);
    aplicar(nova);
    try {
      if (nova === 'sistema') localStorage.removeItem(CHAVE);
      else localStorage.setItem(CHAVE, nova);
    } catch {
      // Sem persistência, vale para esta aba. Melhor do que não deixar trocar.
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Tema do painel"
      className="flex gap-xs rounded-md border p-xs"
      style={{ borderColor: 'var(--vv-borda)' }}
    >
      {(['sistema', 'claro', 'escuro'] as const).map((opcao) => {
        const ativa = montado && escolha === opcao;
        return (
          <button
            key={opcao}
            role="radio"
            aria-checked={ativa}
            onClick={() => escolher(opcao)}
            className="min-h-toque rounded-sm px-md text-sm font-semibold"
            style={{
              background: ativa ? 'var(--vv-acao-fundo)' : 'transparent',
              color: ativa ? 'var(--vv-acao-texto)' : 'var(--vv-texto-secundario)',
            }}
          >
            {ROTULO[opcao]}
          </button>
        );
      })}
    </div>
  );
}
