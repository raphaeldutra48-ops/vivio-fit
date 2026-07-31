'use client';

import type { AlimentoResumo } from '@vivio/contracts';
import { useEffect, useState } from 'react';
import { sdk } from '../lib/sdk';
import { Botao } from './ui';

/**
 * Busca com resultado imediato, sem botão de pesquisar.
 *
 * O debounce existe porque o nutricionista digita nome inteiro ("peito de
 * frango"): sem ele, seriam 16 requisições para uma busca só.
 */
export function BuscaDeAlimento({
  aoEscolher,
  jaEscolhidos = [],
  rotulo = 'Buscar alimento',
}: {
  aoEscolher: (alimento: AlimentoResumo) => void;
  jaEscolhidos?: string[];
  rotulo?: string;
}) {
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<AlimentoResumo[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    const alvo = busca.trim();
    if (alvo.length < 2) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const id = setTimeout(() => {
      sdk.alimentos
        .listar({ q: alvo, limit: 12 })
        .then((lista) => setResultados(lista.filter((a) => !jaEscolhidos.includes(a.id))))
        .catch(() => setResultados([]))
        .finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, jaEscolhidos.join(',')]);

  return (
    <div className="flex flex-col gap-sm">
      <label className="flex flex-col gap-xs">
        <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          {rotulo}
        </span>
        <input
          className="min-h-toque rounded-md border px-md"
          style={{
            background: 'var(--vv-superficie)',
            borderColor: 'var(--vv-borda)',
            color: 'var(--vv-texto-primario)',
          }}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="arroz, frango, aveia…"
        />
      </label>

      {busca.trim().length >= 2 && (
        <div className="flex flex-wrap gap-sm">
          {resultados.map((a) => (
            <Botao
              key={a.id}
              variante="neutra"
              onClick={() => {
                aoEscolher(a);
                setBusca('');
              }}
            >
              {a.nome}
              <span className="ml-sm text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                {a.porcao100g.kcal} kcal/100g
              </span>
            </Botao>
          ))}
          {resultados.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              {buscando ? 'Buscando…' : 'Nenhum alimento encontrado.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
