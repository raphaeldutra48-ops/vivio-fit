'use client';

import { usePathname } from 'next/navigation';
import { descricaoDaRota } from '../lib/menu';
import { Cartao } from './ui';

/**
 * Tela das rotas que ainda não foram construídas.
 *
 * Dizer o que a tela VAI fazer é melhor que um "404" ou uma página em branco:
 * o menu já reflete o produto inteiro, e cada item explica seu próprio papel.
 */
export function EmConstrucao({ children }: { children?: React.ReactNode }) {
  const caminho = usePathname();
  const info = descricaoDaRota(caminho);

  return (
    <div className="flex flex-col gap-xl">
      <div>
        <h1 className="text-2xl font-bold">{info?.rotulo ?? 'Em construção'}</h1>
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          Ainda não construído
        </p>
      </div>

      <Cartao>
        <div className="flex flex-col gap-md">
          {info?.descricao ? (
            <p>{info.descricao}</p>
          ) : (
            <p>Esta área faz parte do produto, mas ainda não foi implementada.</p>
          )}
          {children}
          <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            O item já está no menu para a navegação refletir o produto completo — assim nada
            fica esquecido no caminho.
          </p>
        </div>
      </Cartao>
    </div>
  );
}
