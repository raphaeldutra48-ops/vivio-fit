'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Lista que vem de uma busca digitada — com atraso e sem corrida.
 *
 * Cinco telas repetiam o mesmo efeito: a cada tecla, uma requisição, e
 * `.then(setLista)` sem nenhuma ordem. Duas coisas davam errado, e a segunda é
 * séria:
 *
 * 1. **Uma requisição por tecla.** Digitar "frango" disparava seis buscas, cinco
 *    das quais ninguém ia ler. Custa banda de quem está com o aluno na frente e
 *    custa consulta no Supabase.
 * 2. **A resposta que chega por último vence, não a mais nova.** Respostas de
 *    rede não voltam na ordem em que saíram: a busca de "fran" pode chegar DEPOIS
 *    da de "frango" e substituir a lista. Numa tela de catálogo isso é esquisito;
 *    nas de MONTAR TREINO e MONTAR DIETA é outra coisa — a lista é trocada no
 *    instante do clique, e o profissional adiciona o exercício ou o alimento que
 *    não escolheu. Erro silencioso, que só aparece quando o aluno pergunta por
 *    que tem creatina no plano dele.
 *
 * A correção é a mesma para os dois: espera o dedo parar (`atrasoMs`) e aplica
 * só a resposta da ÚLTIMA busca pedida, comparando um número de sequência.
 *
 * Não se usa `AbortSignal` porque o SDK fala com o PostgREST por um cliente que
 * não recebe sinal; descartar a resposta tardia resolve o que importa, que é a
 * tela nunca mostrar o resultado de uma pergunta antiga.
 */
export interface ListaBuscada<T> {
  itens: T[];
  /** true enquanto a busca mais recente não respondeu. */
  carregando: boolean;
  /** Preenchido quando a busca mais recente falhou. */
  falhou: boolean;
}

export function useListaBuscada<T>(
  buscar: () => Promise<T[]>,
  dependencias: readonly unknown[],
  atrasoMs = 250,
): ListaBuscada<T> {
  const [itens, setItens] = useState<T[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [falhou, setFalhou] = useState(false);
  /** Número da busca mais recente. Resposta de número menor é descartada. */
  const sequencia = useRef(0);
  /** O `buscar` muda de identidade a cada render; o efeito não deve reagir a isso. */
  const ultimoBuscar = useRef(buscar);
  ultimoBuscar.current = buscar;
  /*
    A primeira carga não espera.

    O atraso existe para o que é DIGITADO: evita uma consulta por tecla. Aplicá-lo
    também na abertura da tela só adiciona um quarto de segundo de lista vazia a
    quem ainda não digitou nada — e foi o que a suíte apontou, com um teste que
    conferia a primeira consulta logo depois de a tela montar.
  */
  const primeira = useRef(true);

  useEffect(() => {
    const minha = ++sequencia.current;
    setCarregando(true);

    const esperar = primeira.current ? 0 : atrasoMs;
    primeira.current = false;

    const relogio = setTimeout(() => {
      ultimoBuscar
        .current()
        .then((lista) => {
          // Chegou tarde: outra busca já foi pedida, e a resposta dela é que vale.
          if (minha !== sequencia.current) return;
          setItens(lista);
          setFalhou(false);
          setCarregando(false);
        })
        .catch(() => {
          if (minha !== sequencia.current) return;
          setFalhou(true);
          setCarregando(false);
        });
    }, esperar);

    return () => clearTimeout(relogio);
    /*
      As dependências vêm de quem chama, de propósito: é o termo de busca e os
      filtros dele. O `buscar` fica num `ref` justamente para não entrar aqui —
      ele muda de identidade a cada render e reiniciaria o efeito sem motivo.
    */
  }, dependencias);

  return { itens, carregando, falhou };
}
