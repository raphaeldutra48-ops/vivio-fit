'use client';

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

/**
 * Componentes base. Usam apenas tokens semânticos (var(--vv-*)) — nunca cor
 * crua, senão o tema escuro para de funcionar.
 */

export function Cartao({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-lg border p-lg ${className}`}
      style={{ background: 'var(--vv-superficie)', borderColor: 'var(--vv-borda)' }}
    >
      {children}
    </div>
  );
}

type VarianteBotao = 'acao' | 'primaria' | 'neutra' | 'perigo';

const estiloPorVariante: Record<VarianteBotao, React.CSSProperties> = {
  // Texto ESCURO sobre o laranja: branco daria 2,59:1, abaixo do mínimo AA.
  acao: { background: 'var(--vv-acao-fundo)', color: 'var(--vv-acao-texto)' },
  primaria: { background: 'var(--vv-primaria-fundo)', color: 'var(--vv-primaria-texto)' },
  neutra: {
    background: 'transparent',
    color: 'var(--vv-texto-primario)',
    border: '1px solid var(--vv-borda)',
  },
  perigo: { background: 'transparent', color: 'var(--vv-erro)', border: '1px solid var(--vv-erro)' },
};

export function Botao({
  variante = 'acao',
  children,
  className = '',
  ...resto
}: { variante?: VarianteBotao } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...resto}
      className={`min-h-toque rounded-md px-xl font-semibold transition disabled:opacity-50 ${className}`}
      style={estiloPorVariante[variante]}
    >
      {children}
    </button>
  );
}

export function Campo({
  rotulo,
  erro,
  ...resto
}: { rotulo: string; erro?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-xs">
      <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
        {rotulo}
      </span>
      <input
        {...resto}
        className="min-h-toque rounded-md border px-md"
        style={{
          background: 'var(--vv-superficie)',
          borderColor: erro ? 'var(--vv-erro)' : 'var(--vv-borda)',
          color: 'var(--vv-texto-primario)',
        }}
      />
      {erro && (
        <span className="text-sm" style={{ color: 'var(--vv-erro)' }} role="alert">
          {erro}
        </span>
      )}
    </label>
  );
}

export function Aviso({ tipo, children }: { tipo: 'erro' | 'info'; children: ReactNode }) {
  const cor = tipo === 'erro' ? 'var(--vv-erro)' : 'var(--vv-texto-secundario)';
  return (
    <p className="text-sm" style={{ color: cor }} role={tipo === 'erro' ? 'alert' : undefined}>
      {children}
    </p>
  );
}

export function Etiqueta({ texto, cor }: { texto: string; cor: string }) {
  return (
    <span
      className="rounded-pill px-md py-xs text-xs font-semibold"
      style={{ background: 'var(--vv-superficie-elevada)', color: cor, border: `1px solid ${cor}` }}
    >
      {texto}
    </span>
  );
}

/**
 * Tela sem dado: ícone, o que é, e o que fazer a seguir.
 *
 * Uma lista que não renderiza nada é ambígua de três formas ao mesmo tempo —
 * quebrou, está carregando, ou está vazia mesmo — e as três levam a reações
 * diferentes. Quem não sabe qual é fecha o app.
 *
 * A `acao` é opcional porque nem todo vazio tem saída pelas mãos do
 * profissional: "o aluno ainda não autorizou" não tem botão, tem recado.
 */
export function EstadoVazio({
  icone,
  titulo,
  descricao,
  acao,
}: {
  icone: string;
  titulo: string;
  descricao: string;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-md px-lg py-2xl text-center">
      <span
        aria-hidden
        className="grid place-items-center rounded-pill text-2xl"
        style={{ width: 56, height: 56, background: 'var(--vv-superficie-elevada)' }}
      >
        {icone}
      </span>
      <div className="flex flex-col gap-xs">
        <p className="font-semibold">{titulo}</p>
        <p
          className="mx-auto max-w-[42ch] text-sm"
          style={{ color: 'var(--vv-texto-secundario)' }}
        >
          {descricao}
        </p>
      </div>
      {acao}
    </div>
  );
}

/**
 * O ⓘ ao lado de um número que não se explica sozinho.
 *
 * "1RM estimado", "aderência", "gasto basal" são termos que o app usa e que o
 * usuário não é obrigado a conhecer. Sem isto, ou o número fica sem explicação,
 * ou a explicação vira um parágrafo permanente que polui a tela.
 *
 * Abre por clique e não por `hover`: passar o mouse não existe no celular, e é
 * no celular que o personal abre a ficha entre uma série e outra.
 */
export const MARGEM_DA_JANELA = 8;

/**
 * Quantos pixels deslocar o balão para ele caber na janela.
 *
 * Separada do componente porque é onde o erro mora e porque medir layout em
 * teste de unidade não funciona — `getBoundingClientRect` devolve zeros no
 * jsdom. A conta, isolada, é verificável.
 *
 * A ordem das duas correções importa: primeiro puxa para dentro pela direita,
 * depois **a esquerda tem a palavra final**. Se a segunda não sobrescrevesse a
 * primeira, um balão maior que o espaço disponível sairia cortado no começo, e
 * texto cortado no começo é ilegível — cortado no fim ainda se adivinha.
 */
export function deslocamentoParaCaber(
  esquerda: number,
  direita: number,
  larguraDaJanela: number,
  margem = MARGEM_DA_JANELA,
): number {
  let ajuste = 0;
  const sobraDireita = larguraDaJanela - margem - direita;
  if (sobraDireita < 0) ajuste = sobraDireita;
  if (esquerda + ajuste < margem) ajuste = margem - esquerda;
  return ajuste;
}

export function Explicacao({ termo, children }: { termo: string; children: ReactNode }) {
  const [aberta, setAberta] = useState(false);
  /*
    Deslocamento em pixels, medido depois de abrir.

    A primeira versão virava o balão para a direita quando ele estourava a
    janela — e no celular isso o fazia estourar do **outro** lado: ancorado a um
    botão de 18 px a 116 px da borda, um balão de 260 px alinhado à direita
    começa em -126. Três dos quatro ⓘ da tela de resumo saíam com o texto
    cortado, e só num aparelho estreito, que é onde ninguém testa.

    Ancorar a um lado é sempre errado em alguma largura. O que funciona é
    empurrar para dentro: mede, calcula o quanto falta, e desloca. A borda
    esquerda tem a palavra final — texto cortado no começo é ilegível, cortado
    no fim ainda se adivinha.
  */
  const [desloc, setDesloc] = useState(0);
  const balao = useRef<HTMLSpanElement>(null);
  const raiz = useRef<HTMLSpanElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!aberta) {
      setDesloc(0);
      return;
    }
    const caixa = balao.current?.getBoundingClientRect();
    if (!caixa) return;
    setDesloc(deslocamentoParaCaber(caixa.left, caixa.right, window.innerWidth));
  }, [aberta]);

  useEffect(() => {
    if (!aberta) return;
    // Esc e clique fora: um balão que só fecha no próprio botão vira obstáculo
    // quando o usuário já seguiu em frente e esqueceu dele aberto.
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberta(false);
    };
    const aoClicar = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberta(false);
    };
    document.addEventListener('keydown', aoTeclar);
    document.addEventListener('mousedown', aoClicar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.removeEventListener('mousedown', aoClicar);
    };
  }, [aberta]);

  return (
    <span ref={raiz} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={`O que significa ${termo}`}
        aria-expanded={aberta}
        aria-controls={aberta ? id : undefined}
        onClick={() => setAberta((v) => !v)}
        className="grid place-items-center rounded-pill text-xs"
        /*
          24 px é o piso do WCAG 2.2 (2.5.8 Target Size Minimum). A primeira
          versão saiu com 18 e reprovava — pequeno demais para o polegar de quem
          usa o app em pé, entre séries, que é a situação real.
          `alvoToqueMin` (44) continua valendo para botão de ação; para um ⓘ
          embutido numa linha de texto, 44 empurraria a própria linha.
        */
        style={{
          width: 24,
          height: 24,
          border: '1px solid var(--vv-borda)',
          color: 'var(--vv-texto-secundario)',
        }}
      >
        i
      </button>
      {aberta && (
        <span
          ref={balao}
          id={id}
          role="tooltip"
          className="absolute left-0 top-[calc(100%+6px)] z-30 rounded-md border p-md text-sm font-normal"
          style={{
            transform: `translateX(${desloc}px)`,
            width: 'max-content',
            // Numa tela mais estreita que o balão, deslocar não bastaria: ele
            // encostaria nas duas bordas ao mesmo tempo. Encolher resolve.
            maxWidth: `min(260px, calc(100vw - ${MARGEM_DA_JANELA * 2}px))`,
            textAlign: 'left',
            background: 'var(--vv-superficie)',
            borderColor: 'var(--vv-borda)',
            color: 'var(--vv-texto-primario)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.16)',
          }}
        >
          {children}
        </span>
      )}
    </span>
  );
}
