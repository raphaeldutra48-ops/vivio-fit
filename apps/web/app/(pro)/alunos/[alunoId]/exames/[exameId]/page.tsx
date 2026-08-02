'use client';

import {
  Classificacao,
  ROTULO_CLASSIFICACAO,
  ROTULO_FORCA,
  type ExameResumo,
  type MarcadorNoExame,
} from '@vivio/contracts';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Aviso, Cartao } from '../../../../../../components/ui';
import {
  COR_DA_CLASSIFICACAO,
  agruparPorSistema,
  faixaEmTexto,
  fonteEmTexto,
} from '../../../../../../lib/exames';
import { sdk } from '../../../../../../lib/sdk';

type Filtro = Classificacao | 'TODOS';

/**
 * Resultado do exame.
 *
 * Cada linha mostra as DUAS faixas — a do laboratório e a funcional — porque
 * mostrar só a funcional faria a tela parecer discordar do laudo que o
 * paciente tem na mão. E cada faixa vem com a fonte e a força dela.
 */
export default function ResultadoDoExame() {
  const { alunoId, exameId } = useParams<{ alunoId: string; exameId: string }>();
  const [exame, setExame] = useState<ExameResumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('TODOS');
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    sdk.exames
      .obter(alunoId, exameId)
      .then(setExame)
      .catch(() => setErro('Não foi possível carregar este exame.'));
  }, [alunoId, exameId]);

  const visiveis = useMemo(
    () =>
      exame
        ? exame.resultados.filter((r) => filtro === 'TODOS' || r.classificacao === filtro)
        : [],
    [exame, filtro],
  );
  const grupos = useMemo(() => agruparPorSistema(visiveis), [visiveis]);

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!exame) return <p style={{ color: 'var(--vv-texto-secundario)' }}>Carregando…</p>;

  const total = exame.resultados.length;
  const chips: { valor: Filtro; rotulo: string; cor?: string }[] = [
    { valor: 'TODOS', rotulo: `Todos (${total})` },
    ...(Object.values(Classificacao) as Classificacao[]).map((c) => ({
      valor: c,
      rotulo: `${ROTULO_CLASSIFICACAO[c]} (${exame.contagem[c]})`,
      cor: COR_DA_CLASSIFICACAO[c],
    })),
  ];

  return (
    <div className="flex flex-col gap-xl pb-2xl">
      <Link
        href={`/alunos/${alunoId}`}
        className="text-sm"
        style={{ color: 'var(--vv-texto-secundario)' }}
      >
        ← Voltar para a ficha
      </Link>

      <div>
        <h1 className="text-2xl font-bold">{exame.laboratorio}</h1>
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          Coleta em {new Date(`${exame.dataColeta}T12:00:00`).toLocaleDateString('pt-BR')} ·{' '}
          {total} {total === 1 ? 'marcador' : 'marcadores'} · registrado por{' '}
          {exame.registradoPor.nome}
        </p>
        {exame.observacao && (
          <p className="mt-xs text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            {exame.observacao}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-sm">
        {chips.map((chip) => {
          const ativo = filtro === chip.valor;
          return (
            <button
              key={chip.valor}
              onClick={() => setFiltro(chip.valor)}
              aria-pressed={ativo}
              className="min-h-toque rounded-pill border px-lg text-sm font-semibold"
              style={{
                borderColor: ativo ? (chip.cor ?? 'var(--vv-texto-primario)') : 'var(--vv-borda)',
                color: ativo ? (chip.cor ?? 'var(--vv-texto-primario)') : 'var(--vv-texto-secundario)',
                background: 'var(--vv-superficie)',
              }}
            >
              {chip.rotulo}
            </button>
          );
        })}
      </div>

      {visiveis.length === 0 && (
        <Aviso tipo="info">Nenhum marcador nesta classificação.</Aviso>
      )}

      {grupos.map((grupo) => (
        <div key={grupo.sistema} className="flex flex-col gap-sm">
          <p className="text-sm font-semibold" style={{ color: 'var(--vv-texto-secundario)' }}>
            {grupo.rotulo}
          </p>
          {grupo.marcadores.map((m) => (
            <Linha
              key={m.marcador}
              marcador={m}
              aberto={aberto === m.marcador}
              aoAlternar={() => setAberto(aberto === m.marcador ? null : m.marcador)}
            />
          ))}
        </div>
      ))}

      {exame.temArquivo && exame.arquivoUrl === null && (
        <Aviso tipo="info">
          Existe um arquivo anexado a este exame. Ele é acessível apenas ao médico da equipe e ao
          próprio aluno.
        </Aviso>
      )}

      <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
        As faixas funcionais são referências de otimização, não critérios de diagnóstico. Veja de
        onde vem cada uma em{' '}
        <Link href="/metodologia" className="underline">
          Metodologia
        </Link>
        .
      </p>
    </div>
  );
}

function Linha({
  marcador,
  aberto,
  aoAlternar,
}: {
  marcador: MarcadorNoExame;
  aberto: boolean;
  aoAlternar: () => void;
}) {
  const cor = COR_DA_CLASSIFICACAO[marcador.classificacao];

  return (
    <Cartao>
      <button
        onClick={aoAlternar}
        aria-expanded={aberto}
        className="flex w-full flex-wrap items-center justify-between gap-md text-left"
      >
        <span className="flex items-center gap-md">
          <span
            aria-hidden
            className="inline-block rounded-pill"
            style={{ width: 10, height: 10, background: cor }}
          />
          <span className="font-semibold">{marcador.rotulo}</span>
        </span>

        <span className="flex items-center gap-md">
          <span className="tabular-nums font-bold">
            {marcador.valor}
            <span className="ml-xs text-xs font-normal" style={{ color: 'var(--vv-texto-secundario)' }}>
              {marcador.unidade}
            </span>
          </span>
          <span
            className="rounded-pill px-md py-xs text-xs font-semibold"
            style={{ color: cor, border: `1px solid ${cor}` }}
          >
            {ROTULO_CLASSIFICACAO[marcador.classificacao]}
          </span>
          <span aria-hidden style={{ color: 'var(--vv-texto-secundario)' }}>
            {aberto ? '▲' : '▼'}
          </span>
        </span>
      </button>

      {aberto && (
        <div className="mt-lg flex flex-col gap-md text-sm">
          <div className="grid gap-md sm:grid-cols-2">
            <Referencia
              titulo="Faixa do laboratório"
              faixa={faixaEmTexto(marcador.laboratorial, marcador.unidade)}
              fonte={fonteEmTexto(marcador.fonteLaboratorial)}
              forca={ROTULO_FORCA[marcador.fonteLaboratorial.forca]}
            />
            <Referencia
              titulo="Faixa funcional (alvo)"
              faixa={faixaEmTexto(marcador.funcional, marcador.unidade)}
              fonte={fonteEmTexto(marcador.fonteFuncional)}
              forca={ROTULO_FORCA[marcador.fonteFuncional.forca]}
            />
          </div>
          {marcador.nota && (
            <p style={{ color: 'var(--vv-texto-secundario)' }}>{marcador.nota}</p>
          )}
        </div>
      )}
    </Cartao>
  );
}

function Referencia({
  titulo,
  faixa,
  fonte,
  forca,
}: {
  titulo: string;
  faixa: string;
  fonte: string;
  forca: string;
}) {
  return (
    <div>
      <p className="font-semibold">{titulo}</p>
      <p className="tabular-nums">{faixa}</p>
      <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
        {fonte}
      </p>
      <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
        {forca}
      </p>
    </div>
  );
}
