'use client';

import {
  PERGUNTAS_SUGERIDAS,
  ROTULO_TIPO_PERGUNTA,
  TIPOS_COM_OPCOES,
  type ModeloAnamneseResumo,
  type PerguntaInput,
  type TipoPergunta,
} from '@vivio/contracts';
import { useEffect, useState } from 'react';
import { Anuncio } from '../../../../components/Anuncio';
import {
  PunhoDeArraste,
  estiloDeArraste,
  useArrasteParaReordenar,
} from '../../../../components/Reordenavel';
import { Aviso, Botao, Campo, Cartao } from '../../../../components/ui';
import { corpoDoModelo, podeSalvarModelo, problemasDasPerguntas } from '../../../../lib/anamnese';
import { anuncioDeMovimento, reordenar } from '../../../../lib/reordenar';
import { sdk } from '../../../../lib/sdk';

const entrada = {
  background: 'var(--vv-superficie)',
  borderColor: 'var(--vv-borda)',
  color: 'var(--vv-texto-primario)',
};

const perguntaVazia = (): PerguntaInput => ({
  texto: '',
  tipo: 'TEXTO_LONGO',
  opcoes: [],
  obrigatoria: false,
});

export default function ModelosDeAnamnese() {
  const [modelos, setModelos] = useState<ModeloAnamneseResumo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  /** null = nenhum editor aberto; '' = criando; id = editando. */
  const [editando, setEditando] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [perguntas, setPerguntas] = useState<PerguntaInput[]>([]);
  /** Só para leitor de tela: reordenar muda a lista sem mudar o foco. */
  const [anuncio, setAnuncio] = useState('');
  const arraste = useArrasteParaReordenar(mover);

  const carregar = () =>
    sdk.modelosAnamnese
      .listar()
      .then(setModelos)
      .catch(() => setErro('Não foi possível carregar os modelos.'));

  useEffect(() => {
    void carregar();
  }, []);

  function abrirNovo(comSugestoes: boolean) {
    setEditando('');
    setErro(null);
    setNome('');
    setDescricao('');
    setPerguntas(comSugestoes ? PERGUNTAS_SUGERIDAS.map((p) => ({ ...p })) : [perguntaVazia()]);
  }

  function abrirEdicao(m: ModeloAnamneseResumo) {
    setEditando(m.id);
    setErro(null);
    setNome(m.nome);
    setDescricao(m.descricao ?? '');
    setPerguntas(
      m.perguntas.map((p) => ({
        texto: p.texto,
        tipo: p.tipo,
        opcoes: p.opcoes,
        obrigatoria: p.obrigatoria,
        ajuda: p.ajuda ?? undefined,
      })),
    );
  }

  function alterar(indice: number, mudanca: Partial<PerguntaInput>) {
    setPerguntas((atual) => atual.map((p, i) => (i === indice ? { ...p, ...mudanca } : p)));
  }

  /**
   * Ordem importa numa anamnese: a sequência das perguntas é pensada.
   *
   * Mesma função para o botão ↑ ↓ (`para = indice ± 1`) e para o arrasto
   * (`para` é onde soltou) — duas implementações divergiriam.
   */
  function mover(de: number, para: number) {
    const proximas = reordenar(perguntas, de, para);
    if (proximas === perguntas) return;

    const destino = Math.max(0, Math.min(proximas.length - 1, para));
    const alvo = perguntas[de]!.texto.trim() || `Pergunta ${de + 1}`;
    setAnuncio(anuncioDeMovimento(alvo, destino + 1, proximas.length));
    setPerguntas(proximas);
  }

  const problemas = problemasDasPerguntas(perguntas);
  const podeSalvar = podeSalvarModelo(nome, perguntas);

  async function salvar() {
    setErro(null);
    setSalvando(true);
    const corpo = corpoDoModelo(nome, descricao, perguntas);
    try {
      if (editando) await sdk.modelosAnamnese.atualizar(editando, corpo);
      else await sdk.modelosAnamnese.criar(corpo);
      setEditando(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function remover(m: ModeloAnamneseResumo) {
    if (!confirm(`Remover o modelo "${m.nome}"?\n\nAnamneses já aplicadas continuam no histórico.`))
      return;
    await sdk.modelosAnamnese.remover(m.id).catch(() => undefined);
    await carregar();
  }

  return (
    <div className="flex flex-col gap-xl">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="text-2xl font-bold">Modelos de anamnese</h1>
          <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            Monte o questionário uma vez e aplique na ficha de cada paciente.
          </p>
        </div>
        {editando === null ? (
          <div className="flex flex-wrap gap-sm">
            <Botao variante="neutra" onClick={() => abrirNovo(false)}>
              Começar do zero
            </Botao>
            <Botao onClick={() => abrirNovo(true)}>+ Usar perguntas sugeridas</Botao>
          </div>
        ) : (
          <Botao variante="neutra" onClick={() => setEditando(null)}>
            Cancelar
          </Botao>
        )}
      </div>

      {editando !== null && (
        <div className="flex flex-col gap-md">
          <Cartao>
            <div className="grid gap-md">
              <Campo
                rotulo="Nome do modelo"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Anamnese nutricional — primeira consulta"
                autoFocus
              />
              <Campo
                rotulo="Descrição (opcional)"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </div>
          </Cartao>

          {perguntas.map((p, indice) => (
            <div
              key={indice}
              data-testid={`pergunta-${indice}`}
              {...arraste.propsDoItem(indice)}
              style={estiloDeArraste(indice, arraste.arrastando, arraste.alvo)}
            >
              <Cartao>
                <div className="flex items-start justify-between gap-sm">
                  <span
                    className="flex items-center gap-sm text-sm font-semibold"
                    style={{ color: 'var(--vv-texto-secundario)' }}
                  >
                    <PunhoDeArraste
                      titulo={`Arraste para reordenar a pergunta ${indice + 1}`}
                      {...arraste.propsDoPunho(indice)}
                    />
                    Pergunta {indice + 1}
                  </span>
                  <div className="flex gap-xs">
                    <button
                      onClick={() => mover(indice, indice - 1)}
                      disabled={indice === 0}
                      aria-label={`Mover pergunta ${indice + 1} para cima`}
                      className="min-h-toque min-w-toque rounded-md border disabled:opacity-30"
                      style={{ borderColor: 'var(--vv-borda)' }}
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => mover(indice, indice + 1)}
                      disabled={indice === perguntas.length - 1}
                      aria-label={`Mover pergunta ${indice + 1} para baixo`}
                      className="min-h-toque min-w-toque rounded-md border disabled:opacity-30"
                      style={{ borderColor: 'var(--vv-borda)' }}
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => setPerguntas((a) => a.filter((_, i) => i !== indice))}
                      aria-label={`Remover pergunta ${indice + 1}`}
                      className="min-h-toque px-md text-sm underline"
                      style={{ color: 'var(--vv-texto-secundario)' }}
                    >
                      Remover
                    </button>
                  </div>
                </div>

                <div className="mt-md grid gap-md">
                  <label className="flex flex-col gap-xs">
                    <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                      Pergunta
                    </span>
                    <textarea
                      className="min-h-[54px] rounded-md border p-md"
                      style={entrada}
                      value={p.texto}
                      onChange={(e) => alterar(indice, { texto: e.target.value })}
                    />
                  </label>

                  <div className="grid gap-md sm:grid-cols-[200px_1fr_auto]">
                    <label className="flex flex-col gap-xs">
                      <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                        Tipo de resposta
                      </span>
                      <select
                        className="min-h-toque rounded-md border px-md"
                        style={entrada}
                        value={p.tipo}
                        onChange={(e) =>
                          alterar(indice, { tipo: e.target.value as TipoPergunta, opcoes: [] })
                        }
                      >
                        {Object.entries(ROTULO_TIPO_PERGUNTA).map(([valor, rotulo]) => (
                          <option key={valor} value={valor}>
                            {rotulo}
                          </option>
                        ))}
                      </select>
                    </label>

                    <Campo
                      rotulo="Texto de apoio (opcional)"
                      value={p.ajuda ?? ''}
                      onChange={(e) => alterar(indice, { ajuda: e.target.value })}
                      placeholder="Inclua também suplementos"
                    />

                    <label className="flex items-end gap-sm pb-sm">
                      <input
                        type="checkbox"
                        className="size-5"
                        checked={p.obrigatoria}
                        onChange={(e) => alterar(indice, { obrigatoria: e.target.checked })}
                      />
                      <span className="text-sm">Obrigatória</span>
                    </label>
                  </div>

                  {TIPOS_COM_OPCOES.includes(p.tipo) && (
                    <label className="flex flex-col gap-xs">
                      <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                        Opções — uma por linha
                      </span>
                      <textarea
                        className="min-h-[80px] rounded-md border p-md"
                        style={entrada}
                        value={p.opcoes.join('\n')}
                        onChange={(e) =>
                          alterar(indice, {
                            opcoes: e.target.value.split('\n').map((o) => o.trimStart()),
                          })
                        }
                        placeholder={'Não\nSocialmente\nSemanalmente'}
                      />
                    </label>
                  )}
                </div>
              </Cartao>
            </div>
          ))}

          <Anuncio texto={anuncio} />

          <Botao variante="neutra" onClick={() => setPerguntas((a) => [...a, perguntaVazia()])}>
            + Adicionar pergunta
          </Botao>

          {problemas.length > 0 && <Aviso tipo="erro">{problemas.join(' · ')}</Aviso>}
          {erro && <Aviso tipo="erro">{erro}</Aviso>}

          <div className="flex justify-end">
            <Botao onClick={salvar} disabled={!podeSalvar || salvando}>
              {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Criar modelo'}
            </Botao>
          </div>

          {editando && (
            <Aviso tipo="info">
              Alterar as perguntas não muda anamneses já respondidas — elas guardam o texto da
              pergunta como estava no dia.
            </Aviso>
          )}
        </div>
      )}

      {editando === null && erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className="grid gap-md lg:grid-cols-2">
        {modelos.map((m) => (
          <Cartao key={m.id}>
            <h2 className="font-semibold">{m.nome}</h2>
            <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              {m.totalPerguntas} {m.totalPerguntas === 1 ? 'pergunta' : 'perguntas'}
              {m.descricao && ` · ${m.descricao}`}
            </p>

            <ul className="mt-md flex flex-col gap-xs">
              {m.perguntas.slice(0, 4).map((p) => (
                <li key={p.id} className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  • {p.texto} {p.obrigatoria && <span aria-label="obrigatória">*</span>}
                </li>
              ))}
              {m.perguntas.length > 4 && (
                <li className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  … e mais {m.perguntas.length - 4}
                </li>
              )}
            </ul>

            <div className="mt-md flex justify-end gap-sm">
              <button
                onClick={() => remover(m)}
                className="text-sm underline"
                style={{ color: 'var(--vv-texto-secundario)' }}
              >
                Remover
              </button>
              <Botao variante="neutra" onClick={() => abrirEdicao(m)}>
                Editar
              </Botao>
            </div>
          </Cartao>
        ))}
      </div>

      {modelos.length === 0 && editando === null && (
        <p style={{ color: 'var(--vv-texto-secundario)' }}>
          Nenhum modelo ainda. As perguntas sugeridas cobrem o básico de quase toda anamnese — é um
          bom ponto de partida para editar.
        </p>
      )}
    </div>
  );
}
