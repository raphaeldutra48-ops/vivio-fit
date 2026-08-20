'use client';

import { proporcoesDeBarra } from '@vivio/ui';

/**
 * Barras horizontais para comparação.
 *
 * Serve a dois usos que parecem diferentes e são o mesmo problema: frequência
 * de treino por semana e adesão de macros. Nos dois casos a pergunta é "esta
 * barra é maior ou menor que aquela", e a resposta tem de estar no comprimento.
 *
 * Horizontal e não vertical de propósito: o rótulo cabe ao lado, legível, sem
 * girar texto nem abreviar. "Proteína" na vertical vira "Prot." ou uma palavra
 * de cabeça para baixo.
 */

export interface BarraDoGrafico {
  rotulo: string;
  valor: number;
  /** Texto à direita — "128 g de 150 g", "4 treinos". Sem isto, a barra é só forma. */
  detalhe?: string;
  /**
   * Referência a atingir, na mesma unidade do valor.
   *
   * Quando existe, a barra ganha um traço vertical na posição da meta. É o que
   * transforma "comeu 128 g" em "comeu 128 dos 150 combinados" — e a segunda
   * é a informação que muda conduta.
   */
  meta?: number;
  cor?: string;
}

interface Props {
  barras: BarraDoGrafico[];
  descricao: string;
  vazio?: string;
}

const ALTURA_DA_BARRA = 10;

export function GraficoDeBarras({ barras, descricao, vazio }: Props) {
  if (barras.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
        {vazio ?? 'Ainda sem dados para comparar.'}
      </p>
    );
  }

  /*
    A escala inclui as metas, não só os valores. Sem isso, uma meta maior que
    todos os valores cairia fora da barra e o traço sumiria — justamente no
    caso em que ele mais informa: ninguém atingiu.
  */
  const escala = proporcoesDeBarra([
    ...barras.map((b) => b.valor),
    ...barras.map((b) => b.meta ?? 0),
  ]);
  const proporcoes = escala.slice(0, barras.length);
  const proporcoesDeMeta = escala.slice(barras.length);

  return (
    <figure className="m-0 flex flex-col gap-md" role="img" aria-label={descricao}>
      {barras.map((barra, i) => {
        const cor = barra.cor ?? 'var(--vv-acao-fundo)';
        const larguraMeta = proporcoesDeMeta[i] ?? 0;

        return (
          <div key={barra.rotulo} className="flex flex-col gap-xs">
            <div className="flex items-baseline justify-between text-sm">
              <span>{barra.rotulo}</span>
              {barra.detalhe && (
                <span style={{ color: 'var(--vv-texto-secundario)' }}>{barra.detalhe}</span>
              )}
            </div>

            <div
              className="relative w-full overflow-hidden rounded-pill"
              style={{ height: ALTURA_DA_BARRA, background: 'var(--vv-superficie-elevada)' }}
            >
              <div
                className="h-full rounded-pill"
                style={{ width: `${(proporcoes[i] ?? 0) * 100}%`, background: cor }}
              />
              {barra.meta !== undefined && larguraMeta > 0 && (
                <div
                  aria-hidden
                  className="absolute top-0 h-full"
                  style={{
                    left: `${larguraMeta * 100}%`,
                    width: 2,
                    background: 'var(--vv-texto-primario)',
                    // Meia largura para o traço ficar SOBRE a marca, não depois dela.
                    transform: 'translateX(-1px)',
                  }}
                />
              )}
            </div>
          </div>
        );
      })}

      <figcaption className="sr-only">
        {descricao}.{' '}
        {barras
          .map(
            (b) =>
              `${b.rotulo}: ${b.valor.toLocaleString('pt-BR')}` +
              (b.meta !== undefined ? ` de ${b.meta.toLocaleString('pt-BR')}` : ''),
          )
          .join('; ')}
        .
      </figcaption>
    </figure>
  );
}
