'use client';

import {
  ROTULO_TIPO_META,
  TIPOS_MENSURAVEIS,
  TipoMeta,
  UNIDADE_TIPO_META,
  type ExercicioResumo,
  type MetaResumo,
} from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { useEffect, useState } from 'react';
import { sdk } from '../lib/sdk';
import { Aviso, Botao, Campo, Cartao } from './ui';

const TIPOS = Object.values(TipoMeta);

/**
 * Barra de progresso.
 *
 * `null` não vira barra vazia: barra em zero parece "não saiu do lugar", e o
 * que houve foi ausência de medição. São coisas diferentes e a tela precisa
 * dizer qual é.
 */
function Barra({ progresso }: { progresso: number | null }) {
  if (progresso === null) {
    return (
      <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
        Sem medição registrada para acompanhar esta meta.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-md">
      <div
        className="h-2 flex-1 overflow-hidden rounded-full"
        style={{ background: 'var(--vv-borda)' }}
        role="progressbar"
        aria-valuenow={progresso}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${progresso}%`,
            background: progresso >= 100 ? 'var(--vv-sucesso)' : 'var(--vv-primaria-fundo)',
          }}
        />
      </div>
      <span className="text-sm font-semibold tabular-nums">{progresso}%</span>
    </div>
  );
}

/**
 * Um cartão de meta.
 *
 * No escopo do módulo, e não dentro de `MetasDoAluno`: definido lá dentro, ele
 * era uma função nova a cada renderização, e o React desmontava e remontava a
 * lista inteira sempre que qualquer campo do formulário de nova meta mudava —
 * ou seja, a cada tecla digitada no título.
 *
 * A única coisa que ele tomava emprestado do render era `acao`; agora ela
 * chega por prop.
 */
/* `Promise<void>` e não `void`: quem chama dispara sem esperar (`void acao(…)`),
   e declarar como síncrona esconderia do TypeScript que há promessa solta. */
type AcaoNaMeta = (
  meta: MetaResumo,
  qual: 'concluir' | 'reabrir' | 'remover',
) => Promise<void>;

function Item({ meta, acao }: { meta: MetaResumo; acao: AcaoNaMeta }) {
  const unidade = UNIDADE_TIPO_META[meta.tipo];
  return (
    <Cartao>
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div className="flex-1">
          <p className="font-semibold">{meta.titulo}</p>
          <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            {ROTULO_TIPO_META[meta.tipo]}
            {meta.exercicioNome && ` · ${meta.exercicioNome}`}
            {meta.alvo !== null && ` · alvo ${meta.alvo} ${unidade}`}
            {meta.prazo && ` · até ${new Date(`${meta.prazo}T12:00:00`).toLocaleDateString('pt-BR')}`}
          </p>
        </div>
        <div className="flex gap-xs">
          {meta.atingida ? (
            <Botao variante="neutra" onClick={() => void acao(meta, 'reabrir')}>
              Reabrir
            </Botao>
          ) : (
            <Botao variante="neutra" onClick={() => void acao(meta, 'concluir')}>
              Concluir
            </Botao>
          )}
          <Botao variante="neutra" onClick={() => void acao(meta, 'remover')}>
            Remover
          </Botao>
        </div>
      </div>

      <div className="mt-md">
        {meta.atingida ? (
          <p className="font-semibold" style={{ color: 'var(--vv-sucesso)' }}>
            Cumprida
            {meta.concluidaEm ? ' — marcada pelo profissional' : ' — aferida pelo sistema'}
          </p>
        ) : (
          <Barra progresso={meta.progresso} />
        )}
      </div>

      {(meta.valorInicial !== null || meta.valorAtual !== null) && !meta.atingida && (
        <p className="mt-xs text-xs tabular-nums" style={{ color: 'var(--vv-texto-secundario)' }}>
          {meta.valorInicial !== null && `começou em ${meta.valorInicial} ${unidade}`}
          {meta.valorInicial !== null && meta.valorAtual !== null && ' · '}
          {meta.valorAtual !== null && `agora ${meta.valorAtual} ${unidade}`}
        </p>
      )}

      {meta.atrasada && (
        <p className="mt-xs text-sm font-semibold" style={{ color: 'var(--vv-alerta)' }}>
          Prazo vencido
        </p>
      )}
    </Cartao>
  );
}

export function MetasDoAluno({ alunoId }: { alunoId: string }) {
  const [metas, setMetas] = useState<MetaResumo[]>([]);
  const [exercicios, setExercicios] = useState<ExercicioResumo[]>([]);
  const [semAutorizacao, setSemAutorizacao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [abrindoForm, setAbrindoForm] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [tipo, setTipo] = useState<TipoMeta>(TipoMeta.PESO_CORPORAL);
  const [titulo, setTitulo] = useState('');
  const [alvo, setAlvo] = useState('');
  const [exercicioId, setExercicioId] = useState('');
  const [prazo, setPrazo] = useState('');

  const mensuravel = TIPOS_MENSURAVEIS.includes(tipo);
  const precisaExercicio = tipo === TipoMeta.CARGA_EXERCICIO;

  async function recarregar() {
    try {
      setMetas(await sdk.metas.listar(alunoId));
      setSemAutorizacao(false);
      setErro(null);
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === 'CONSENTIMENTO_AUSENTE') {
        setSemAutorizacao(true);
        return;
      }
      setErro('Não foi possível carregar as metas.');
    }
  }

  useEffect(() => {
    void recarregar();
  }, [alunoId]);

  // A biblioteca só é buscada quando o formulário abre com meta de carga —
  // são 156 itens e nenhuma outra meta precisa deles.
  useEffect(() => {
    if (!precisaExercicio || exercicios.length > 0) return;
    sdk.exercicios
      .listar({ limit: 100 })
      .then(setExercicios)
      .catch(() => undefined);
  }, [precisaExercicio]);

  async function criar(evento: React.FormEvent) {
    evento.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      await sdk.metas.criar(alunoId, {
        tipo,
        titulo: titulo.trim(),
        // O estado guarda TEXTO; a conversão acontece aqui, uma vez.
        alvo: mensuravel ? Number(alvo.replace(',', '.')) : undefined,
        exercicioId: precisaExercicio ? exercicioId : undefined,
        prazo: prazo || undefined,
      });
      setTitulo('');
      setAlvo('');
      setPrazo('');
      setAbrindoForm(false);
      await recarregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível criar a meta.');
    } finally {
      setSalvando(false);
    }
  }

  const alvoNumerico = Number(alvo.replace(',', '.'));
  const podeSalvar =
    titulo.trim().length >= 3 &&
    (!mensuravel || (alvo !== '' && Number.isFinite(alvoNumerico) && alvoNumerico > 0)) &&
    (!precisaExercicio || exercicioId !== '') &&
    !salvando;

  if (semAutorizacao) return null;

  const abertas = metas.filter((m) => !m.atingida);
  const cumpridas = metas.filter((m) => m.atingida);


  async function acao(meta: MetaResumo, qual: 'concluir' | 'reabrir' | 'remover') {
    try {
      if (qual === 'remover') {
        if (!confirm(`Remover a meta "${meta.titulo}"?`)) return;
        await sdk.metas.remover(alunoId, meta.id);
      } else if (qual === 'concluir') {
        await sdk.metas.concluir(alunoId, meta.id);
      } else {
        await sdk.metas.reabrir(alunoId, meta.id);
      }
      await recarregar();
    } catch {
      setErro('Não foi possível atualizar a meta.');
    }
  }

  return (
    <section className="flex flex-col gap-md">
      <div className="flex flex-wrap items-center justify-between gap-md">
        <h2 className="text-lg font-semibold">Metas</h2>
        <Botao variante={abrindoForm ? 'neutra' : 'acao'} onClick={() => setAbrindoForm((v) => !v)}>
          {abrindoForm ? 'Cancelar' : '+ Nova meta'}
        </Botao>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {abrindoForm && (
        <Cartao>
          <form onSubmit={criar} className="flex flex-col gap-lg">
            <div className="grid gap-md sm:grid-cols-2">
              <label className="flex flex-col gap-xs">
                <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Tipo
                </span>
                <select
                  className="min-h-toque rounded-md border px-md"
                  style={{
                    background: 'var(--vv-superficie)',
                    borderColor: 'var(--vv-borda)',
                    color: 'var(--vv-texto-primario)',
                  }}
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoMeta)}
                >
                  {TIPOS.map((t) => (
                    <option key={t} value={t}>
                      {ROTULO_TIPO_META[t]}
                    </option>
                  ))}
                </select>
              </label>

              <Campo
                rotulo="Título"
                required
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Chegar a 75 kg até o verão"
              />

              {mensuravel && (
                <Campo
                  rotulo={`Alvo (${UNIDADE_TIPO_META[tipo]})`}
                  inputMode="decimal"
                  required
                  value={alvo}
                  onChange={(e) => setAlvo(e.target.value)}
                />
              )}

              {precisaExercicio && (
                <label className="flex flex-col gap-xs">
                  <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                    Exercício
                  </span>
                  <select
                    className="min-h-toque rounded-md border px-md"
                    style={{
                      background: 'var(--vv-superficie)',
                      borderColor: 'var(--vv-borda)',
                      color: 'var(--vv-texto-primario)',
                    }}
                    value={exercicioId}
                    onChange={(e) => setExercicioId(e.target.value)}
                  >
                    <option value="">Escolha…</option>
                    {exercicios.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nome}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <Campo
                rotulo="Prazo (opcional)"
                type="date"
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
              />
            </div>

            {/*
              Dito antes de salvar: a régua é congelada agora, e sem medição
              anterior a barra não aparece. Descobrir isso depois é frustrante.
            */}
            {mensuravel && (
              <Aviso tipo="info">
                O valor de hoje vira o ponto de partida da meta. Se ainda não houver medição
                registrada, o progresso só começa a aparecer depois da primeira.
              </Aviso>
            )}

            <div>
              <Botao type="submit" disabled={!podeSalvar}>
                {salvando ? 'Criando…' : 'Criar meta'}
              </Botao>
            </div>
          </form>
        </Cartao>
      )}

      {metas.length === 0 && !abrindoForm && (
        <Cartao>
          <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            Nenhuma meta definida. Metas de peso, cintura, carga e frequência são acompanhadas
            sozinhas — o sistema lê as medidas e os treinos registrados.
          </p>
        </Cartao>
      )}

      {abertas.map((m) => (
        <Item key={m.id} meta={m} acao={acao} />
      ))}

      {cumpridas.length > 0 && (
        <>
          <p className="text-sm font-semibold" style={{ color: 'var(--vv-texto-secundario)' }}>
            Cumpridas
          </p>
          {cumpridas.map((m) => (
            <Item key={m.id} meta={m} acao={acao} />
          ))}
        </>
      )}
    </section>
  );
}
