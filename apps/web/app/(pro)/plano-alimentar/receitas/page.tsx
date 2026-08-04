'use client';

import type { AlimentoResumo, ReceitaResumo } from '@vivio/contracts';
import { useEffect, useMemo, useState } from 'react';
import { BuscaDeAlimento } from '../../../../components/BuscaDeAlimento';
import { Aviso, Botao, Campo, Cartao } from '../../../../components/ui';
import { erroVisivel } from '../../../../lib/campos';
import {
  corpoDaReceita,
  problemaDasGramas,
  problemaDoRendimento,
  problemaDoTempo,
  problemasDaReceita,
  type IngredienteDigitado,
} from '../../../../lib/plano-alimentar';
import { sdk } from '../../../../lib/sdk';

const entrada = {
  background: 'var(--vv-superficie)',
  borderColor: 'var(--vv-borda)',
  color: 'var(--vv-texto-primario)',
};

export default function Receitas() {
  const [receitas, setReceitas] = useState<ReceitaResumo[]>([]);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  /** null = fechado; '' = criando; id = editando. */
  const [editando, setEditando] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [modoPreparo, setModoPreparo] = useState('');
  // Texto, não número: guardar `Number(e.target.value)` no estado faz apagar o
  // campo para redigitar estacionar um `0` que ninguém digitou.
  const [rendePorcoes, setRende] = useState('1');
  const [nomeDaPorcao, setNomeDaPorcao] = useState('');
  const [tempoMinutos, setTempo] = useState('');
  const [ingredientes, setIngredientes] = useState<IngredienteDigitado[]>([]);

  const carregar = () =>
    sdk.receitas
      .listar(busca || undefined)
      .then(setReceitas)
      .catch(() => setErro('Não foi possível carregar as receitas.'));

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  function abrirNova() {
    setEditando('');
    setErro(null);
    setNome('');
    setModoPreparo('');
    setRende('1');
    setNomeDaPorcao('');
    setTempo('');
    setIngredientes([]);
  }

  function abrirEdicao(r: ReceitaResumo) {
    setEditando(r.id);
    setErro(null);
    setNome(r.nome);
    setModoPreparo(r.modoPreparo ?? '');
    setRende(String(r.rendePorcoes));
    setNomeDaPorcao(r.nomeDaPorcao ?? '');
    setTempo(r.tempoMinutos?.toString() ?? '');
    setIngredientes(
      r.ingredientes.map((i) => ({
        alimentoId: i.alimentoId,
        nome: i.nome,
        quantidadeG: String(i.quantidadeG),
      })),
    );
  }

  function adicionar(a: AlimentoResumo) {
    setIngredientes((atual) => [
      ...atual,
      { alimentoId: a.id, nome: a.nome, quantidadeG: String(a.medidaGramas ?? 100) },
    ]);
  }

  const problemas = useMemo(
    () => problemasDaReceita(nome, rendePorcoes, tempoMinutos, ingredientes),
    [nome, rendePorcoes, tempoMinutos, ingredientes],
  );
  const podeSalvar = problemas.length === 0;

  async function salvar() {
    if (!podeSalvar) return;
    setErro(null);
    setSalvando(true);
    const corpo = corpoDaReceita(
      nome,
      modoPreparo,
      rendePorcoes,
      nomeDaPorcao,
      tempoMinutos,
      ingredientes,
    );
    try {
      if (editando) await sdk.receitas.atualizar(editando, corpo);
      else await sdk.receitas.criar(corpo);
      setEditando(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a receita.');
    } finally {
      setSalvando(false);
    }
  }

  async function remover(r: ReceitaResumo) {
    if (!confirm(`Remover "${r.nome}"?\n\nRefeições que já usam esta receita continuam válidas.`))
      return;
    await sdk.receitas.remover(r.id).catch(() => undefined);
    await carregar();
  }

  return (
    <div className="flex flex-col gap-xl">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="text-2xl font-bold">Receitas</h1>
          <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            Os macros por porção saem da soma dos ingredientes — nunca digitados à mão.
          </p>
        </div>
        <Botao
          onClick={() => (editando === null ? abrirNova() : setEditando(null))}
          variante={editando === null ? 'acao' : 'neutra'}
        >
          {editando === null ? '+ Nova receita' : 'Cancelar'}
        </Botao>
      </div>

      {editando !== null && (
        <div className="flex flex-col gap-md">
          <Cartao>
            <div className="grid gap-md sm:grid-cols-2">
              <Campo
                rotulo="Nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Panqueca de banana"
                autoFocus
              />
              <Campo
                rotulo="Tempo de preparo em minutos (opcional)"
                inputMode="numeric"
                value={tempoMinutos}
                erro={erroVisivel(tempoMinutos, problemaDoTempo(tempoMinutos))}
                onChange={(e) => setTempo(e.target.value)}
              />
              <Campo
                rotulo="Rende quantas porções"
                inputMode="decimal"
                value={rendePorcoes}
                erro={erroVisivel(rendePorcoes, problemaDoRendimento(rendePorcoes))}
                onChange={(e) => setRende(e.target.value)}
              />
              <Campo
                rotulo="Nome da porção (opcional)"
                value={nomeDaPorcao}
                onChange={(e) => setNomeDaPorcao(e.target.value)}
                placeholder="1 fatia, 1 concha, 1 pote"
              />
            </div>
          </Cartao>

          <Cartao>
            <p className="mb-md font-semibold">Ingredientes</p>

            {ingredientes.map((i, indice) => (
              <div
                key={i.alimentoId}
                className="flex flex-wrap items-end gap-md py-sm"
                style={{ borderTop: indice > 0 ? '1px solid var(--vv-borda)' : undefined }}
              >
                <span className="flex-1 font-medium">{i.nome}</span>
                <label className="flex flex-col gap-xs">
                  <span className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                    Gramas
                  </span>
                  <input
                    inputMode="decimal"
                    className="min-h-toque w-[110px] rounded-md border px-md"
                    style={{
                      ...entrada,
                      borderColor: problemaDasGramas(i.quantidadeG)
                        ? 'var(--vv-erro)'
                        : 'var(--vv-borda)',
                    }}
                    value={i.quantidadeG}
                    onChange={(e) =>
                      setIngredientes((atual) =>
                        atual.map((x, n) =>
                          n === indice ? { ...x, quantidadeG: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  {problemaDasGramas(i.quantidadeG) && (
                    <span className="text-xs" style={{ color: 'var(--vv-erro)' }} role="alert">
                      {problemaDasGramas(i.quantidadeG)}
                    </span>
                  )}
                </label>
                <button
                  onClick={() => setIngredientes((a) => a.filter((_, n) => n !== indice))}
                  className="min-h-toque px-md text-sm underline"
                  style={{ color: 'var(--vv-texto-secundario)' }}
                >
                  Remover
                </button>
              </div>
            ))}

            <div className="mt-md">
              <BuscaDeAlimento
                aoEscolher={adicionar}
                jaEscolhidos={ingredientes.map((i) => i.alimentoId)}
              />
            </div>
          </Cartao>

          <Cartao>
            <label className="flex flex-col gap-xs">
              <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                Modo de preparo (opcional)
              </span>
              <textarea
                className="min-h-[120px] rounded-md border p-md"
                style={entrada}
                value={modoPreparo}
                onChange={(e) => setModoPreparo(e.target.value)}
                placeholder="Amasse a banana, misture o ovo e a aveia, leve à frigideira antiaderente."
              />
            </label>
          </Cartao>

          {erro && <Aviso tipo="erro">{erro}</Aviso>}

          {/* O que falta, dito antes de tentar — botão travado sem explicação
              é o pior dos dois mundos. */}
          {problemas.length > 0 && (
            <ul className="flex flex-col gap-xs text-sm" style={{ color: 'var(--vv-alerta)' }}>
              {problemas.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}

          <div className="flex justify-end">
            <Botao onClick={salvar} disabled={!podeSalvar || salvando}>
              {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Criar receita'}
            </Botao>
          </div>
        </div>
      )}

      {editando === null && (
        <>
          <Campo
            rotulo="Buscar receita"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {erro && <Aviso tipo="erro">{erro}</Aviso>}

          <div className="grid gap-md lg:grid-cols-2">
            {receitas.map((r) => (
              <Cartao key={r.id}>
                <div className="flex items-start justify-between gap-sm">
                  <div>
                    <h2 className="font-semibold">{r.nome}</h2>
                    <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                      Rende {r.rendePorcoes} {r.rendePorcoes === 1 ? 'porção' : 'porções'}
                      {r.nomeDaPorcao && ` de ${r.nomeDaPorcao}`}
                      {r.tempoMinutos && ` · ${r.tempoMinutos} min`}
                    </p>
                  </div>
                </div>

                <div
                  className="mt-md rounded-md p-md"
                  style={{ background: 'var(--vv-fundo)' }}
                >
                  <p className="text-xs uppercase" style={{ color: 'var(--vv-texto-secundario)' }}>
                    Por porção
                  </p>
                  <p className="text-lg font-bold tabular-nums">
                    {r.macrosPorPorcao.kcal} kcal
                  </p>
                  <p className="text-sm tabular-nums" style={{ color: 'var(--vv-texto-secundario)' }}>
                    P {r.macrosPorPorcao.proteinaG} g · C {r.macrosPorPorcao.carboidratoG} g · G{' '}
                    {r.macrosPorPorcao.gorduraG} g
                  </p>
                </div>

                <ul className="mt-md flex flex-col gap-xs">
                  {r.ingredientes.map((i) => (
                    <li
                      key={i.id}
                      className="text-sm tabular-nums"
                      style={{ color: 'var(--vv-texto-secundario)' }}
                    >
                      {i.quantidadeG} g — {i.nome}
                    </li>
                  ))}
                </ul>

                <div className="mt-md flex justify-end gap-sm">
                  <button
                    onClick={() => remover(r)}
                    className="text-sm underline"
                    style={{ color: 'var(--vv-texto-secundario)' }}
                  >
                    Remover
                  </button>
                  <Botao variante="neutra" onClick={() => abrirEdicao(r)}>
                    Editar
                  </Botao>
                </div>
              </Cartao>
            ))}
          </div>

          {receitas.length === 0 && (
            <p style={{ color: 'var(--vv-texto-secundario)' }}>
              {busca
                ? 'Nenhuma receita com esse nome.'
                : 'Nenhuma receita ainda. Uma receita vira porção pronta para usar nos planos.'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
