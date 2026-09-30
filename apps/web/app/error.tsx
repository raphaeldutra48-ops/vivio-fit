'use client';

import { useEffect } from 'react';
import { TelaQuebrada } from '../components/TelaQuebrada';

/**
 * A barreira de erro do painel, no formato que o Next exige.
 *
 * Fica na raiz de `app/` de propósito: cobre o painel inteiro e as telas
 * públicas, e o `reset` do Next remonta só o trecho quebrado, mantendo o menu e a
 * sessão de pé. A tela em si mora em `components/TelaQuebrada` — regra de produto
 * não deve depender do roteador para ser provada.
 */
export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    /*
      Console, e só. Mandar para um serviço de erro exigiria decidir o que sai
      daqui — e daqui sai dado de saúde: nome de aluno, marcador de exame, relato
      de dor. Essa decisão é do dono do produto, não deste arquivo.
    */
    console.error('[vivio] tela quebrou:', error);
  }, [error]);

  return <TelaQuebrada aoTentarDeNovo={reset} detalhe={error.digest} />;
}
