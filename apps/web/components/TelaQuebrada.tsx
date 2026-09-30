'use client';

import { Aviso, Botao, Cartao } from './ui';

/**
 * O que a pessoa vê quando uma tela quebra — em vez de nada.
 *
 * Sem barreira, um erro de render derruba a árvore e o resultado é uma página
 * BRANCA: sem texto, sem botão, sem caminho de volta. E não é hipótese — três
 * suítes novas deste mês encontraram exatamente isso ao montar uma fixture sem um
 * campo que a tela lê. Em produção a causa é a mesma: campo novo que chega
 * `null`, resposta parcial, formato que mudou de um lado só.
 *
 * O que ela promete é o que pode cumprir: **o que já foi salvo está salvo** (quem
 * grava é a API, e a falha aqui é de desenho de tela), e o que estava sendo
 * digitado nesta página, não. Prometer mais seria mentir na hora em que a pessoa
 * tem menos motivo para confiar no sistema.
 *
 * O componente é separado do `error.tsx` porque o Next exige que aquele arquivo
 * exporte um formato específico — e regra de produto testável não deve depender do
 * roteador para ser provada.
 */
export function TelaQuebrada({
  aoTentarDeNovo,
  detalhe,
}: {
  aoTentarDeNovo: () => void;
  /** Identificador do erro, quando o Next fornece um. Ajuda no suporte. */
  detalhe?: string;
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-lg py-2xl">
      <Cartao>
        <h1 className="text-xl font-bold">Algo quebrou nesta tela</h1>
        <p className="mt-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          Não foi você. O que já estava salvo continua salvo — o que você estava preenchendo aqui
          agora, não.
        </p>

        <div className="mt-lg flex flex-wrap gap-md">
          <Botao onClick={aoTentarDeNovo}>Tentar de novo</Botao>
          {/*
            Ir para a lista de alunos é a saída que sempre funciona: é a tela mais
            simples do painel, e de lá se chega a qualquer outra. Um link comum, e
            não `router.push`, porque a navegação do Next pode ser justamente o que
            quebrou.
          */}
          <a href="/alunos" className="self-center text-sm underline">
            Ir para meus alunos
          </a>
        </div>

        {detalhe && (
          <p className="mt-lg text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
            Código do erro: {detalhe}
          </p>
        )}
      </Cartao>

      <Aviso tipo="info">
        Se acontecer de novo na mesma tela, vale avisar o suporte com o que você estava fazendo —
        isso é o que permite encontrar a causa.
      </Aviso>
    </div>
  );
}
