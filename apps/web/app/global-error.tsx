'use client';

import { useEffect } from 'react';
import { TelaQuebrada } from '../components/TelaQuebrada';
import './globals.css';

/**
 * A barreira do último andar: erro no próprio layout raiz.
 *
 * `error.tsx` cobre tudo DENTRO do layout raiz — e por isso não alcança uma
 * falha nele (na leitura da sessão, num provedor de tema). Nesse caso o Next
 * troca a página inteira por esta, e sem ela mostrava a padrão dele, em inglês.
 *
 * Por substituir o layout, este arquivo traz o próprio `<html lang="pt-BR">` e o
 * próprio CSS global: nada do layout que quebrou está de pé aqui.
 */
export default function ErroGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Mesma regra do `error.tsx`: console, e só — daqui pode sair dado de saúde.
    console.error('[vivio] o layout raiz quebrou:', error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body>
        <main className="min-h-screen px-lg py-xl" style={{ background: 'var(--vv-fundo)' }}>
          <div className="mx-auto" style={{ maxWidth: '40rem' }}>
            <TelaQuebrada aoTentarDeNovo={reset} detalhe={error.digest} />
          </div>
        </main>
      </body>
    </html>
  );
}
