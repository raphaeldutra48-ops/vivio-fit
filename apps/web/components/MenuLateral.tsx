'use client';

import type { Papel } from '@vivio/contracts';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { menuPara, type SecaoRecolhivel } from '../lib/menu';
import { EscolhaDeTema } from './EscolhaDeTema';

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

/**
 * Uma seção do menu.
 *
 * **No escopo do módulo, e não dentro de `MenuLateral`.** Definida lá dentro,
 * ela virava uma função nova a cada renderização, e o React trata função nova
 * como componente diferente: em vez de atualizar, ele desmontava e remontava o
 * menu inteiro — a cada navegação e a cada seção aberta ou fechada.
 *
 * Custa uma lista de props mais longa. Custa menos que um menu de vinte itens
 * refeito do zero sem motivo.
 */
function Secao({
  secao,
  caminho,
  abertas,
  setAbertas,
  aoNavegar,
}: {
  secao: SecaoRecolhivel;
  caminho: string;
  abertas: Record<string, boolean>;
  setAbertas: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  aoNavegar?: () => void;
}) {
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

  /*
    Fundo cheio no item ativo, e não `superficieElevada`.

    No tema claro `superficie` e `superficieElevada` são a mesma cor — branco
    puro — e o menu inteiro fica sobre `superficie`. O realce de fundo
    simplesmente não existia ali: sobravam 3 px de borda à esquerda para
    marcar onde a pessoa está, num menu de vinte itens. O par
    `primariaFundo`/`primariaTexto` já é medido em `paresDeContraste`.

    A borda continua porque cor sozinha não deve carregar informação
    (WCAG 1.4.1) — e porque `aria-current` só chega a quem usa leitor de tela.
  */
  const estilo: React.CSSProperties = {
    background: ativa ? 'var(--vv-primaria-fundo)' : 'transparent',
    color: ativa ? 'var(--vv-primaria-texto)' : 'var(--vv-texto-secundario)',
    borderLeft: `3px solid ${ativa ? 'var(--vv-acao-fundo)' : 'transparent'}`,
    fontWeight: ativa ? 600 : 400,
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
                  /* Subitem ativo usa a primária como TEXTO, não como fundo:
                     dois blocos cheios empilhados — a seção e o subitem —
                     competiriam entre si e nenhum leria como "você está aqui".
                     O par também é medido. */
                  style={{
                    color: itemAtivo ? 'var(--vv-primaria-fundo)' : 'var(--vv-texto-secundario)',
                    borderLeft: `3px solid ${itemAtivo ? 'var(--vv-acao-fundo)' : 'transparent'}`,
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
              <Secao
                key={secao.rotulo}
                secao={secao}
                caminho={caminho}
                abertas={abertas}
                setAbertas={setAbertas}
                aoNavegar={aoNavegar}
              />
            ))}
          </ul>
        </div>
      ))}

      {/*
        No rodapé do menu e não numa tela de configurações: quem procura o tema
        procura onde já está navegando, e uma preferência visual escondida atrás
        de dois cliques não é encontrada.
      */}
      <div className="px-md pt-lg">
        <EscolhaDeTema />
      </div>

      <p className="px-md pt-md text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
        Vívio Fit · versão 0.1.0
      </p>
    </nav>
  );
}
