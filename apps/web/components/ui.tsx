'use client';

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

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
