'use client';

import type { PainelDeProgresso as Painel } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { useEffect, useState } from 'react';
import { sdk } from '../lib/sdk';
import { Aviso, Cartao } from './ui';

const JANELAS = [30, 60, 90] as const;

/** Milhar com ponto, como se lê em português. */
function kg(valor: number): string {
  return `${Math.round(valor).toLocaleString('pt-BR')} kg`;
}

function horas(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

/**
 * Um número do painel.
 *
 * `null` vira travessão e não zero — as duas coisas são diferentes e a
 * distinção é o ponto: zero é um resultado ruim, travessão é ausência de
 * registro. Cobrar alguém por um travessão seria cobrar pelo que ele não sabe
 * que existe.
 */
function Numero({
  rotulo,
  valor,
  detalhe,
  cor,
}: {
  rotulo: string;
  valor: string | null;
  detalhe?: string;
  cor?: string;
}) {
  return (
    <div>
      <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
        {rotulo}
      </p>
      <p className="text-xl font-bold tabular-nums" style={cor ? { color: cor } : undefined}>
        {valor ?? '—'}
      </p>
      {detalhe && (
        <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
          {detalhe}
        </p>
      )}
    </div>
  );
}

export function PainelDeProgresso({
  alunoId,
  nomeDoAluno,
}: {
  alunoId: string;
  nomeDoAluno?: string;
}) {
  const [dias, setDias] = useState<number>(30);
  const [painel, setPainel] = useState<Painel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [semAutorizacao, setSemAutorizacao] = useState(false);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    sdk.progresso
      .painel(alunoId, dias)
      .then((p) => {
        if (!ativo) return;
        setPainel(p);
        setErro(null);
        setSemAutorizacao(false);
      })
      .catch((e) => {
        if (!ativo) return;
        /*
          403 por consentimento não é falha da tela: é informação. Mostrar
          "não foi possível carregar" faria o profissional procurar problema
          técnico onde há uma decisão do aluno.
        */
        if (e instanceof ErroApi && e.codigo === 'CONSENTIMENTO_AUSENTE') {
          setSemAutorizacao(true);
          setErro(null);
          return;
        }
        setErro('Não foi possível carregar o progresso.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    // A troca de janela dispara outra busca; sem isto a resposta lenta da
    // janela anterior chegaria depois e sobrescreveria a atual.
    return () => {
      ativo = false;
    };
  }, [alunoId, dias]);

  if (semAutorizacao) {
    return (
      <section className="flex flex-col gap-md">
        <h2 className="text-lg font-semibold">Progresso</h2>
        <Cartao>
          <Aviso tipo="info">
            {nomeDoAluno ? `${nomeDoAluno.split(' ')[0]} ainda não autorizou` : 'Este aluno ainda não autorizou'}{' '}
            o compartilhamento dos dados de evolução. A autorização é dada pelo próprio aluno, no
            aplicativo.
          </Aviso>
        </Cartao>
      </section>
    );
  }

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!painel && carregando) return <Cartao>Carregando progresso…</Cartao>;
  if (!painel) return null;

  const { treino, checkins, cargas, variacaoPesoKg } = painel;
  const semTreino = treino.total === 0;

  return (
    <section className="flex flex-col gap-md">
      <div className="flex flex-wrap items-center justify-between gap-md">
        <h2 className="text-lg font-semibold">Progresso</h2>
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
      </div>

      <Cartao>
        <div className="grid grid-cols-2 gap-lg sm:grid-cols-4">
          <Numero
            rotulo="Treinos"
            valor={String(treino.total)}
            detalhe={semTreino ? undefined : `${treino.porSemana}/semana`}
          />
          <Numero rotulo="Volume" valor={semTreino ? null : kg(treino.volumeKg)} />
          <Numero
            rotulo="Tempo treinado"
            valor={semTreino ? null : horas(treino.minutos)}
            detalhe={treino.duracaoMediaMin ? `${treino.duracaoMediaMin} min por treino` : undefined}
          />
          <Numero
            rotulo="Último treino"
            valor={
              treino.diasSemTreinar === null
                ? null
                : treino.diasSemTreinar === 0
                  ? 'hoje'
                  : `há ${treino.diasSemTreinar}d`
            }
            /* Sete dias sem treinar é o limiar em que vale olhar, não um erro. */
            cor={
              treino.diasSemTreinar !== null && treino.diasSemTreinar >= 7
                ? 'var(--vv-alerta)'
                : undefined
            }
          />
        </div>
      </Cartao>

      <Cartao>
        <p className="mb-md font-semibold">Check-in diário</p>
        {checkins === null ? (
          /*
            Ausência de check-in não é adesão baixa. Dizer "0%" aqui faria o
            personal cobrar quem talvez nem saiba que o recurso existe.
          */
          <Aviso tipo="info">
            Este aluno ainda não fez nenhum check-in. Sem eles não dá para medir adesão — vale
            explicar o recurso na próxima conversa.
          </Aviso>
        ) : (
          <div className="grid grid-cols-2 gap-lg sm:grid-cols-4">
            <Numero
              rotulo="Adesão"
              valor={checkins.aderencia === null ? null : `${checkins.aderencia}%`}
              detalhe={`em ${checkins.comCheckin} dias registrados`}
              cor={
                checkins.aderencia !== null && checkins.aderencia < 60
                  ? 'var(--vv-alerta)'
                  : undefined
              }
            />
            <Numero
              rotulo="Energia média"
              valor={checkins.energiaMedia === null ? null : `${checkins.energiaMedia}/5`}
            />
            <Numero
              rotulo="Dias com dor"
              valor={String(checkins.diasComDor)}
              cor={checkins.diasComDor > 0 ? 'var(--vv-alerta)' : undefined}
            />
            <Numero
              rotulo="Último check-in"
              valor={
                checkins.diasSemCheckin === null
                  ? null
                  : checkins.diasSemCheckin === 0
                    ? 'hoje'
                    : `há ${checkins.diasSemCheckin}d`
              }
            />
          </div>
        )}
      </Cartao>

      <Cartao>
        <p className="mb-md font-semibold">Evolução de carga</p>
        {cargas.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            Ainda não há exercício repetido o suficiente no período para mostrar tendência. São
            necessários pelo menos dois dias diferentes com o mesmo exercício.
          </p>
        ) : (
          <ul className="flex flex-col gap-sm">
            {cargas.map((c) => {
              const subiu = c.variacaoPercentual > 0;
              return (
                <li key={c.exercicioId} className="flex flex-wrap items-baseline justify-between gap-md">
                  <span>{c.exercicioNome}</span>
                  <span className="flex items-baseline gap-md tabular-nums">
                    <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                      {c.inicio1rmKg} → {c.fim1rmKg} kg
                    </span>
                    <span
                      className="font-bold"
                      style={{ color: subiu ? 'var(--vv-sucesso)' : 'var(--vv-alerta)' }}
                    >
                      {subiu ? '+' : ''}
                      {c.variacaoPercentual}%
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-md text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
          Estimativa de 1RM comparando a primeira metade do período com a segunda. Os exercícios
          com maior variação aparecem primeiro — inclusive os que caíram.
        </p>
      </Cartao>

      {variacaoPesoKg !== null && (
        <Cartao>
          <Numero
            rotulo="Variação de peso no período"
            valor={`${variacaoPesoKg > 0 ? '+' : ''}${variacaoPesoKg} kg`}
          />
        </Cartao>
      )}
    </section>
  );
}
