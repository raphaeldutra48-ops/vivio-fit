'use client';

import {
  descreverItem,
  type AlimentoResumo,
  type ReceitaResumo,
  type RefeicaoSalvaResumo,
} from '@vivio/contracts';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BuscaDeAlimento } from '../../../../components/BuscaDeAlimento';
import { Aviso, Botao, Campo, Cartao } from '../../../../components/ui';
import { erroVisivel } from '../../../../lib/campos';
import {
  corpoDaRefeicao,
  problemaDoHorario,
  problemaDoItem,
  problemasDaRefeicao,
  type ItemDigitado,
} from '../../../../lib/plano-alimentar';
import { sdk } from '../../../../lib/sdk';

const entrada = {
  background: 'var(--vv-superficie)',
  borderColor: 'var(--vv-borda)',
  color: 'var(--vv-texto-primario)',
};

export default function RefeicoesSalvas() {
  const [refeicoes, setRefeicoes] = useState<RefeicaoSalvaResumo[]>([]);
  const [receitas, setReceitas] = useState<ReceitaResumo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [editando, setEditando] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [horario, setHorario] = useState('');
  const [observacao, setObservacao] = useState('');
  // Texto, e não número, no estado: guardar `Number(e.target.value)` faz apagar
  // o campo para redigitar estacionar um `0` que ninguém digitou.
  const [itens, setItens] = useState<ItemDigitado[]>([]);

  const carregar = () =>
    sdk.refeicoesSalvas
      .listar()
      .then(setRefeicoes)
      .catch(() => setErro('Não foi possível carregar as refeições.'));

  useEffect(() => {
    void carregar();
    sdk.receitas
      .listar()
      .then(setReceitas)
      .catch(() => undefined);
  }, []);

  function abrirNova() {
    setEditando('');
    setErro(null);
    setNome('');
    setHorario('');
    setObservacao('');
    setItens([]);
  }

  function abrirEdicao(r: RefeicaoSalvaResumo) {
    setEditando(r.id);
    setErro(null);
    setNome(r.nome);
    setHorario(r.horarioSugerido ?? '');
    setObservacao(r.observacao ?? '');
    setItens(
      r.itens.map((i) => ({
        chave: i.id,
        nome: i.nome,
        ehReceita: i.ehReceita,
        alimentoId: i.alimentoId ?? undefined,
        receitaId: i.receitaId ?? undefined,
        quantidade: String(i.ehReceita ? (i.porcoes ?? '') : (i.quantidadeG ?? '')),
      })),
    );
  }

  const adicionarAlimento = (a: AlimentoResumo) =>
    setItens((atual) => [
      ...atual,
      {
        chave: `a-${a.id}-${atual.length}`,
        nome: a.nome,
        ehReceita: false,
        alimentoId: a.id,
        quantidade: String(a.medidaGramas ?? 100),
      },
    ]);

  const adicionarReceita = (r: ReceitaResumo) =>
    setItens((atual) => [
      ...atual,
      {
        chave: `r-${r.id}-${atual.length}`,
        nome: r.nome,
        ehReceita: true,
        receitaId: r.id,
        quantidade: '1',
      },
    ]);

  const problemas = useMemo(
    () => problemasDaRefeicao(nome, horario, itens),
    [nome, horario, itens],
  );
  const podeSalvar = problemas.length === 0;

  async function salvar() {
    if (!podeSalvar) return;
    setErro(null);
    setSalvando(true);
    const corpo = corpoDaRefeicao(nome, horario, observacao, itens);
    try {
      if (editando) await sdk.refeicoesSalvas.atualizar(editando, corpo);
      else await sdk.refeicoesSalvas.criar(corpo);
      setEditando(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a refeição.');
    } finally {
      setSalvando(false);
    }
  }

  async function remover(r: RefeicaoSalvaResumo) {
    if (!confirm(`Remover "${r.nome}"?`)) return;
    await sdk.refeicoesSalvas.remover(r.id).catch(() => undefined);
    await carregar();
  }

  return (
    <div className="flex flex-col gap-xl">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="text-2xl font-bold">Refeições</h1>
          <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            Combinações que você repete — monte uma vez e reúse em vários planos.
          </p>
        </div>
        <Botao
          onClick={() => (editando === null ? abrirNova() : setEditando(null))}
          variante={editando === null ? 'acao' : 'neutra'}
        >
          {editando === null ? '+ Nova refeição' : 'Cancelar'}
        </Botao>
      </div>

      {editando !== null && (
        <div className="flex flex-col gap-md">
          <Cartao>
            <div className="grid gap-md sm:grid-cols-[1fr_140px]">
              <Campo
                rotulo="Nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Café da manhã padrão"
                autoFocus
              />
              <Campo
                rotulo="Horário sugerido"
                type="time"
                value={horario}
                erro={erroVisivel(horario, problemaDoHorario(horario))}
                onChange={(e) => setHorario(e.target.value)}
              />
            </div>
          </Cartao>

          <Cartao>
            <p className="mb-md font-semibold">Itens</p>

            {itens.map((i, indice) => (
              <div
                key={i.chave}
                className="flex flex-wrap items-end gap-md py-sm"
                style={{ borderTop: indice > 0 ? '1px solid var(--vv-borda)' : undefined }}
              >
                <span className="flex-1 font-medium">
                  {i.nome}
                  {i.ehReceita && (
                    <span
                      className="ml-sm text-xs"
                      style={{ color: 'var(--vv-texto-secundario)' }}
                    >
                      receita
                    </span>
                  )}
                </span>
                <label className="flex flex-col gap-xs">
                  <span className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                    {i.ehReceita ? 'Porções' : 'Gramas'}
                  </span>
                  <input
                    inputMode="decimal"
                    className="min-h-toque w-[110px] rounded-md border px-md"
                    style={{
                      ...entrada,
                      borderColor: problemaDoItem(i) ? 'var(--vv-erro)' : 'var(--vv-borda)',
                    }}
                    value={i.quantidade}
                    onChange={(e) =>
                      setItens((atual) =>
                        atual.map((x, n) =>
                          n === indice ? { ...x, quantidade: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  {problemaDoItem(i) && (
                    <span className="text-xs" style={{ color: 'var(--vv-erro)' }} role="alert">
                      {problemaDoItem(i)}
                    </span>
                  )}
                </label>
                <button
                  onClick={() => setItens((a) => a.filter((_, n) => n !== indice))}
                  className="min-h-toque px-md text-sm underline"
                  style={{ color: 'var(--vv-texto-secundario)' }}
                >
                  Remover
                </button>
              </div>
            ))}

            <div className="mt-lg flex flex-col gap-lg">
              <BuscaDeAlimento aoEscolher={adicionarAlimento} />

              {receitas.length > 0 && (
                <div className="flex flex-col gap-sm">
                  <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                    Ou usar uma receita sua
                  </span>
                  <div className="flex flex-wrap gap-sm">
                    {receitas.map((r) => (
                      <Botao key={r.id} variante="neutra" onClick={() => adicionarReceita(r)}>
                        {r.nome}
                        <span
                          className="ml-sm text-xs"
                          style={{ color: 'var(--vv-texto-secundario)' }}
                        >
                          {r.macrosPorPorcao.kcal} kcal/porção
                        </span>
                      </Botao>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Cartao>

          <Cartao>
            <label className="flex flex-col gap-xs">
              <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                Observação (opcional)
              </span>
              <textarea
                className="min-h-[70px] rounded-md border p-md"
                style={entrada}
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Trocar a fruta conforme a estação."
              />
            </label>
          </Cartao>

          {erro && <Aviso tipo="erro">{erro}</Aviso>}

          {problemas.length > 0 && (
            <ul className="flex flex-col gap-xs text-sm" style={{ color: 'var(--vv-alerta)' }}>
              {problemas.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}

          <div className="flex justify-end">
            <Botao onClick={salvar} disabled={!podeSalvar || salvando}>
              {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Criar refeição'}
            </Botao>
          </div>
        </div>
      )}

      {editando === null && (
        <>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}

          <div className="grid gap-md lg:grid-cols-2">
            {refeicoes.map((r) => (
              <Cartao key={r.id}>
                <div className="flex items-start justify-between gap-sm">
                  <div>
                    <h2 className="font-semibold">{r.nome}</h2>
                    {r.horarioSugerido && (
                      <p className="text-sm tabular-nums" style={{ color: 'var(--vv-texto-secundario)' }}>
                        {r.horarioSugerido}
                      </p>
                    )}
                  </div>
                  <p className="text-lg font-bold tabular-nums">{r.macrosTotais.kcal} kcal</p>
                </div>

                <ul className="mt-md flex flex-col gap-xs">
                  {r.itens.map((i) => (
                    <li key={i.id} className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                      <span className="tabular-nums">{descreverItem(i)}</span> — {i.nome}
                    </li>
                  ))}
                </ul>

                <p className="mt-sm text-sm tabular-nums" style={{ color: 'var(--vv-texto-secundario)' }}>
                  P {r.macrosTotais.proteinaG} g · C {r.macrosTotais.carboidratoG} g · G{' '}
                  {r.macrosTotais.gorduraG} g
                </p>

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

          {refeicoes.length === 0 && (
            <p style={{ color: 'var(--vv-texto-secundario)' }}>
              Nenhuma refeição salva ainda. Se você monta o mesmo café da manhã toda semana, salve
              aqui — e considere criar{' '}
              <Link href="/plano-alimentar/receitas" className="underline">
                receitas
              </Link>{' '}
              para as preparações.
            </p>
          )}
        </>
      )}
    </div>
  );
}
