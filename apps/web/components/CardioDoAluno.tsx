'use client';

import {
  NOME_DA_FORMULA,
  ROTULO_INTENSIDADE,
  ROTULO_TIPO_CARDIO,
  type CardioResumo,
  type ResumoDeCalorias,
} from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { useEffect, useState } from 'react';
import { sdk } from '../lib/sdk';
import { Aviso, Cartao } from './ui';

const JANELAS = [7, 30, 90] as const;

function porExtenso(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  if (!ano || !mes || !dia) return iso;
  return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  });
}

/**
 * Cardio e gasto calórico, do lado de quem prescreve.
 *
 * Existe porque não adianta o aluno registrar a corrida de domingo se o
 * profissional não vê: o dado vira diário particular, e a pessoa para de
 * preencher quando percebe que ninguém lê.
 *
 * Musculação e cardio aparecem separados, nunca somados. São perguntas
 * diferentes — o cardio diz se o aluno cumpriu o que foi combinado fora da
 * sala, a musculação diz se o treino tem o volume prescrito.
 */
export function CardioDoAluno({ alunoId }: { alunoId: string }) {
  const [dias, setDias] = useState<number>(30);
  const [atividades, setAtividades] = useState<CardioResumo[] | null>(null);
  const [resumo, setResumo] = useState<ResumoDeCalorias | null>(null);
  const [semAutorizacao, setSemAutorizacao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    Promise.all([sdk.cardio.listar(alunoId, dias), sdk.cardio.calorias(alunoId, dias)])
      .then(([lista, calorias]) => {
        if (!ativo) return;
        setAtividades(lista);
        setResumo(calorias);
        setErro(null);
        setSemAutorizacao(false);
      })
      .catch((e) => {
        if (!ativo) return;
        if (e instanceof ErroApi && e.codigo === 'CONSENTIMENTO_AUSENTE') {
          setSemAutorizacao(true);
          setAtividades([]);
          return;
        }
        setErro('Não foi possível carregar o cardio.');
        setAtividades([]);
      });
    return () => {
      ativo = false;
    };
  }, [alunoId, dias]);

  // A falta de autorização de treino já é dita na seção de treino da ficha;
  // repetir aqui só ocuparia espaço com a mesma informação.
  if (semAutorizacao) return null;
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!atividades || !resumo) return null;

  const kcal = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR'));

  return (
    <section className="flex flex-col gap-md">
      <div className="flex flex-wrap items-center justify-between gap-md">
        <h2 className="text-lg font-semibold">Cardio e gasto calórico</h2>
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
        <div className="grid grid-cols-2 gap-lg sm:grid-cols-3">
          <div>
            <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              Cardio
            </p>
            <p className="text-xl font-bold tabular-nums">{kcal(resumo.cardio.kcal)}</p>
            <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
              kcal · {resumo.cardio.sessoes} atividades · {resumo.cardio.minutos} min
            </p>
          </div>
          <div>
            <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              Musculação
            </p>
            <p className="text-xl font-bold tabular-nums">{kcal(resumo.musculacao.kcal)}</p>
            <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
              kcal · {resumo.musculacao.sessoes} treinos · {resumo.musculacao.minutos} min
            </p>
          </div>
          <div>
            <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              Total no período
            </p>
            <p className="text-xl font-bold tabular-nums">{kcal(resumo.totalKcal)}</p>
            <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
              kcal estimadas
            </p>
          </div>
        </div>

        {/*
          A ressalva fica junto do número, e não num rodapé de página: quem lê
          "3.250 kcal" precisa saber, no mesmo olhar, que é estimativa.
        */}
        {resumo.pesoUsadoKg === null ? (
          <Aviso tipo="info">
            Sem peso registrado não dá para estimar caloria — a conta depende dele. Peça ao aluno
            para registrar o peso em Evolução.
          </Aviso>
        ) : (
          <p className="mt-md text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
            Estimativa pela fórmula do ACSM (MET × peso × tempo), com{' '}
            {resumo.pesoUsadoKg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg. A
            variação real entre pessoas chega a 30% — use como tendência, não como medida.
          </p>
        )}
      </Cartao>

      {/*
        O gasto do corpo ao lado do gasto do treino. Sem essa comparação, o
        aluno superestima o efeito do exercício sobre o peso — e é o
        profissional quem recebe a frustração de "treino e não emagreço".
      */}
      <Cartao>
        <p className="mb-md font-semibold">Gasto energético por dia</p>

        {resumo.gastoDiario.tmb === null ? (
          <Aviso tipo="info">
            Não dá para estimar o metabolismo ainda — falta {resumo.gastoDiario.faltando.join(', ')}.
            O aluno preenche altura e sexo no próprio aplicativo, em Meus dados. Uma bioimpedância
            também resolve, e com mais precisão.
          </Aviso>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-lg">
              <div>
                <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Corpo em repouso
                </p>
                <p className="text-xl font-bold tabular-nums">
                  {resumo.gastoDiario.cotidiano?.toLocaleString('pt-BR')}
                </p>
                <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                  kcal · TMB {resumo.gastoDiario.tmb.toLocaleString('pt-BR')} × 1,2
                </p>
              </div>
              <div>
                <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Exercício (média)
                </p>
                <p className="text-xl font-bold tabular-nums">
                  {resumo.gastoDiario.exercicioPorDia === null
                    ? '—'
                    : resumo.gastoDiario.exercicioPorDia.toLocaleString('pt-BR')}
                </p>
                <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                  kcal por dia no período
                </p>
              </div>
              <div>
                <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Total estimado
                </p>
                <p className="text-xl font-bold tabular-nums">
                  {resumo.gastoDiario.totalPorDia?.toLocaleString('pt-BR')}
                </p>
                <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                  kcal por dia
                </p>
              </div>
            </div>

            {/*
              Dizer a fonte é o que separa medição de estimativa — e é o que
              permite ao profissional saber se vale pedir uma bioimpedância.
            */}
            <p className="mt-md text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
              Base: <strong>{NOME_DA_FORMULA[resumo.gastoDiario.formula!]}</strong>
              {resumo.gastoDiario.formula === 'CALORIMETRIA'
                ? ' — medido, não estimado.'
                : resumo.gastoDiario.formula === 'KATCH_MCARDLE'
                  ? ' — usa a massa magra medida na avaliação física.'
                  : ' — estimativa por altura, idade e sexo. Uma bioimpedância troca o palpite por medida.'}
              {' '}O fator 1,2 cobre só a vida cotidiana: o exercício entra pelo que foi registrado,
              e não por tabela de atividade — somar os dois contaria o treino duas vezes.
            </p>
          </>
        )}

        {resumo.gastoDiario.calorimetriaExpirada && (
          <Aviso tipo="info">
            {resumo.gastoDiario.calorimetriaExpirada.motivo === 'MUDANCA_DE_PESO'
              ? 'Há uma calorimetria registrada, mas o peso mudou mais de 5% desde o exame — voltou a estimar. Vale refazer.'
              : `Há uma calorimetria registrada, feita há ${resumo.gastoDiario.calorimetriaExpirada.mesesDesde} meses. Passou da validade e o cálculo voltou a estimar.`}
          </Aviso>
        )}
      </Cartao>

      {atividades.length === 0 ? (
        <Cartao>
          <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            Nenhuma atividade de cardio registrada neste período. O aluno registra pelo aplicativo,
            no fim do treino ou pela tela de Cardio.
          </p>
        </Cartao>
      ) : (
        <Cartao>
          <ul className="flex flex-col gap-sm">
            {atividades.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-md">
                <span>
                  {ROTULO_TIPO_CARDIO[a.tipo]}
                  {/* Distingue a esteira do treino da corrida solta na semana. */}
                  {a.execucaoId && (
                    <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                      {' '}
                      · junto do treino
                    </span>
                  )}
                </span>
                <span className="flex items-baseline gap-md text-sm tabular-nums">
                  <span style={{ color: 'var(--vv-texto-secundario)' }}>{porExtenso(a.data)}</span>
                  <span>
                    {a.duracaoMin} min · {ROTULO_INTENSIDADE[a.intensidade].titulo}
                    {a.distanciaKm !== null ? ` · ${a.distanciaKm} km` : ''}
                  </span>
                  <span className="font-bold">
                    {a.caloriasEstimadas === null ? '—' : `~${a.caloriasEstimadas} kcal`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </section>
  );
}
