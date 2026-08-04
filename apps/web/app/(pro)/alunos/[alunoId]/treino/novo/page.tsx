'use client';

import type { ExercicioResumo, GrupoMuscular } from '@vivio/contracts';
import { GRUPOS_MUSCULARES } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Anuncio } from '../../../../../../components/Anuncio';
import {
  PunhoDeArraste,
  estiloDeArraste,
  useArrasteParaReordenar,
} from '../../../../../../components/Reordenavel';
import { Aviso, Botao, Campo, Cartao } from '../../../../../../components/ui';
import { erroVisivel } from '../../../../../../lib/campos';
import { anuncioDeMovimento, reordenar } from '../../../../../../lib/reordenar';
import { sdk } from '../../../../../../lib/sdk';
import {
  corpoDoTreino,
  problemaDaCarga,
  problemaDasReps,
  problemaDasSeries,
  problemaDoDescanso,
  problemasDoTreino,
  type ItemDeTreinoDigitado,
  type SessaoDigitada,
} from '../../../../../../lib/treino';

/**
 * Os campos numéricos vivem como TEXTO no estado. Guardar `Number()` direto
 * fazia apagar o campo de séries para redigitar estacionar um `0`, que o
 * `min(1)` do schema recusa.
 */
interface ItemNaTela extends ItemDeTreinoDigitado {
  exercicio: ExercicioResumo;
}

interface SessaoNaTela extends SessaoDigitada {
  itens: ItemNaTela[];
}

const DIAS = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export default function MontarTreino() {
  const { alunoId } = useParams<{ alunoId: string }>();
  const router = useRouter();

  const [nome, setNome] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [sessoes, setSessoes] = useState<SessaoNaTela[]>([
    { nome: 'Treino A', diaSugerido: '', itens: [] },
  ]);
  const [sessaoAtiva, setSessaoAtiva] = useState(0);

  const [exercicios, setExercicios] = useState<ExercicioResumo[]>([]);
  const [busca, setBusca] = useState('');
  const [grupo, setGrupo] = useState<GrupoMuscular | ''>('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  /** Só para leitor de tela: reordenar muda a lista sem mudar o foco. */
  const [anuncio, setAnuncio] = useState('');
  const arraste = useArrasteParaReordenar(moverItem);

  useEffect(() => {
    sdk.exercicios
      .listar({ q: busca || undefined, grupoMuscular: grupo || undefined })
      .then(setExercicios)
      .catch(() => setErro('Não foi possível carregar a biblioteca de exercícios.'));
  }, [busca, grupo]);

  const totalItens = useMemo(
    () => sessoes.reduce((soma, s) => soma + s.itens.length, 0),
    [sessoes],
  );

  function alterarSessao(indice: number, mudanca: Partial<SessaoNaTela>) {
    setSessoes((atual) => atual.map((s, i) => (i === indice ? { ...s, ...mudanca } : s)));
  }

  function adicionarExercicio(exercicio: ExercicioResumo) {
    setSessoes((atual) =>
      atual.map((s, i) =>
        i === sessaoAtiva
          ? {
              ...s,
              itens: [
                ...s.itens,
                {
                  exercicioId: exercicio.id,
                  nome: exercicio.nome,
                  series: '3',
                  repsAlvo: '10-12',
                  cargaSugeridaKg: '',
                  descansoSeg: '60',
                  exercicio,
                },
              ],
            }
          : s,
      ),
    );
  }

  function alterarItem(indiceItem: number, mudanca: Partial<ItemDeTreinoDigitado>) {
    setSessoes((atual) =>
      atual.map((s, i) =>
        i === sessaoAtiva
          ? {
              ...s,
              itens: s.itens.map((it, j) => (j === indiceItem ? { ...it, ...mudanca } : it)),
            }
          : s,
      ),
    );
  }

  /**
   * Mesma função para o botão ↑ ↓ (`para = i ± 1`) e para o arrasto (`para` é
   * onde soltou). Duas implementações de "mudar de lugar" divergiriam.
   */
  function moverItem(de: number, para: number) {
    const sessao = sessoes[sessaoAtiva];
    if (!sessao) return;

    const itens = reordenar(sessao.itens, de, para);
    if (itens === sessao.itens) return; // gesto que não mudou nada

    const destino = Math.max(0, Math.min(itens.length - 1, para));
    setAnuncio(anuncioDeMovimento(sessao.itens[de]!.exercicio.nome, destino + 1, itens.length));
    setSessoes((atual) => atual.map((s, i) => (i === sessaoAtiva ? { ...s, itens } : s)));
  }

  function removerItem(indiceItem: number) {
    setSessoes((atual) =>
      atual.map((s, i) =>
        i === sessaoAtiva ? { ...s, itens: s.itens.filter((_, j) => j !== indiceItem) } : s,
      ),
    );
  }

  async function salvar(ativar: boolean) {
    if (!podeSalvar) return;
    setErro(null);
    setSalvando(true);
    try {
      await sdk.treinos.criar(alunoId, corpoDoTreino(nome, objetivo, ativar, sessoes));
      router.push(`/alunos/${alunoId}`);
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.codigo === 'CONSENTIMENTO_AUSENTE'
            ? 'O aluno não autorizou o compartilhamento dos dados de treino.'
            : e.message
          : 'Não foi possível salvar o plano.',
      );
    } finally {
      setSalvando(false);
    }
  }

  const sessao = sessoes[sessaoAtiva]!;
  const problemas = useMemo(() => problemasDoTreino(nome, sessoes), [nome, sessoes]);
  const podeSalvar = problemas.length === 0;

  return (
    <div className="flex flex-col gap-xl">
      <Link
        href={`/alunos/${alunoId}`}
        className="text-sm"
        style={{ color: 'var(--vv-texto-secundario)' }}
      >
        ← Voltar para a ficha
      </Link>

      <h1 className="text-2xl font-bold">Montar treino</h1>

      <Cartao>
        <div className="flex flex-col gap-lg sm:flex-row">
          <div className="flex-1">
            <Campo
              rotulo="Nome do plano"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Hipertrofia — 3x por semana"
            />
          </div>
          <div className="flex-1">
            <Campo
              rotulo="Objetivo (opcional)"
              value={objetivo}
              onChange={(e) => setObjetivo(e.target.value)}
              placeholder="Ganho de massa muscular"
            />
          </div>
        </div>
      </Cartao>

      {/* Abas de sessão */}
      <div className="flex flex-wrap items-center gap-md">
        {sessoes.map((s, i) => (
          <button
            key={i}
            onClick={() => setSessaoAtiva(i)}
            className="min-h-toque rounded-md px-lg font-semibold"
            style={{
              background: i === sessaoAtiva ? 'var(--vv-primaria-fundo)' : 'transparent',
              color: i === sessaoAtiva ? 'var(--vv-primaria-texto)' : 'var(--vv-texto-primario)',
              border: '1px solid var(--vv-borda)',
            }}
          >
            {s.nome} ({s.itens.length})
          </button>
        ))}
        <Botao
          variante="neutra"
          onClick={() =>
            setSessoes((atual) => {
              const proxima = String.fromCharCode(65 + atual.length);
              setSessaoAtiva(atual.length);
              return [...atual, { nome: `Treino ${proxima}`, diaSugerido: '', itens: [] }];
            })
          }
        >
          + Sessão
        </Botao>
      </div>

      <div className="grid gap-xl lg:grid-cols-[1fr_340px]">
        {/* Itens da sessão ativa */}
        <section className="flex flex-col gap-md">
          <div className="flex flex-wrap items-end gap-md">
            <div className="flex-1">
              <Campo
                rotulo="Nome da sessão"
                value={sessao.nome}
                onChange={(e) => alterarSessao(sessaoAtiva, { nome: e.target.value })}
              />
            </div>
            <label className="flex flex-col gap-xs">
              <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                Dia sugerido
              </span>
              <select
                className="min-h-toque rounded-md border px-md"
                style={{
                  background: 'var(--vv-superficie)',
                  borderColor: 'var(--vv-borda)',
                  color: 'var(--vv-texto-primario)',
                }}
                value={sessao.diaSugerido}
                onChange={(e) => alterarSessao(sessaoAtiva, { diaSugerido: e.target.value })}
              >
                <option value="">—</option>
                {DIAS.slice(1).map((dia, i) => (
                  <option key={dia} value={i + 1}>
                    {dia}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {sessao.itens.length === 0 && (
            <Aviso tipo="info">Nenhum exercício nesta sessão. Escolha na biblioteca ao lado.</Aviso>
          )}

          {sessao.itens.map((item, i) => (
            <div
              key={`${item.exercicioId}-${i}`}
              data-testid={`item-${i}`}
              {...arraste.propsDoItem(i)}
              style={estiloDeArraste(i, arraste.arrastando, arraste.alvo)}
            >
              <Cartao>
                <div className="mb-md flex items-start justify-between gap-md">
                  <div className="flex items-start gap-sm">
                    <PunhoDeArraste
                      titulo={`Arraste para reordenar ${item.exercicio.nome}`}
                      {...arraste.propsDoPunho(i)}
                    />
                    <div>
                      <p className="font-semibold">{item.exercicio.nome}</p>
                      <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                        {item.exercicio.grupoMuscular}
                        {item.exercicio.equipamento && ` · ${item.exercicio.equipamento}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-xs">
                    <button
                      onClick={() => moverItem(i, i - 1)}
                      disabled={i === 0}
                      aria-label={`Mover ${item.exercicio.nome} para cima`}
                      className="min-h-toque min-w-toque rounded-md border disabled:opacity-30"
                      style={{ borderColor: 'var(--vv-borda)' }}
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moverItem(i, i + 1)}
                      disabled={i === sessao.itens.length - 1}
                      aria-label={`Mover ${item.exercicio.nome} para baixo`}
                      className="min-h-toque min-w-toque rounded-md border disabled:opacity-30"
                      style={{ borderColor: 'var(--vv-borda)' }}
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => removerItem(i)}
                      aria-label={`Remover ${item.exercicio.nome}`}
                      className="min-h-toque min-w-toque rounded-md border"
                      style={{
                        borderColor: 'var(--vv-erro)',
                        color: 'var(--vv-erro)',
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-md sm:grid-cols-4">
                  <Campo
                    rotulo="Séries"
                    inputMode="numeric"
                    value={item.series}
                    erro={erroVisivel(item.series, problemaDasSeries(item.series))}
                    onChange={(e) => alterarItem(i, { series: e.target.value })}
                  />
                  <Campo
                    rotulo="Repetições"
                    value={item.repsAlvo}
                    erro={erroVisivel(item.repsAlvo, problemaDasReps(item.repsAlvo))}
                    onChange={(e) => alterarItem(i, { repsAlvo: e.target.value })}
                  />
                  <Campo
                    rotulo="Carga (kg)"
                    inputMode="decimal"
                    value={item.cargaSugeridaKg}
                    erro={erroVisivel(item.cargaSugeridaKg, problemaDaCarga(item.cargaSugeridaKg))}
                    onChange={(e) => alterarItem(i, { cargaSugeridaKg: e.target.value })}
                  />
                  <Campo
                    rotulo="Descanso (s)"
                    inputMode="numeric"
                    value={item.descansoSeg}
                    erro={erroVisivel(item.descansoSeg, problemaDoDescanso(item.descansoSeg))}
                    onChange={(e) => alterarItem(i, { descansoSeg: e.target.value })}
                  />
                </div>
              </Cartao>
            </div>
          ))}

          <Anuncio texto={anuncio} />
        </section>

        {/* Biblioteca */}
        <aside className="flex flex-col gap-md">
          <h2 className="text-lg font-semibold">Biblioteca</h2>
          <Campo
            rotulo="Buscar"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="supino, agachamento…"
          />
          <label className="flex flex-col gap-xs">
            <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              Grupo muscular
            </span>
            <select
              className="min-h-toque rounded-md border px-md"
              style={{
                background: 'var(--vv-superficie)',
                borderColor: 'var(--vv-borda)',
                color: 'var(--vv-texto-primario)',
              }}
              value={grupo}
              onChange={(e) => setGrupo(e.target.value as GrupoMuscular | '')}
            >
              <option value="">Todos</option>
              {GRUPOS_MUSCULARES.map((g) => (
                <option key={g} value={g}>
                  {g.replace('_', ' ')}
                </option>
              ))}
            </select>
          </label>

          <div className="flex max-h-[60vh] flex-col gap-xs overflow-y-auto">
            {exercicios.map((e) => (
              <button
                key={e.id}
                onClick={() => adicionarExercicio(e)}
                // Sem o aria-label o leitor de tela anuncia o botão sem nome:
                // o texto interno está em spans de bloco e não compõe o nome acessível.
                aria-label={`Adicionar ${e.nome} à sessão`}
                className="min-h-toque rounded-md border p-md text-left"
                style={{
                  borderColor: 'var(--vv-borda)',
                  background: 'var(--vv-superficie)',
                }}
              >
                <span className="block font-semibold">{e.nome}</span>
                <span className="block text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                  {e.grupoMuscular}
                  {e.equipamento && ` · ${e.equipamento}`}
                  {e.escopo === 'PRIVADO' && ' · meu'}
                </span>
              </button>
            ))}
          </div>
        </aside>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div
        className="sticky bottom-0 flex flex-col gap-sm border-t py-lg"
        style={{
          background: 'var(--vv-fundo)',
          borderColor: 'var(--vv-borda)',
        }}
      >
        {/* O que falta, dito antes de tentar. */}
        {problemas.length > 0 && (
          <ul className="flex flex-col gap-xs text-sm" style={{ color: 'var(--vv-alerta)' }}>
            {problemas.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-between gap-md">
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          {sessoes.length} {sessoes.length === 1 ? 'sessão' : 'sessões'} · {totalItens}{' '}
          {totalItens === 1 ? 'exercício' : 'exercícios'}
        </p>
        <div className="flex gap-md">
          <Botao
            variante="neutra"
            disabled={!podeSalvar || salvando}
            onClick={() => void salvar(false)}
          >
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
