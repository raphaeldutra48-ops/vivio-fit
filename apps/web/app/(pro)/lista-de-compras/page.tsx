'use client';

import type { ListaDeCompras, VinculoResumo } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { useEffect, useState } from 'react';
import { Aviso, Botao, Cartao } from '../../../components/ui';
import { sdk } from '../../../lib/sdk';

const PERIODOS = [
  { dias: 1, rotulo: '1 dia' },
  { dias: 3, rotulo: '3 dias' },
  { dias: 7, rotulo: '1 semana' },
  { dias: 15, rotulo: '15 dias' },
  { dias: 30, rotulo: '1 mês' },
];

export default function ListaDeComprasPagina() {
  const [alunos, setAlunos] = useState<VinculoResumo[]>([]);
  const [alunoId, setAlunoId] = useState('');
  const [dias, setDias] = useState(7);
  const [lista, setLista] = useState<ListaDeCompras | null>(null);
  const [comprados, setComprados] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    sdk.vinculos
      .meusAlunos('ATIVO')
      .then((l) => {
        setAlunos(l);
        setAlunoId((a) => a || (l[0]?.contraparte.id ?? ''));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!alunoId) return;
    setLista(null);
    setComprados(new Set());
    sdk.listaDeCompras
      .gerar(alunoId, dias)
      .then((l) => {
        setLista(l);
        setErro(null);
      })
      .catch((e) => {
        setLista(null);
        setErro(
          e instanceof ErroApi && e.status === 404
            ? 'Este aluno não tem plano alimentar ativo. A lista sai do plano em uso.'
            : 'Não foi possível gerar a lista.',
        );
      });
  }, [alunoId, dias]);

  function alternar(id: string) {
    setComprados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  const totalItens = lista?.totalItens ?? 0;

  return (
    <div className="flex flex-col gap-xl">
      <div>
        <h1 className="text-2xl font-bold">Lista de compras</h1>
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          Sai do plano alimentar ativo, agrupada por corredor de supermercado.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-md">
        <label className="flex flex-col gap-xs">
          <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            Aluno
          </span>
          <select
            className="min-h-toque rounded-md border px-md"
            style={{
              background: 'var(--vv-superficie)',
              borderColor: 'var(--vv-borda)',
              color: 'var(--vv-texto-primario)',
            }}
            value={alunoId}
            onChange={(e) => setAlunoId(e.target.value)}
          >
            {alunos.length === 0 && <option value="">Nenhum aluno ativo</option>}
            {alunos.map((v) => (
              <option key={v.contraparte.id} value={v.contraparte.id}>
                {v.contraparte.nome}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-xs">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              onClick={() => setDias(p.dias)}
              aria-pressed={dias === p.dias}
              className="min-h-toque rounded-md border px-lg text-sm font-semibold"
              style={{
                borderColor: dias === p.dias ? 'var(--vv-acao-fundo)' : 'var(--vv-borda)',
                background: dias === p.dias ? 'var(--vv-acao-fundo)' : 'transparent',
                color: dias === p.dias ? 'var(--vv-acao-texto)' : 'var(--vv-texto-primario)',
              }}
            >
              {p.rotulo}
            </button>
          ))}
        </div>

        {lista && (
          <Botao variante="neutra" onClick={() => window.print()}>
            Imprimir
          </Botao>
        )}
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {lista && (
        <>
          <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            {lista.planoNome} · {totalItens} {totalItens === 1 ? 'item' : 'itens'} ·{' '}
            {comprados.size} marcados
          </p>

          <div className="flex flex-col gap-lg">
            {lista.secoes.map((secao) => (
              <section key={secao.secao} className="flex flex-col gap-sm">
                <h2 className="text-lg font-semibold">{secao.secao}</h2>
                <Cartao>
                  <ul className="flex flex-col">
                    {secao.itens.map((item, i) => {
                      const marcado = comprados.has(item.alimentoId);
                      return (
                        <li
                          key={item.alimentoId}
                          style={{
                            borderTop: i === 0 ? 'none' : '1px solid var(--vv-borda)',
                          }}
                        >
                          <label className="flex min-h-toque cursor-pointer items-center gap-md py-sm">
                            <input
                              type="checkbox"
                              checked={marcado}
                              onChange={() => alternar(item.alimentoId)}
                              aria-label={`Marcar ${item.nome} como comprado`}
                              style={{ width: 20, height: 20 }}
                            />
                            <span
                              className="flex-1"
                              style={{
                                textDecoration: marcado ? 'line-through' : 'none',
                                opacity: marcado ? 0.5 : 1,
                              }}
                            >
                              <span className="block font-medium">{item.nome}</span>
                              <span
                                className="block text-xs"
                                style={{ color: 'var(--vv-texto-secundario)' }}
                              >
                                {item.aparecEm.join(', ')}
                              </span>
                            </span>
                            <span
                              className="text-right tabular-nums"
                              style={{
                                opacity: marcado ? 0.5 : 1,
                              }}
                            >
                              <span className="block font-bold">{item.quantidadeFormatada}</span>
                              {item.equivalencia && (
                                <span
                                  className="block text-xs"
                                  style={{ color: 'var(--vv-texto-secundario)' }}
                                >
                                  {item.equivalencia}
                                </span>
                              )}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </Cartao>
              </section>
            ))}
          </div>

          <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
            Quantidades cruas conforme prescrito no plano. Gerada em{' '}
            {new Date(lista.geradaEm).toLocaleString('pt-BR')}.
          </p>
        </>
      )}
    </div>
  );
}
