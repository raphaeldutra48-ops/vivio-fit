'use client';

import type { VinculoResumo } from '@vivio/contracts';
import { useCallback, useEffect, useState } from 'react';
import { sdk } from './sdk';

/**
 * A lista de alunos ativos — em um lugar, porque ela mentia em cinco.
 *
 * Cinco telas (agenda, adipometria, bioimpedância, lista de compras e materiais)
 * repetiam o mesmo bloco de sete linhas: busca os alunos, escolhe o primeiro e
 * `.catch(() => undefined)`. Com o erro engolido, a lista ficava vazia e o
 * seletor escrevia **"Nenhum aluno ativo"** — a frase de quem ainda não tem
 * aluno, dita a quem tem trinta e está sem rede. O profissional conclui que
 * perdeu a carteira, ou que o sistema apagou os vínculos.
 *
 * O `falhou` existe para a tela poder dizer "não sei" em vez de "não tem". É a
 * mesma distinção que o aplicativo aprendeu em todas as telas dele: vazio e
 * falha se leem igual e significam o oposto.
 */
export interface AlunosAtivos {
  alunos: VinculoResumo[];
  /** true quando a busca falhou — diferente de não haver aluno ativo. */
  falhou: boolean;
  /** Para um botão de "tentar de novo", quando a tela oferecer um. */
  recarregar: () => void;
}

export function useAlunosAtivos(): AlunosAtivos {
  const [alunos, setAlunos] = useState<VinculoResumo[]>([]);
  const [falhou, setFalhou] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    setFalhou(false);
    sdk.vinculos
      .meusAlunos('ATIVO')
      .then((lista) => {
        if (!ativo) return;
        setAlunos(lista);
        setFalhou(false);
      })
      .catch(() => {
        /*
          A lista NÃO é esvaziada aqui. Se já havia alunos carregados, trocar
          dado certo por nenhum porque a rede oscilou seria perder informação
          boa — o aviso de falha vai por cima.
        */
        if (ativo) setFalhou(true);
      });
    return () => {
      ativo = false;
    };
  }, [tentativa]);

  const recarregar = useCallback(() => setTentativa((t) => t + 1), []);

  return { alunos, falhou, recarregar };
}

/**
 * O que escrever no seletor quando não há aluno para listar.
 *
 * `null` quando há alunos — a tela não mostra aviso nenhum.
 */
export function avisoDoSeletorDeAlunos(quantos: number, falhou: boolean): string | null {
  if (quantos > 0) return null;
  return falhou ? 'Não foi possível carregar seus alunos' : 'Nenhum aluno ativo';
}
