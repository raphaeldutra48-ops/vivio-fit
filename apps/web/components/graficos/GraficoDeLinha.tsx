'use client';

import {
  calcularGeometria,
  indicesComRotulo,
  variacaoPercentual,
  type PontoDoGrafico,
} from '@vivio/ui';
import { useId, useState } from 'react';

/**
 * Gráfico de linha para o painel do profissional.
 *
 * Mesma matemática do gráfico do app do aluno (`@vivio/ui/grafico`), marcação
 * própria porque um desenha com `react-native-svg` e o outro com `<svg>`.
 *
 * Sem biblioteca de gráficos, e não por economia de dependência: as prontas
 * trazem tema próprio que briga com os tokens, aumentam o pacote em centenas de
 * quilobytes e resolvem casos que este produto não tem. O que este gráfico
 * precisa fazer — escala pelo intervalo real, série constante sem quebrar, e
 * ser lido por leitor de tela — cabe em cem linhas.
 *
 * `viewBox` com largura fixa e `width="100%"`: o SVG escala sozinho com o
 * contêiner, sem medir o elemento nem re-renderizar a cada mudança de tamanho.
 */

interface Props {
  pontos: PontoDoGrafico[];
  unidade: string;
  /** Cor da linha. Use um token: `var(--vv-area-treino)`, por exemplo. */
  cor: string;
  altura?: number;
  /** O que o gráfico diz, em palavras. É o que o leitor de tela anuncia. */
  descricao: string;
}

const LARGURA = 600;
const MARGEM = { topo: 14, base: 26, esquerda: 8, direita: 8 };

function dataCurta(iso: string): string {
  // Meio-dia evita que o fuso empurre a data para o dia anterior.
  return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  });
}

export function GraficoDeLinha({ pontos, unidade, cor, altura = 180, descricao }: Props) {
  const [emFoco, setEmFoco] = useState<number | null>(null);
  const idDoGradiente = useId();

  const geometria = calcularGeometria(pontos, LARGURA, altura, MARGEM);

  /*
    Dois pontos são o mínimo para uma linha significar alguma coisa. Com um só,
    o texto informa em vez de desenhar um ponto solto que parece defeito.
  */
  if (!geometria || pontos.length < 2) {
    return (
      <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
        {pontos.length === 0
          ? 'Ainda sem medições para desenhar a evolução.'
          : 'Só uma medição registrada — a segunda já mostra a evolução.'}
      </p>
    );
  }

  const comRotulo = new Set(indicesComRotulo(pontos.length, 5));
  const variacao = variacaoPercentual(pontos);
  const foco = emFoco !== null ? geometria.coords[emFoco] : null;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${LARGURA} ${altura}`}
        width="100%"
        height={altura}
        role="img"
        aria-label={descricao}
        preserveAspectRatio="none"
        onMouseLeave={() => setEmFoco(null)}
      >
        <defs>
          <linearGradient id={idDoGradiente} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={cor} stopOpacity={0.22} />
            <stop offset="1" stopColor={cor} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Topo e base da faixa: dão referência sem virar grade carregada. */}
        {[MARGEM.topo, altura - MARGEM.base].map((y) => (
          <line
            key={y}
            x1={0}
            y1={y}
            x2={LARGURA}
            y2={y}
            stroke="var(--vv-borda)"
            strokeWidth={1}
            strokeDasharray="3 5"
          />
        ))}

        <path d={geometria.area} fill={`url(#${idDoGradiente})`} />
        <path
          d={geometria.linha}
          stroke={cor}
          strokeWidth={2.5}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
          /* O traço não escala junto com o viewBox, senão fica grosso e disforme. */
          vectorEffect="non-scaling-stroke"
        />

        {geometria.coords.map((c, i) => (
          <circle
            key={c.ponto.data}
            cx={c.x}
            cy={c.y}
            r={emFoco === i ? 6 : 3.5}
            fill={emFoco === i ? cor : 'var(--vv-superficie)'}
            stroke={cor}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/*
          Faixas invisíveis de largura inteira captam o ponteiro: mirar num
          círculo de 3px com o mouse é exigir pontaria que ninguém tem.
        */}
        {geometria.coords.map((c, i) => (
          <rect
            key={`alvo-${c.ponto.data}`}
            x={c.x - LARGURA / pontos.length / 2}
            y={0}
            width={LARGURA / pontos.length}
            height={altura}
            fill="transparent"
            onMouseEnter={() => setEmFoco(i)}
          />
        ))}
      </svg>

      <div
        className="flex items-baseline justify-between text-xs"
        style={{ color: 'var(--vv-texto-secundario)' }}
      >
        <span>{dataCurta(pontos[0]!.data)}</span>
        {foco ? (
          <span style={{ color: cor, fontWeight: 700 }}>
            {foco.ponto.valor.toLocaleString('pt-BR')} {unidade} ·{' '}
            {new Date(`${foco.ponto.data}T12:00:00`).toLocaleDateString('pt-BR')}
          </span>
        ) : (
          variacao !== null && (
            <span
              style={{
                color: variacao === 0 ? 'var(--vv-texto-secundario)' : 'var(--vv-texto-primario)',
                fontWeight: 600,
              }}
            >
              {variacao > 0 ? '+' : ''}
              {variacao.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% no período
            </span>
          )
        )}
        <span>{dataCurta(pontos[pontos.length - 1]!.data)}</span>
      </div>

      {/*
        A mesma informação em texto, para quem usa leitor de tela e para quem
        precisa do número exato. `sr-only` não existe aqui; a tabela fica
        visualmente escondida mas presente na árvore de acessibilidade.
      */}
      <figcaption className="sr-only">
        {descricao}. Valores:{' '}
        {pontos
          .filter((_, i) => comRotulo.has(i))
          .map((p) => `${dataCurta(p.data)}, ${p.valor} ${unidade}`)
          .join('; ')}
        .
      </figcaption>
    </figure>
  );
}
