'use client';

import {
  descreverResposta,
  type AnamneseResumo,
  type ModeloAnamneseResumo,
  type PerguntaResumo,
} from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Aviso, Botao, Cartao } from '../../../../../components/ui';
import { sdk } from '../../../../../lib/sdk';

const entrada = {
  background: 'var(--vv-superficie)',
  borderColor: 'var(--vv-borda)',
  color: 'var(--vv-texto-primario)',
};

/** Resposta em edição, por id de pergunta. */
type Respostas = Record<string, { valor?: string; valores: string[] }>;

interface Resposta {
  valor?: string;
  valores: string[];
}

/**
 * Precisa viver fora do componente da página.
 *
 * Definido lá dentro, cada tecla criava uma função nova, o React remontava
 * todos os campos e o cursor saltava para fora do que estava sendo digitado.
 */
function CampoDaPergunta({
  pergunta,
  resposta,
  aoResponder,
}: {
  pergunta: PerguntaResumo;
  resposta: Resposta;
  aoResponder: (mudanca: Partial<Resposta>) => void;
}) {
  const estiloEscolha = (ativo: boolean) => ({
    background: ativo ? 'var(--vv-acao-fundo)' : 'var(--vv-superficie)',
    color: ativo ? 'var(--vv-acao-texto)' : 'var(--vv-texto-primario)',
    borderColor: ativo ? 'var(--vv-acao-fundo)' : 'var(--vv-borda)',
  });

  if (pergunta.tipo === 'TEXTO_LONGO') {
    return (
      <textarea
        className="min-h-[70px] w-full rounded-md border p-md"
        style={entrada}
        value={resposta.valor ?? ''}
        onChange={(e) => aoResponder({ valor: e.target.value })}
      />
    );
  }

  if (pergunta.tipo === 'SIM_NAO') {
    return (
      <div className="flex gap-sm">
        {[
          { valor: 'sim', rotulo: 'Sim' },
          { valor: 'nao', rotulo: 'Não' },
        ].map((o) => (
          <button
            key={o.valor}
            type="button"
            onClick={() => aoResponder({ valor: resposta.valor === o.valor ? '' : o.valor })}
            aria-pressed={resposta.valor === o.valor}
            className="min-h-toque rounded-md border px-xl font-semibold"
            style={estiloEscolha(resposta.valor === o.valor)}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
    );
  }

  if (pergunta.tipo === 'ESCOLHA_UNICA') {
    return (
      <div className="flex flex-wrap gap-sm">
        {pergunta.opcoes.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => aoResponder({ valor: resposta.valor === o ? '' : o })}
            aria-pressed={resposta.valor === o}
            className="min-h-toque rounded-md border px-lg"
            style={estiloEscolha(resposta.valor === o)}
          >
            {o}
          </button>
        ))}
      </div>
    );
  }

  if (pergunta.tipo === 'ESCOLHA_MULTIPLA') {
    return (
      <div className="flex flex-wrap gap-sm">
        {pergunta.opcoes.map((o) => {
          const marcada = resposta.valores.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() =>
                aoResponder({
                  valores: marcada
                    ? resposta.valores.filter((v) => v !== o)
                    : [...resposta.valores, o],
                })
              }
              aria-pressed={marcada}
              className="min-h-toque rounded-md border px-lg"
              style={estiloEscolha(marcada)}
            >
              {marcada ? '✓ ' : ''}
              {o}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <input
      type={pergunta.tipo === 'NUMERO' ? 'number' : pergunta.tipo === 'DATA' ? 'date' : 'text'}
      inputMode={pergunta.tipo === 'NUMERO' ? 'decimal' : undefined}
      className="min-h-toque w-full rounded-md border px-md"
      style={entrada}
      value={resposta.valor ?? ''}
      onChange={(e) => aoResponder({ valor: e.target.value })}
    />
  );
}

export default function AnamneseDoAluno() {
  const { alunoId } = useParams<{ alunoId: string }>();
  const [anamneses, setAnamneses] = useState<AnamneseResumo[]>([]);
  const [modelos, setModelos] = useState<ModeloAnamneseResumo[]>([]);
  const [semConsentimento, setSemConsentimento] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [aplicando, setAplicando] = useState<ModeloAnamneseResumo | null>(null);
  const [respostas, setRespostas] = useState<Respostas>({});
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    try {
      setAnamneses(await sdk.anamneses.listar(alunoId));
      setSemConsentimento(false);
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === 'CONSENTIMENTO_AUSENTE') setSemConsentimento(true);
      else setErro('Não foi possível carregar as anamneses.');
    }
  };

  useEffect(() => {
    void carregar();
    sdk.modelosAnamnese
      .listar()
      .then(setModelos)
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alunoId]);

  function abrir(modelo: ModeloAnamneseResumo) {
    setAplicando(modelo);
    setErro(null);
    setObservacao('');
    setRespostas(
      Object.fromEntries(modelo.perguntas.map((p) => [p.id, { valor: '', valores: [] }])),
    );
  }

  const responder = (perguntaId: string, mudanca: Partial<Respostas[string]>) =>
    setRespostas((atual) => ({
      ...atual,
      [perguntaId]: { ...atual[perguntaId]!, ...mudanca },
    }));


  const faltando = (aplicando?.perguntas ?? []).filter((p) => {
    if (!p.obrigatoria) return false;
    const r = respostas[p.id];
    return p.tipo === 'ESCOLHA_MULTIPLA' ? !r?.valores.length : !r?.valor?.trim();
  });

  async function salvar() {
    if (!aplicando) return;
    setErro(null);
    setSalvando(true);
    try {
      await sdk.anamneses.aplicar(alunoId, {
        modeloId: aplicando.id,
        respondidaEm: new Date(),
        observacao: observacao.trim() || undefined,
        respostas: aplicando.perguntas.map((p) => ({
          perguntaId: p.id,
          valor: respostas[p.id]?.valor?.trim() || undefined,
          valores: respostas[p.id]?.valores ?? [],
        })),
      });
      setAplicando(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a anamnese.');
    } finally {
      setSalvando(false);
    }
  }

  if (semConsentimento) {
    return (
      <div className="flex flex-col gap-lg">
        <Link
          href={`/alunos/${alunoId}`}
          className="text-sm"
          style={{ color: 'var(--vv-texto-secundario)' }}
        >
          ← Voltar à ficha
        </Link>
        <Cartao>
          <p className="mb-xs font-semibold">Dados clínicos não compartilhados</p>
          <Aviso tipo="info">
            A anamnese reúne histórico de saúde, medicação e cirurgias. O paciente ainda não
            autorizou o compartilhamento desses dados — a autorização é dada por ele, no aplicativo.
          </Aviso>
        </Cartao>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-xl">
      <Link
        href={`/alunos/${alunoId}`}
        className="text-sm"
        style={{ color: 'var(--vv-texto-secundario)' }}
      >
        ← Voltar à ficha
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="text-2xl font-bold">Anamnese</h1>
          <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            Cada aplicação fica no histórico — dá para comparar o que mudou entre consultas.
          </p>
        </div>
        {aplicando && (
          <Botao variante="neutra" onClick={() => setAplicando(null)}>
            Cancelar
          </Botao>
        )}
      </div>

      {!aplicando && (
        <Cartao>
          <p className="mb-md font-semibold">Aplicar um questionário</p>
          {modelos.length === 0 ? (
            <Aviso tipo="info">
              Você ainda não tem modelos.{' '}
              <Link href="/cadastros/anamnese" className="underline">
                Montar o primeiro
              </Link>
              .
            </Aviso>
          ) : (
            <div className="flex flex-wrap gap-sm">
              {modelos.map((m) => (
                <Botao key={m.id} variante="neutra" onClick={() => abrir(m)}>
                  {m.nome}
                  <span className="ml-sm text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                    {m.totalPerguntas}
                  </span>
                </Botao>
              ))}
            </div>
          )}
        </Cartao>
      )}

      {aplicando && (
        <div className="flex flex-col gap-md">
          <h2 className="text-lg font-semibold">{aplicando.nome}</h2>

          {aplicando.perguntas.map((p, i) => (
            <Cartao key={p.id}>
              <p className="font-medium">
                {i + 1}. {p.texto}
                {p.obrigatoria && (
                  <span style={{ color: 'var(--vv-erro)' }} aria-label="obrigatória">
                    {' '}
                    *
                  </span>
                )}
              </p>
              {p.ajuda && (
                <p className="mb-sm text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  {p.ajuda}
                </p>
              )}
              <div className="mt-sm">
                <CampoDaPergunta
                  pergunta={p}
                  resposta={respostas[p.id] ?? { valor: '', valores: [] }}
                  aoResponder={(mudanca) => responder(p.id, mudanca)}
                />
              </div>
            </Cartao>
          ))}

          <Cartao>
            <label className="flex flex-col gap-xs">
              <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                Observação do atendimento (opcional)
              </span>
              <textarea
                className="min-h-[70px] rounded-md border p-md"
                style={entrada}
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="O que chamou atenção na conversa e não cabia numa pergunta."
              />
            </label>
          </Cartao>

          {faltando.length > 0 && (
            <Aviso tipo="info">
              Falta responder: {faltando.map((p) => p.texto).join('; ')}
            </Aviso>
          )}
          {erro && <Aviso tipo="erro">{erro}</Aviso>}

          <div className="flex justify-end">
            <Botao onClick={salvar} disabled={faltando.length > 0 || salvando}>
              {salvando ? 'Salvando…' : 'Salvar anamnese'}
            </Botao>
          </div>
        </div>
      )}

      {!aplicando && erro && <Aviso tipo="erro">{erro}</Aviso>}

      {!aplicando && (
        <div className="flex flex-col gap-md">
          {anamneses.map((a) => (
            <Cartao key={a.id}>
              <div className="flex flex-wrap items-start justify-between gap-md">
                <div>
                  <h2 className="font-semibold">{a.nome}</h2>
                  <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                    {new Date(a.respondidaEm).toLocaleDateString('pt-BR')} · {a.profissional.nome}
                  </p>
                </div>
              </div>

              <dl className="mt-md flex flex-col gap-sm">
                {a.respostas.map((r) => (
                  <div key={r.id} style={{ borderTop: '1px solid var(--vv-borda)' }} className="pt-sm">
                    <dt className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                      {r.pergunta}
                    </dt>
                    <dd className="font-medium">{descreverResposta(r)}</dd>
                  </div>
                ))}
              </dl>

              {a.observacao && (
                <p
                  className="mt-md text-sm"
                  style={{ color: 'var(--vv-texto-secundario)' }}
                >
                  <strong>Observação:</strong> {a.observacao}
                </p>
              )}
            </Cartao>
          ))}

          {anamneses.length === 0 && (
            <p style={{ color: 'var(--vv-texto-secundario)' }}>
              Nenhuma anamnese aplicada ainda.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
