'use client';

import type { AlimentoResumo } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Aviso, Botao, Campo, Cartao } from '../../../../../components/ui';
import {
  corDaMeta,
  corpoDoPlano,
  macrosDaPorcao,
  macrosDaRefeicao,
  metaEmNumero,
  problemaDaQuantidade,
  problemasDoPlano,
  quantidadeEmGramas,
  somar,
  type MetasNaTela,
  type RefeicaoNaTela,
} from '../../../../../lib/dieta';
import { sdk } from '../../../../../lib/sdk';

const AZUL_NUTRICAO = '#2A8CA3';

export default function MontarDieta() {
  const { alunoId } = useParams<{ alunoId: string }>();
  const router = useRouter();

  const [nome, setNome] = useState('');
  const [kcalAlvo, setKcalAlvo] = useState('');
  const [proteinaAlvo, setProteinaAlvo] = useState('');
  const [carboAlvo, setCarboAlvo] = useState('');
  const [gorduraAlvo, setGorduraAlvo] = useState('');

  const [refeicoes, setRefeicoes] = useState<RefeicaoNaTela[]>([
    { nome: 'Café da manhã', horario: '07:00', itens: [] },
  ]);
  const [ativa, setAtiva] = useState(0);

  const [alimentos, setAlimentos] = useState<AlimentoResumo[]>([]);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    sdk.alimentos
      .listar({ q: busca || undefined, limit: 60 })
      .then(setAlimentos)
      .catch(() => setErro('Não foi possível carregar a tabela de alimentos.'));
  }, [busca]);

  const metas: MetasNaTela = useMemo(
    () => ({ kcal: kcalAlvo, proteina: proteinaAlvo, carbo: carboAlvo, gordura: gorduraAlvo }),
    [kcalAlvo, proteinaAlvo, carboAlvo, gorduraAlvo],
  );

  const macrosPorRefeicao = useMemo(() => refeicoes.map(macrosDaRefeicao), [refeicoes]);
  const total = useMemo(() => somar(macrosPorRefeicao), [macrosPorRefeicao]);

  const problemas = useMemo(
    () => problemasDoPlano(nome, refeicoes, metas),
    [nome, refeicoes, metas],
  );
  const podeSalvar = problemas.length === 0;

  function adicionar(alimento: AlimentoResumo) {
    setRefeicoes((atual) =>
      atual.map((r, i) =>
        i === ativa
          ? {
              ...r,
              itens: [
                ...r.itens,
                {
                  chave: `${alimento.id}-${Date.now()}`,
                  alimento,
                  // Começa na medida caseira quando existe — é como o nutri pensa.
                  quantidadeG: String(alimento.medidaGramas ?? 100),
                },
              ],
            }
          : r,
      ),
    );
  }

  function alterarQuantidade(chave: string, valor: string) {
    setRefeicoes((atual) =>
      atual.map((r, i) =>
        i === ativa
          ? { ...r, itens: r.itens.map((it) => (it.chave === chave ? { ...it, quantidadeG: valor } : it)) }
          : r,
      ),
    );
  }

  function remover(chave: string) {
    setRefeicoes((atual) =>
      atual.map((r, i) => (i === ativa ? { ...r, itens: r.itens.filter((it) => it.chave !== chave) } : r)),
    );
  }

  async function salvar(ativar: boolean) {
    if (!podeSalvar) return;
    setSalvando(true);
    setErro(null);
    try {
      await sdk.dietas.criar(alunoId, corpoDoPlano(nome, metas, refeicoes, ativar));
      router.push(`/alunos/${alunoId}`);
    } catch (e) {
      setErro(
        e instanceof ErroApi && e.codigo === 'CONSENTIMENTO_AUSENTE'
          ? 'O aluno não autorizou o compartilhamento dos dados de nutrição.'
          : 'Não foi possível salvar o plano.',
      );
    } finally {
      setSalvando(false);
    }
  }

  const refeicao = refeicoes[ativa]!;
  const kcalDaMeta = metaEmNumero(kcalAlvo) ?? null;

  return (
    <div className="flex flex-col gap-xl pb-2xl">
      <Link href={`/alunos/${alunoId}`} className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
        ← Voltar para a ficha
      </Link>

      <h1 className="text-2xl font-bold">Montar plano alimentar</h1>

      <Cartao>
        <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <Campo rotulo="Nome do plano" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Cutting — 1.800 kcal" />
          </div>
          <Campo rotulo="Meta kcal" type="number" value={kcalAlvo} onChange={(e) => setKcalAlvo(e.target.value)} />
          <Campo rotulo="Meta proteína (g)" type="number" value={proteinaAlvo} onChange={(e) => setProteinaAlvo(e.target.value)} />
          <Campo rotulo="Meta carbo (g)" type="number" value={carboAlvo} onChange={(e) => setCarboAlvo(e.target.value)} />
          <Campo rotulo="Meta gordura (g)" type="number" value={gorduraAlvo} onChange={(e) => setGorduraAlvo(e.target.value)} />
        </div>
      </Cartao>

      {/* Abas de refeição */}
      <div className="flex flex-wrap items-center gap-md">
        {refeicoes.map((r, i) => (
          <button
            key={i}
            onClick={() => setAtiva(i)}
            className="min-h-toque rounded-md border px-lg font-semibold"
            style={{
              background: i === ativa ? AZUL_NUTRICAO : 'transparent',
              color: i === ativa ? '#FFFFFF' : 'var(--vv-texto-primario)',
              borderColor: i === ativa ? AZUL_NUTRICAO : 'var(--vv-borda)',
            }}
          >
            {r.nome} · {Math.round(macrosPorRefeicao[i]!.kcal)} kcal
          </button>
        ))}
        <Botao
          variante="neutra"
          onClick={() =>
            setRefeicoes((atual) => {
              setAtiva(atual.length);
              return [...atual, { nome: `Refeição ${atual.length + 1}`, horario: '', itens: [] }];
            })
          }
        >
          + Refeição
        </Botao>
      </div>

      <div className="grid gap-xl lg:grid-cols-[1fr_320px]">
        <section className="flex flex-col gap-md">
          <div className="flex flex-wrap gap-md">
            <div className="flex-1">
              <Campo
                rotulo="Nome da refeição"
                value={refeicao.nome}
                erro={refeicao.nome.trim() === '' ? 'dê um nome à refeição' : undefined}
                onChange={(e) =>
                  setRefeicoes((a) => a.map((r, i) => (i === ativa ? { ...r, nome: e.target.value } : r)))
                }
              />
            </div>
            <Campo
              rotulo="Horário"
              type="time"
              value={refeicao.horario}
              onChange={(e) =>
                setRefeicoes((a) => a.map((r, i) => (i === ativa ? { ...r, horario: e.target.value } : r)))
              }
            />
          </div>

          {refeicao.itens.length === 0 && (
            <Aviso tipo="info">Nenhum alimento nesta refeição. Escolha na tabela ao lado.</Aviso>
          )}

          {refeicao.itens.map((item) => {
            const m = macrosDaPorcao(item.alimento, quantidadeEmGramas(item.quantidadeG) ?? 0);
            return (
              <Cartao key={item.chave}>
                <div className="flex flex-wrap items-center justify-between gap-md">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{item.alimento.nome}</p>
                    <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                      {item.alimento.medidaCaseira ?? item.alimento.grupo}
                      {item.alimento.medidaGramas ? ` · ${item.alimento.medidaGramas} g` : ''}
                    </p>
                  </div>

                  <div style={{ width: 110 }}>
                    <Campo
                      rotulo="Gramas"
                      inputMode="decimal"
                      value={item.quantidadeG}
                      erro={problemaDaQuantidade(item.quantidadeG) ?? undefined}
                      onChange={(e) => alterarQuantidade(item.chave, e.target.value)}
                    />
                  </div>

                  <div className="text-right text-sm tabular-nums" style={{ minWidth: 150 }}>
                    <p className="font-bold">{Math.round(m.kcal)} kcal</p>
                    <p style={{ color: 'var(--vv-texto-secundario)' }}>
                      P{m.proteinaG} C{m.carboidratoG} G{m.gorduraG}
                    </p>
                  </div>

                  <button
                    onClick={() => remover(item.chave)}
                    aria-label={`Remover ${item.alimento.nome}`}
                    className="min-h-toque min-w-toque rounded-md border"
                    style={{ borderColor: 'var(--vv-erro)', color: 'var(--vv-erro)' }}
                  >
                    ×
                  </button>
                </div>
              </Cartao>
            );
          })}
        </section>

        <aside className="flex flex-col gap-md">
          <Cartao>
            <p className="mb-sm font-semibold">Total do plano</p>
            <dl className="flex flex-col gap-xs text-sm">
              {[
                { rotulo: 'Calorias', atual: total.kcal, alvo: kcalDaMeta, unidade: 'kcal' },
                { rotulo: 'Proteína', atual: total.proteinaG, alvo: metaEmNumero(proteinaAlvo) ?? null, unidade: 'g' },
                { rotulo: 'Carboidrato', atual: total.carboidratoG, alvo: metaEmNumero(carboAlvo) ?? null, unidade: 'g' },
                { rotulo: 'Gordura', atual: total.gorduraG, alvo: metaEmNumero(gorduraAlvo) ?? null, unidade: 'g' },
                { rotulo: 'Fibra', atual: total.fibraG, alvo: null, unidade: 'g' },
              ].map((linha) => (
                <div key={linha.rotulo} className="flex items-center justify-between">
                  <dt style={{ color: 'var(--vv-texto-secundario)' }}>{linha.rotulo}</dt>
                  <dd className="tabular-nums font-semibold" style={{ color: corDaMeta(linha.atual, linha.alvo) }}>
                    {Math.round(linha.atual)}
                    {linha.alvo && (
                      <span className="font-normal" style={{ color: 'var(--vv-texto-secundario)' }}>
                        {' '}
                        / {linha.alvo}
                      </span>
                    )}{' '}
                    {linha.unidade}
                  </dd>
                </div>
              ))}
            </dl>

            {kcalDaMeta !== null && kcalDaMeta > 0 && Math.abs(total.kcal - kcalDaMeta) / kcalDaMeta > 0.05 && (
              <p className="mt-md text-sm" style={{ color: 'var(--vv-alerta)' }}>
                {total.kcal < kcalDaMeta
                  ? `Faltam ${Math.round(kcalDaMeta - total.kcal)} kcal para a meta.`
                  : `Passou ${Math.round(total.kcal - kcalDaMeta)} kcal da meta.`}
              </p>
            )}
          </Cartao>

          <div>
            <p className="mb-sm font-semibold">Alimentos</p>
            <Campo rotulo="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="frango, arroz…" />
            <div className="mt-sm flex max-h-[50vh] flex-col gap-xs overflow-y-auto">
              {alimentos.map((a) => (
                <button
                  key={a.id}
                  onClick={() => adicionar(a)}
                  aria-label={`Adicionar ${a.nome} à refeição`}
                  className="min-h-toque rounded-md border p-md text-left"
                  style={{ borderColor: 'var(--vv-borda)', background: 'var(--vv-superficie)' }}
                >
                  <span className="block font-medium">{a.nome}</span>
                  <span className="block text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                    {a.porcao100g.kcal} kcal · P{a.porcao100g.proteinaG} · 100 g
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div
        className="sticky bottom-0 flex flex-col gap-sm border-t py-lg"
        style={{ background: 'var(--vv-fundo)', borderColor: 'var(--vv-borda)' }}
      >
        {/*
          O que falta para salvar, dito antes de tentar. Sem isto o botão fica
          desabilitado sem explicar por quê, que é o pior dos dois mundos: nada
          acontece e não há o que corrigir.
        */}
        {problemas.length > 0 && (
          <ul className="flex flex-col gap-xs text-sm" style={{ color: 'var(--vv-alerta)' }}>
            {problemas.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-between gap-md">
          <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            {refeicoes.length} {refeicoes.length === 1 ? 'refeição' : 'refeições'} ·{' '}
            {Math.round(total.kcal)} kcal
          </p>
          <div className="flex gap-md">
            <Botao variante="neutra" disabled={!podeSalvar || salvando} onClick={() => void salvar(false)}>
              Salvar rascunho
            </Botao>
            <Botao disabled={!podeSalvar || salvando} onClick={() => void salvar(true)}>
              {salvando ? 'Salvando…' : 'Salvar e ativar'}
            </Botao>
          </div>
        </div>
      </div>
    </div>
  );
}
