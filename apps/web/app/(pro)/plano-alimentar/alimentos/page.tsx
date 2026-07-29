'use client';

import type { AlimentoResumo } from '@vivio/contracts';
import { useEffect, useState } from 'react';
import { Aviso, Campo, Cartao } from '../../../../components/ui';
import { sdk } from '../../../../lib/sdk';

export default function Alimentos() {
  const [alimentos, setAlimentos] = useState<AlimentoResumo[]>([]);
  const [grupos, setGrupos] = useState<string[]>([]);
  const [busca, setBusca] = useState('');
  const [grupo, setGrupo] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    sdk.alimentos.grupos().then(setGrupos).catch(() => undefined);
  }, []);

  useEffect(() => {
    sdk.alimentos
      .listar({ q: busca || undefined, grupo: grupo || undefined, limit: 100 })
      .then(setAlimentos)
      .catch(() => setErro('Não foi possível carregar a tabela de alimentos.'));
  }, [busca, grupo]);

  return (
    <div className="flex flex-col gap-xl">
      <div>
        <h1 className="text-2xl font-bold">Alimentos</h1>
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          Composição nutricional por 100 g. É desta tabela que sai o cálculo dos cardápios.
        </p>
      </div>

      <div className="grid gap-md sm:grid-cols-[1fr_220px]">
        <Campo
          rotulo="Buscar alimento"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="frango, arroz, aveia…"
        />
        <label className="flex flex-col gap-xs">
          <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            Grupo
          </span>
          <select
            className="min-h-toque rounded-md border px-md"
            style={{
              background: 'var(--vv-superficie)',
              borderColor: 'var(--vv-borda)',
              color: 'var(--vv-texto-primario)',
            }}
            value={grupo}
            onChange={(e) => setGrupo(e.target.value)}
          >
            <option value="">Todos</option>
            {grupos.map((g) => (
              <option key={g} value={g}>
                {g.charAt(0) + g.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <Cartao className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 640 }}>
          <thead>
            <tr style={{ color: 'var(--vv-texto-secundario)' }}>
              <th className="pb-sm text-left font-semibold">Alimento</th>
              <th className="pb-sm text-right font-semibold">kcal</th>
              <th className="pb-sm text-right font-semibold">Prot</th>
              <th className="pb-sm text-right font-semibold">Carb</th>
              <th className="pb-sm text-right font-semibold">Gord</th>
              <th className="pb-sm text-right font-semibold">Fibra</th>
            </tr>
          </thead>
          <tbody>
            {alimentos.map((a) => (
              <tr key={a.id} style={{ borderTop: '1px solid var(--vv-borda)' }}>
                <td className="py-sm">
                  <span className="font-medium">{a.nome}</span>
                  {a.medidaCaseira && (
                    <span className="block text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                      {a.medidaCaseira}
                      {a.medidaGramas ? ` · ${a.medidaGramas} g` : ''}
                    </span>
                  )}
                </td>
                <td className="py-sm text-right tabular-nums">{a.porcao100g.kcal}</td>
                <td className="py-sm text-right tabular-nums">{a.porcao100g.proteinaG}</td>
                <td className="py-sm text-right tabular-nums">{a.porcao100g.carboidratoG}</td>
                <td className="py-sm text-right tabular-nums">{a.porcao100g.gorduraG}</td>
                <td className="py-sm text-right tabular-nums">{a.porcao100g.fibraG}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {alimentos.length === 0 && (
          <p className="pt-md" style={{ color: 'var(--vv-texto-secundario)' }}>
            Nenhum alimento encontrado.
          </p>
        )}
      </Cartao>

      <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
        Valores por 100 g · fonte TACO
      </p>
    </div>
  );
}
