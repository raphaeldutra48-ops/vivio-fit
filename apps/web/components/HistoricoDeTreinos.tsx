'use client';

import type { PlanoTreinoCompleto, PlanoTreinoResumo } from '@vivio/contracts';
import { areaTemaClaro } from '@vivio/ui';
import Link from 'next/link';
import { useState } from 'react';
import { sdk } from '../lib/sdk';
import { Aviso, Botao, Cartao, Etiqueta } from './ui';

/**
 * O histórico de planos de treino do aluno.
 *
 * Antes isto era uma lista de cartões inertes: nome, versão, etiqueta, e nada
 * mais. Quem montava um plano via o item aparecer e não conseguia abrir para
 * conferir o que tinha prescrito, nem ativar o rascunho que acabara de salvar.
 * A lista existia sem servir para nada — e um plano salvo que ninguém consegue
 * abrir dá a impressão de que não foi salvo.
 *
 * O ajuste de plano cria versão nova e arquiva a anterior de propósito: daqui a
 * três meses, ao ver que o aluno fez supino com 60 kg, é preciso saber qual
 * plano prescrevia o quê naquele dia. Por isso a lista cresce em vez de mudar,
 * e por isso ela precisa ser legível como histórico.
 */

const ROTULO_STATUS = {
  ATIVO: 'Ativo',
  RASCUNHO: 'Rascunho',
  ARQUIVADO: 'Arquivado',
} as const;

function porExtenso(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** A linha de datas muda com o estado: rascunho nunca começou, arquivado terminou. */
function periodo(p: PlanoTreinoResumo): string {
  if (p.status === 'ATIVO' && p.inicioEm) return `ativo desde ${porExtenso(p.inicioEm)}`;
  if (p.status === 'ARQUIVADO' && p.inicioEm && p.fimEm) {
    return `${porExtenso(p.inicioEm)} — ${porExtenso(p.fimEm)}`;
  }
  return `montado em ${porExtenso(p.criadoEm)}`;
}

export function HistoricoDeTreinos({
  alunoId,
  planos,
  aoMudar,
}: {
  alunoId: string;
  planos: PlanoTreinoResumo[];
  /** Recarrega a lista lá fora: ativar um plano arquiva os outros. */
  aoMudar: () => void;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<PlanoTreinoCompleto | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [ativando, setAtivando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function abrir(planoId: string) {
    if (aberto === planoId) {
      setAberto(null);
      setDetalhe(null);
      return;
    }
    setAberto(planoId);
    setDetalhe(null);
    setCarregando(true);
    setErro(null);
    try {
      setDetalhe(await sdk.treinos.obter(alunoId, planoId));
    } catch {
      setErro('Não foi possível abrir este plano.');
    } finally {
      setCarregando(false);
    }
  }

  async function ativar(planoId: string) {
    setAtivando(planoId);
    setErro(null);
    try {
      await sdk.treinos.ativar(alunoId, planoId);
      aoMudar();
    } catch {
      setErro('Não foi possível ativar este plano.');
    } finally {
      setAtivando(null);
    }
  }

  if (planos.length === 0) return <Aviso tipo="info">Nenhum plano montado ainda.</Aviso>;

  return (
    <div className="flex flex-col gap-md">
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {planos.map((p) => (
        <Cartao key={p.id}>
          <div className="flex flex-wrap items-center justify-between gap-md">
            <div>
              {/*
                O nome é o botão. Um cartão que parece clicável e não abre é
                pior do que um cartão claramente inerte.
              */}
              <button onClick={() => void abrir(p.id)} className="text-left font-semibold underline">
                {p.nome}
              </button>
              <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                versão {p.versao} · {p.totalSessoes} {p.totalSessoes === 1 ? 'sessão' : 'sessões'} ·{' '}
                {periodo(p)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-md">
              <Etiqueta
                texto={ROTULO_STATUS[p.status]}
                cor={p.status === 'ATIVO' ? areaTemaClaro.treino.texto : 'var(--vv-texto-secundario)'}
              />
              {/*
                Sem este botão, salvar sem ativar era um beco: o plano ficava
                gravado e não havia caminho na tela para colocá-lo em uso.
              */}
              {/*
                Imprimir vale para qualquer plano, inclusive arquivado: o
                profissional às vezes quer o papel de um ciclo que já passou
                para comparar com o de agora.
              */}
              <Link href={`/alunos/${alunoId}/treino/${p.id}/imprimir`}>
                <Botao variante="neutra">🖨️ Imprimir / PDF</Botao>
              </Link>
              {p.status !== 'ATIVO' && (
                <Botao
                  variante="neutra"
                  disabled={ativando === p.id}
                  onClick={() => void ativar(p.id)}
                >
                  {ativando === p.id ? 'Ativando…' : 'Ativar este plano'}
                </Botao>
              )}
            </div>
          </div>

          {aberto === p.id && (
            <div className="mt-lg border-t pt-md" style={{ borderColor: 'var(--vv-borda)' }}>
              {carregando && (
                <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Abrindo…
                </p>
              )}
              {detalhe?.sessoes.map((s) => (
                <div key={s.id} className="mb-lg">
                  <p className="font-semibold">{s.nome}</p>
                  <ul className="mt-xs flex flex-col gap-xs">
                    {s.itens.map((i) => (
                      <li key={i.id} className="text-sm">
                        {i.exercicio.nome}
                        <span style={{ color: 'var(--vv-texto-secundario)' }}>
                          {' — '}
                          {i.series} × {i.repsAlvo}
                          {i.cargaSugeridaKg !== null && ` · ${i.cargaSugeridaKg} kg`}
                          {i.descansoSeg !== null && ` · ${i.descansoSeg}s de descanso`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {detalhe && detalhe.sessoes.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Este plano não tem sessões.
                </p>
              )}
            </div>
          )}
        </Cartao>
      ))}

      <Aviso tipo="info">
        Ajustar um plano cria uma versão nova e arquiva a anterior — o histórico precisa mostrar o
        que o aluno realmente executou em cada época.
      </Aviso>
    </div>
  );
}
