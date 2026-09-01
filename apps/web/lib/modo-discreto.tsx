'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Modo discreto — esconde da tela o dado de saúde do aluno.
 *
 * A ideia veio do "Ocultar valores" do Prime Coaching, que esconde faturamento.
 * Aqui ela vale mais e por um motivo melhor: o que está na tela do Vívio não é
 * dinheiro do profissional, é dado de saúde de outra pessoa. Um personal que
 * abre a ficha da aluna no meio da academia expõe peso, percentual de gordura e
 * condição clínica dela para qualquer um que passe atrás — e a aluna não está
 * lá para consentir com isso.
 *
 * Não é segurança: quem tem a sessão aberta continua podendo revelar num
 * clique. É controle de plateia, que é o risco real de um app usado em pé, num
 * salão cheio.
 */

const CHAVE = 'vivio:discreto';

interface Valor {
  discreto: boolean;
  alternar: () => void;
}

const Contexto = createContext<Valor>({ discreto: false, alternar: () => undefined });

export function ProvedorDeModoDiscreto({ children }: { children: ReactNode }) {
  const [discreto, setDiscreto] = useState(false);

  /*
    Lido depois da montagem, e não no `useState` inicial: o servidor não tem
    `localStorage`, e um valor diferente entre servidor e cliente quebra a
    hidratação. Aqui o custo é um quadro com os valores visíveis — aceitável,
    porque a preferência protege de quem olha a tela, não de quem lê o HTML.
  */
  useEffect(() => {
    try {
      setDiscreto(localStorage.getItem(CHAVE) === 'sim');
    } catch {
      // Navegador com armazenamento bloqueado: o modo funciona, só não lembra.
    }
  }, []);

  const alternar = useCallback(() => {
    setDiscreto((antes) => {
      const agora = !antes;
      try {
        localStorage.setItem(CHAVE, agora ? 'sim' : 'nao');
      } catch {
        // idem
      }
      return agora;
    });
  }, []);

  return <Contexto.Provider value={{ discreto, alternar }}>{children}</Contexto.Provider>;
}

export function useModoDiscreto(): Valor {
  return useContext(Contexto);
}

/**
 * Envolve um valor sensível.
 *
 * Com o modo ligado, a tela mostra `•••` e o leitor de tela anuncia que o
 * conteúdo está oculto — em vez de ler três pontos, que não significam nada.
 *
 * O valor real continua no documento marcado como `data-so-imprime`, porque
 * imprimir é ato deliberado para um destinatário conhecido: a ficha que o
 * profissional entrega ao aluno não pode sair censurada.
 */
export function Sensivel({ children }: { children: ReactNode }) {
  const { discreto } = useModoDiscreto();
  if (!discreto) return <>{children}</>;

  return (
    <>
      <span data-nao-imprime aria-label="Valor oculto pelo modo discreto" title="Modo discreto">
        •••
      </span>
      <span data-so-imprime aria-hidden>
        {children}
      </span>
    </>
  );
}
