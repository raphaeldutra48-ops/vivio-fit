'use client';

import type { Papel } from '@vivio/contracts';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { menuPara, type SecaoRecolhivel } from '../lib/menu';

/** Marca discreta para o que ainda não foi construído — evita link que parece quebrado. */
function Selo() {
  return (
    <span
      className="rounded-pill px-xs text-xs"
      style={{ background: 'var(--vv-superficie-elevada)', color: 'var(--vv-texto-secundario)' }}
      title="Ainda não construído"
    >
      em breve
    </span>
  );
}

export function MenuLateral({ papel, aoNavegar }: { papel: Papel; aoNavegar?: () => void }) {
  const caminho = usePathname();
  const blocos = menuPara(papel);

  // Abre sozinha a seção que contém a página atual — o usuário nunca chega
  // numa tela sem enxergar onde ela fica na navegação.
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const daVez = blocos
      .flatMap((b) => b.secoes)
      .find((s) => s.itens.some((i) => caminho.startsWith(i.href)));
    if (daVez) setAbertas((a) => ({ ...a, [daVez.rotulo]: true }));
  }, [caminho]);

  function Secao({ secao }: { secao: SecaoRecolhivel }) {
    const temSubitens = secao.itens.length > 0;
    const aberta = abertas[secao.rotulo] ?? false;
    const ativa = secao.href ? caminho === secao.href : secao.itens.some((i) => caminho === i.href);

    const conteudo = (
      <>
        <span aria-hidden style={{ width: 22 }}>
          {secao.icone}
        </span>
        <span className="flex-1 text-left">{secao.rotulo}</span>
        {!temSubitens && secao.estado === 'em-construcao' && <Selo />}
        {temSubitens && (
          <span aria-hidden style={{ color: 'var(--vv-texto-secundario)' }}>
            {aberta ? '▴' : '▾'}
          </span>
        )}
      </>
    );

    const estilo: React.CSSProperties = {
      background: ativa ? 'var(--vv-superficie-elevada)' : 'transparent',
      color: ativa ? 'var(--vv-texto-primario)' : 'var(--vv-texto-secundario)',
      borderLeft: `3px solid ${ativa ? 'var(--vv-acao-fundo)' : 'transparent'}`,
    };

    return (
      <li>
        {temSubitens ? (
          <button
            type="button"
            aria-expanded={aberta}
            onClick={() => setAbertas((a) => ({ ...a, [secao.rotulo]: !aberta }))}
            className="flex min-h-toque w-full items-center gap-md rounded-sm px-md"
            style={estilo}
          >
            {conteudo}
          </button>
        ) : (
          <Link
            href={secao.href ?? '#'}
            onClick={aoNavegar}
            aria-current={ativa ? 'page' : undefined}
            className="flex min-h-toque items-center gap-md rounded-sm px-md"
            style={estilo}
          >
            {conteudo}
          </Link>
        )}

        {temSubitens && aberta && (
          <ul className="mt-xs flex flex-col">
            {secao.itens.map((item) => {
              const itemAtivo = caminho === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={aoNavegar}
                    aria-current={itemAtivo ? 'page' : undefined}
                    className="flex min-h-toque items-center gap-sm rounded-sm pl-2xl pr-md text-sm"
                    style={{
                      color: itemAtivo ? 'var(--vv-texto-primario)' : 'var(--vv-texto-secundario)',
                      background: itemAtivo ? 'var(--vv-superficie-elevada)' : 'transparent',
                      fontWeight: itemAtivo ? 600 : 400,
                    }}
                  >
                    <span className="flex-1">{item.rotulo}</span>
                    {item.estado === 'em-construcao' && <Selo />}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </li>
    );
  }

  return (
    <nav aria-label="Menu principal" className="flex flex-col gap-lg py-lg">
      {blocos.map((bloco, i) => (
        <div key={bloco.titulo ?? `bloco-${i}`} className="flex flex-col gap-xs">
          {bloco.titulo && (
            <h2
              className="px-md pb-xs text-xs font-semibold tracking-wide"
              style={{ color: 'var(--vv-texto-secundario)' }}
            >
              {bloco.titulo}
            </h2>
          )}
          <ul className="flex flex-col gap-xs">
            {bloco.secoes.map((secao) => (
              <Secao key={secao.rotulo} secao={secao} />
            ))}
          </ul>
        </div>
      ))}

      <p className="px-md pt-lg text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
        Vívio Fit · versão 0.1.0
      </p>
    </nav>
  );
}
