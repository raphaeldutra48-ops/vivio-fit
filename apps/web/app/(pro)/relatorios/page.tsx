'use client';

import {
  DIAS_PARA_ALERTA,
  precisaDeAtencao,
  type LinhaDoRelatorio,
  type RelatorioDaCarteira,
} from '@vivio/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Aviso, Botao, Cartao } from '../../../components/ui';
import { sdk } from '../../../lib/sdk';

const JANELAS = [7, 30, 90] as const;

/** Célula que sabe a diferença entre "zero" e "não posso ver". */
function Valor({
  valor,
  autorizado,
  sufixo = '',
  destaque,
}: {
  valor: number | null;
  autorizado: boolean;
  sufixo?: string;
  destaque?: boolean;
}) {
  if (!autorizado) {
    return (
      <span
        className="text-sm"
        style={{ color: 'var(--vv-texto-secundario)' }}
        title="O aluno não autorizou o compartilhamento deste dado"
      >
        não autorizado
      </span>
    );
  }
  if (valor === null) {
    return (
      <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
        —
      </span>
    );
  }
  return (
    <span className={`tabular-nums ${destaque ? 'font-bold' : ''}`}>
      {valor > 0 && sufixo === ' kg' ? '+' : ''}
      {valor}
      {sufixo}
    </span>
  );
}

export default function Relatorios() {
  const [dias, setDias] = useState<number>(30);
  const [dados, setDados] = useState<RelatorioDaCarteira | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    setCarregando(true);
    sdk.relatorios
      .carteira(dias)
      .then(setDados)
      .catch(() => setErro('Não foi possível carregar o relatório.'))
      .finally(() => setCarregando(false));
  }, [dias]);

  /*
    Seta explícita, e não `filter(precisaDeAtencao)`: o `filter` passa o
    ÍNDICE como segundo argumento, que hoje é o parâmetro de limiares. Com a
    referência direta, o aluno na posição 30 da lista seria avaliado com
    limiar 30 — silenciosamente, se o TypeScript não recusasse.
  */
  const atencao = (dados?.linhas ?? []).filter((linha) => precisaDeAtencao(linha));

  const Metrica = ({ rotulo, valor }: { rotulo: string; valor: string | number }) => (
    <Cartao className="flex-1 min-w-[150px]">
      <p className="text-xs uppercase" style={{ color: 'var(--vv-texto-secundario)' }}>
        {rotulo}
      </p>
      <p className="text-2xl font-bold tabular-nums">{valor}</p>
    </Cartao>
  );

  const Linha = ({ l }: { l: LinhaDoRelatorio }) => (
    <tr style={{ borderTop: '1px solid var(--vv-borda)' }}>
      <td className="py-md">
        <Link href={`/alunos/${l.alunoId}`} className="font-medium underline">
          {l.nome}
        </Link>
      </td>
      <td className="py-md text-right">
        <Valor valor={l.treinosNoPeriodo} autorizado={l.autorizou.treino} />
      </td>
      <td className="py-md text-right">
        {l.autorizou.treino ? (
          l.diasSemTreinar === null ? (
            <span className="text-sm" style={{ color: 'var(--vv-erro)' }}>
              nunca treinou
            </span>
          ) : (
            <span
              className="tabular-nums"
              style={{
                color: l.diasSemTreinar >= DIAS_PARA_ALERTA ? 'var(--vv-erro)' : undefined,
              }}
            >
              {l.diasSemTreinar === 0 ? 'hoje' : `há ${l.diasSemTreinar} d`}
            </span>
          )
        ) : (
          <Valor valor={null} autorizado={false} />
        )}
      </td>
      <td className="py-md text-right">
        <Valor
          valor={l.variacaoPesoKg}
          autorizado={l.autorizou.evolucao}
          sufixo=" kg"
          destaque
        />
      </td>
      <td className="py-md text-right">
        <Valor valor={l.adesaoDietaPercentual} autorizado={l.autorizou.nutricao} sufixo="%" />
      </td>
    </tr>
  );

  return (
    <div className="flex flex-col gap-xl">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            Panorama da sua carteira. Cada linha mostra só o que aquele aluno autorizou você a ver.
          </p>
        </div>
        <div className="flex gap-sm">
          {JANELAS.map((j) => (
            <button
              key={j}
              onClick={() => setDias(j)}
              aria-pressed={dias === j}
              className="min-h-toque rounded-md border px-lg font-semibold"
              style={{
                background: dias === j ? 'var(--vv-acao-fundo)' : 'var(--vv-superficie)',
                color: dias === j ? 'var(--vv-acao-texto)' : 'var(--vv-texto-primario)',
                borderColor: dias === j ? 'var(--vv-acao-fundo)' : 'var(--vv-borda)',
              }}
            >
              {j} dias
            </button>
          ))}
        </div>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {carregando && !dados && <Aviso tipo="info">Carregando…</Aviso>}

      {dados && (
        <>
          <div className="flex flex-wrap gap-md">
            <Metrica rotulo="Alunos ativos" valor={dados.totalAlunos} />
            <Metrica rotulo="Treinaram no período" valor={dados.alunosQueTreinaram} />
            <Metrica rotulo="Treinos registrados" valor={dados.treinosNoPeriodo} />
            <Metrica rotulo="Média por aluno" valor={dados.mediaTreinosPorAluno} />
          </div>

          {atencao.length > 0 && (
            <Cartao>
              <p className="mb-xs font-semibold" style={{ color: 'var(--vv-erro)' }}>
                {atencao.length === 1
                  ? '1 aluno precisa de atenção'
                  : `${atencao.length} alunos precisam de atenção`}
              </p>
              <p className="mb-md text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                Sem treinar há {DIAS_PARA_ALERTA} dias ou mais. Duas semanas costuma ser o ponto em
                que a pessoa desiste sem avisar.
              </p>
              <div className="flex flex-wrap gap-sm">
                {atencao.map((l) => (
                  <Link key={l.alunoId} href={`/alunos/${l.alunoId}`}>
                    <Botao variante="neutra">
                      {l.nome}
                      <span className="ml-sm text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                        {l.diasSemTreinar === null ? 'nunca treinou' : `há ${l.diasSemTreinar} d`}
                      </span>
                    </Botao>
                  </Link>
                ))}
              </div>
            </Cartao>
          )}

          <Cartao className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 640 }}>
              <thead>
                <tr style={{ color: 'var(--vv-texto-secundario)' }}>
                  <th className="pb-sm text-left font-semibold">Aluno</th>
                  <th className="pb-sm text-right font-semibold">Treinos</th>
                  <th className="pb-sm text-right font-semibold">Último treino</th>
                  <th className="pb-sm text-right font-semibold">Peso</th>
                  <th className="pb-sm text-right font-semibold">Dieta</th>
                </tr>
              </thead>
              <tbody>
                {dados.linhas.map((l) => (
                  <Linha key={l.alunoId} l={l} />
                ))}
              </tbody>
            </table>

            {dados.linhas.length === 0 && (
              <p className="pt-md" style={{ color: 'var(--vv-texto-secundario)' }}>
                Nenhum aluno ativo na carteira.
              </p>
            )}
          </Cartao>

          <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
            Período de {new Date(`${dados.de}T12:00:00`).toLocaleDateString('pt-BR')} a{' '}
            {new Date(`${dados.ate}T12:00:00`).toLocaleDateString('pt-BR')}. "Não autorizado"
            significa que o aluno não compartilhou aquele tipo de dado — não que o valor seja zero.
          </p>
        </>
      )}
    </div>
  );
}
