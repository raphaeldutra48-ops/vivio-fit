'use client';

import {
  DIAS_PADRAO_FEEDBACK,
  ROTULO_DIFICULDADE,
  motivosDoFeedback,
  type FeedbackDoAluno,
  type MotivoDoFeedback,
  type PainelDeFeedback,
} from '@vivio/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Aviso, Botao, Cartao } from '../../../components/ui';
import { sdk } from '../../../lib/sdk';

const JANELAS = [7, DIAS_PADRAO_FEEDBACK, 30] as const;

const ETIQUETA: Record<MotivoDoFeedback, { texto: string; cor: string }> = {
  DOR: { texto: 'Dor', cor: 'var(--vv-erro)' },
  MUITO_DIFICIL: { texto: 'Muito difícil', cor: 'var(--vv-alerta)' },
  MUITO_FACIL: { texto: 'Leve demais', cor: 'var(--vv-alerta)' },
  COMENTARIO: { texto: 'Comentou', cor: 'var(--vv-info)' },
};

/** "hoje", "ontem", "há 4 dias" — o profissional pensa em distância, não em data. */
function quando(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  return `há ${dias} dias`;
}

function Etiqueta({ motivo }: { motivo: MotivoDoFeedback }) {
  const { texto, cor } = ETIQUETA[motivo];
  return (
    <span
      className="rounded-pill px-sm py-xs text-xs font-semibold"
      style={{ border: `1px solid ${cor}`, color: cor }}
    >
      {texto}
    </span>
  );
}

function Linha({ f }: { f: FeedbackDoAluno }) {
  const motivos = motivosDoFeedback(f);

  return (
    <Cartao>
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div className="min-w-0">
          <p className="font-semibold">{f.aluno.nome}</p>
          <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
            {f.sessaoNome} · {quando(f.treinoEm)}
          </p>
        </div>
        <div className="flex flex-wrap gap-xs">
          {motivos.map((m) => (
            <Etiqueta key={m} motivo={m} />
          ))}
        </div>
      </div>

      <p className="mt-md text-sm">
        <span style={{ color: 'var(--vv-texto-secundario)' }}>Achou o treino: </span>
        <strong>{ROTULO_DIFICULDADE[f.dificuldade] ?? f.dificuldade}</strong>
      </p>

      {f.teveDor && (
        <p className="mt-xs text-sm" style={{ color: 'var(--vv-erro)' }}>
          Sentiu dor{f.localDor ? ` — ${f.localDor}` : ''}
          {/*
            O número é o que separa "torceu o pé no fim de semana" de "tem
            alguma coisa errada na prescrição". Aparece só a partir do segundo,
            porque dor isolada acontece com todo mundo.
          */}
          {f.sequenciaDeDor !== null && f.sequenciaDeDor > 1 && (
            <strong> · {f.sequenciaDeDor}º treino seguido com dor</strong>
          )}
        </p>
      )}

      {f.sensacao && (
        <p className="mt-xs text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          Sensação: {f.sensacao}
        </p>
      )}

      {f.comentario && (
        <blockquote
          className="mt-md border-l-2 pl-md text-sm italic"
          style={{ borderColor: 'var(--vv-borda)' }}
        >
          “{f.comentario}”
        </blockquote>
      )}

      <div className="mt-md flex flex-wrap gap-md">
        {/* A ação que fecha o ciclo: quem leu responde. */}
        <Link href={`/chat?com=${f.aluno.id}`}>
          <Botao variante="neutra">Responder no chat</Botao>
        </Link>
        <Link href={`/alunos/${f.aluno.id}`}>
          <Botao variante="neutra">Abrir ficha</Botao>
        </Link>
      </div>
    </Cartao>
  );
}

/**
 * Feedback pós-treino da carteira.
 *
 * A lista **não é cronológica**: vem ordenada por urgência, com dor primeiro.
 * Ordenar por data enterraria a dor de seis dias atrás embaixo dos "foi
 * tranquilo" de hoje — e é justamente a dor que muda a conduta.
 *
 * Não existe "marcar como lido" de propósito. Isso criaria uma caixa de
 * entrada para o profissional zerar, e caixa de entrada se zera por cansaço.
 * O que fecha o ciclo aqui é responder ao aluno.
 */
export default function FeedbackPage() {
  const [dias, setDias] = useState<number>(DIAS_PADRAO_FEEDBACK);
  const [apenasAtencao, setApenasAtencao] = useState(false);
  const [painel, setPainel] = useState<PainelDeFeedback | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    sdk.feedback
      .daCarteira(dias, apenasAtencao)
      .then((p) => {
        if (!ativo) return;
        setPainel(p);
        setErro(null);
      })
      .catch(() => {
        if (ativo) setErro('Não foi possível carregar o feedback.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [dias, apenasAtencao]);

  return (
    <div className="flex flex-col gap-lg">
      <header>
        <h1 className="text-2xl font-bold">Feedback dos alunos</h1>
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          O que eles responderam ao fechar o treino. Ordenado pelo que pede sua atenção primeiro —
          não pela data.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-md">
        <div className="flex gap-xs">
          {JANELAS.map((j) => (
            <button
              key={j}
              onClick={() => setDias(j)}
              className="min-h-toque rounded-md px-md text-sm font-semibold"
              style={{
                background: dias === j ? 'var(--vv-primaria-fundo)' : 'transparent',
                color: dias === j ? 'var(--vv-primaria-texto)' : 'var(--vv-texto-secundario)',
                border: '1px solid var(--vv-borda)',
              }}
            >
              {j} dias
            </button>
          ))}
        </div>

        <label className="flex min-h-toque items-center gap-sm text-sm">
          <input
            type="checkbox"
            checked={apenasAtencao}
            onChange={(e) => setApenasAtencao(e.target.checked)}
          />
          Só o que pede atenção
        </label>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {carregando && !painel && <Cartao>Carregando feedback…</Cartao>}

      {painel && (
        <>
          <Cartao>
            <div className="grid grid-cols-2 gap-lg">
              <div>
                <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Treinos com feedback
                </p>
                <p className="text-xl font-bold tabular-nums">{painel.total}</p>
              </div>
              <div>
                <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Pedem sua atenção
                </p>
                <p
                  className="text-xl font-bold tabular-nums"
                  style={painel.precisamDeOlhar > 0 ? { color: 'var(--vv-alerta)' } : undefined}
                >
                  {painel.precisamDeOlhar}
                </p>
              </div>
            </div>
          </Cartao>

          {painel.linhas.length === 0 ? (
            <Cartao>
              {painel.total === 0 ? (
                /*
                  Lista vazia aqui costuma ser ausência de resposta, não ausência
                  de problema — e a diferença muda o que o profissional faz a
                  seguir.
                */
                <Aviso tipo="info">
                  Nenhum aluno respondeu o feedback nos últimos {painel.dias} dias. Isso não quer
                  dizer que está tudo bem: o feedback é opcional no fim do treino, e muita gente
                  passa direto sem saber que ele chega até você.
                </Aviso>
              ) : (
                <p className="text-sm">
                  Nenhum feedback pede atenção neste período — os {painel.total} treinos vieram na
                  medida e sem dor.
                </p>
              )}
            </Cartao>
          ) : (
            <div className="flex flex-col gap-md">
              {painel.linhas.map((f) => (
                <Linha key={f.execucaoId} f={f} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
