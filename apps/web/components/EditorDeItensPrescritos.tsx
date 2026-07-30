'use client';

import {
  ROTULO_TIPO_PRESCRITIVEL,
  UNIDADES_DOSE,
  VIAS,
  type PosologiaInput,
  type PrescritivelResumo,
} from '@vivio/contracts';
import { useEffect, useMemo, useState } from 'react';
import { sdk } from '../lib/sdk';
import { Botao, Cartao } from './ui';

/** Frequências que cobrem quase toda prescrição — o resto é texto livre. */
const FREQUENCIAS = [
  '1x ao dia',
  '2x ao dia',
  '3x ao dia',
  'a cada 8h',
  'a cada 12h',
  'em jejum',
  'antes do treino',
  'após o treino',
  'antes de dormir',
];

const entrada = {
  background: 'var(--vv-superficie)',
  borderColor: 'var(--vv-borda)',
  color: 'var(--vv-texto-primario)',
};

export interface ItemEmEdicao extends PosologiaInput {
  /** Só para exibir enquanto o profissional monta — o servidor congela o dele. */
  nome: string;
}

/**
 * Lista de itens com posologia, usada tanto para montar um modelo quanto para
 * prescrever a um paciente. O catálogo já vem filtrado pela API conforme a
 * competência do profissional logado.
 */
export function EditorDeItensPrescritos({
  itens,
  aoMudar,
}: {
  itens: ItemEmEdicao[];
  aoMudar: (itens: ItemEmEdicao[]) => void;
}) {
  const [catalogo, setCatalogo] = useState<PrescritivelResumo[]>([]);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    sdk.prescritiveis
      .listar({ limit: 100 })
      .then(setCatalogo)
      .catch(() => undefined);
  }, []);

  const disponiveis = useMemo(() => {
    const jaEscolhidos = new Set(itens.map((i) => i.prescritivelId));
    const alvo = busca.trim().toLowerCase();
    return catalogo
      .filter((c) => !jaEscolhidos.has(c.id))
      .filter((c) => (alvo ? c.nome.toLowerCase().includes(alvo) : true))
      .slice(0, 8);
  }, [catalogo, itens, busca]);

  function adicionar(p: PrescritivelResumo) {
    aoMudar([...itens, { prescritivelId: p.id, nome: p.nome, horarios: [] }]);
    setBusca('');
  }

  function alterar(indice: number, mudanca: Partial<ItemEmEdicao>) {
    aoMudar(itens.map((i, n) => (n === indice ? { ...i, ...mudanca } : i)));
  }

  return (
    <div className="flex flex-col gap-md">
      {itens.map((item, indice) => (
        <Cartao key={item.prescritivelId}>
          <div className="flex items-start justify-between gap-sm">
            <h3 className="font-semibold">{item.nome}</h3>
            <button
              onClick={() => aoMudar(itens.filter((_, n) => n !== indice))}
              className="text-sm underline"
              style={{ color: 'var(--vv-texto-secundario)' }}
              aria-label={`Remover ${item.nome}`}
            >
              Remover
            </button>
          </div>

          <div className="mt-md grid gap-md sm:grid-cols-4">
            <label className="flex flex-col gap-xs">
              <span className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                Dose
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                className="min-h-toque rounded-md border px-md"
                style={entrada}
                value={item.dose ?? ''}
                onChange={(e) =>
                  alterar(indice, { dose: e.target.value ? Number(e.target.value) : undefined })
                }
              />
            </label>

            <label className="flex flex-col gap-xs">
              <span className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                Unidade
              </span>
              <select
                className="min-h-toque rounded-md border px-md"
                style={entrada}
                value={item.unidade ?? ''}
                onChange={(e) => alterar(indice, { unidade: e.target.value || undefined })}
              >
                <option value="">—</option>
                {UNIDADES_DOSE.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-xs sm:col-span-2">
              <span className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                Frequência
              </span>
              <input
                list={`freq-${indice}`}
                className="min-h-toque rounded-md border px-md"
                style={entrada}
                value={item.frequencia ?? ''}
                onChange={(e) => alterar(indice, { frequencia: e.target.value || undefined })}
                placeholder="2x ao dia"
              />
              <datalist id={`freq-${indice}`}>
                {FREQUENCIAS.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </label>

            <label className="flex flex-col gap-xs">
              <span className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                Duração (dias)
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                className="min-h-toque rounded-md border px-md"
                style={entrada}
                value={item.duracaoDias ?? ''}
                onChange={(e) =>
                  alterar(indice, {
                    duracaoDias: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </label>

            <label className="flex flex-col gap-xs">
              <span className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                Via
              </span>
              <select
                className="min-h-toque rounded-md border px-md"
                style={entrada}
                value={item.via ?? ''}
                onChange={(e) => alterar(indice, { via: e.target.value || undefined })}
              >
                <option value="">—</option>
                {VIAS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-xs sm:col-span-2">
              <span className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                Horários
              </span>
              <input
                className="min-h-toque rounded-md border px-md"
                style={entrada}
                value={item.horarios.join(', ')}
                onChange={(e) =>
                  alterar(indice, {
                    // Aceita "08:00, 20:00"; o schema valida HH:MM no envio.
                    horarios: e.target.value
                      .split(',')
                      .map((h) => h.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="08:00, 20:00"
              />
            </label>
          </div>

          <input
            className="mt-md min-h-toque w-full rounded-md border px-md"
            style={entrada}
            value={item.observacao ?? ''}
            onChange={(e) => alterar(indice, { observacao: e.target.value || undefined })}
            placeholder="Observação para este item (opcional)"
          />
        </Cartao>
      ))}

      <Cartao>
        <input
          className="min-h-toque w-full rounded-md border px-md"
          style={entrada}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar no catálogo para adicionar…"
        />

        <div className="mt-md flex flex-wrap gap-sm">
          {disponiveis.map((p) => (
            <Botao key={p.id} variante="neutra" onClick={() => adicionar(p)}>
              {p.nome}
              <span className="ml-sm text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                {ROTULO_TIPO_PRESCRITIVEL[p.tipo]}
              </span>
            </Botao>
          ))}
        </div>

        {disponiveis.length === 0 && (
          <p className="mt-md text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            {catalogo.length === 0
              ? 'Seu catálogo está vazio. Cadastre itens em Prescrições.'
              : 'Nenhum item corresponde à busca.'}
          </p>
        )}
      </Cartao>
    </div>
  );
}
