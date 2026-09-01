'use client';

import { PERIODOS_COMPARATIVO, type ComparativoDeEvolucao } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Aviso, Botao, Cartao } from '../../../../../components/ui';
import {
  linhasDoComparativo,
  paresDeFotos,
  porExtenso,
  resumoDoPeriodo,
  type ParDeFotos,
} from '../../../../../lib/comparativo';
import { sdk } from '../../../../../lib/sdk';
import { useSessao } from '../../../../../lib/sessao';

const NOME_DO_ANGULO: Record<string, string> = {
  FRENTE: 'De frente',
  LADO_DIREITO: 'Lado direito',
  LADO_ESQUERDO: 'Lado esquerdo',
  // Herdado das fotos anteriores à separação dos lados; sem como saber qual era.
  LADO: 'De lado',
  COSTAS: 'De costas',
  LIVRE: 'Livre',
};

/** Verde/vermelho só onde dá para afirmar; ver `variacaoEhPositiva`. */
function corDaVariacao(positiva: boolean | null): string | undefined {
  if (positiva === null) return undefined;
  return positiva ? 'var(--vv-sucesso)' : 'var(--vv-alerta)';
}

function Coluna({ titulo, data }: { titulo: string; data: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--vv-texto-secundario)' }}>
        {titulo}
      </p>
      <p className="text-sm font-semibold">{porExtenso(data) ?? 'sem medição'}</p>
    </div>
  );
}

function FotoOuVazio({ par, lado }: { par: ParDeFotos; lado: 'antes' | 'agora' }) {
  const foto = par[lado];
  if (!foto) {
    return (
      <div
        className="grid aspect-[3/4] place-items-center rounded-md border border-dashed p-md text-center text-xs"
        style={{ borderColor: 'var(--vv-borda)', color: 'var(--vv-texto-secundario)' }}
      >
        Sem foto {lado === 'antes' ? 'nesta data' : 'recente'} neste ângulo
      </div>
    );
  }
  return (
    <figure>
      {/*
        `img` cru em vez do componente de imagem do Next: a URL é assinada e
        expira em minutos, então otimizar no servidor não faz sentido — e o
        proxy de imagem guardaria em cache uma foto que é o dado mais íntimo
        do app.
      */}
      <img
        src={foto.url}
        alt={`Foto ${NOME_DO_ANGULO[foto.angulo] ?? foto.angulo} de ${porExtenso(foto.data)}`}
        className="w-full rounded-md object-cover"
        style={{ aspectRatio: '3 / 4' }}
      />
      <figcaption className="mt-xs text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
        {porExtenso(foto.data)}
      </figcaption>
    </figure>
  );
}

/**
 * Comparativo de evolução — a tela que vira papel.
 *
 * É o documento que o profissional entrega ao aluno no fim de um ciclo. O
 * "PDF" sai pela impressão do navegador (`window.print()` → *Salvar como
 * PDF*), e não por um gerador no servidor: as fotos, que são o coração do
 * documento, o navegador já compõe e imprime sozinho.
 */
export default function ComparativoPage() {
  const { alunoId } = useParams<{ alunoId: string }>();
  const { usuario } = useSessao();

  const [dias, setDias] = useState<number>(60);
  const [comparativo, setComparativo] = useState<ComparativoDeEvolucao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [semAutorizacao, setSemAutorizacao] = useState(false);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    sdk.comparativo
      .montar(alunoId, dias)
      .then((c) => {
        if (!ativo) return;
        setComparativo(c);
        setErro(null);
        setSemAutorizacao(false);
      })
      .catch((e) => {
        if (!ativo) return;
        if (e instanceof ErroApi && e.codigo === 'CONSENTIMENTO_AUSENTE') {
          setSemAutorizacao(true);
          setErro(null);
          return;
        }
        setErro('Não foi possível montar o comparativo.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    // Troca de período dispara outra busca: a anterior não pode chegar depois
    // e sobrescrever a atual.
    return () => {
      ativo = false;
    };
  }, [alunoId, dias]);

  const linhas = comparativo ? linhasDoComparativo(comparativo) : [];
  const fotos = comparativo ? paresDeFotos(comparativo.antes, comparativo.agora) : [];

  return (
    <div className="flex flex-col gap-xl">
      <div data-nao-imprime className="flex flex-col gap-lg">
        <Link
          href={`/alunos/${alunoId}`}
          className="text-sm"
          style={{ color: 'var(--vv-texto-secundario)' }}
        >
          ← Voltar para a ficha
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-md">
          <div className="flex gap-xs">
            {PERIODOS_COMPARATIVO.map((p) => (
              <button
                key={p}
                onClick={() => setDias(p)}
                className="min-h-toque rounded-md px-md text-sm font-semibold"
                style={{
                  background: dias === p ? 'var(--vv-primaria-fundo)' : 'transparent',
                  color: dias === p ? 'var(--vv-primaria-texto)' : 'var(--vv-texto-secundario)',
                  border: '1px solid var(--vv-borda)',
                }}
              >
                {p} dias
              </button>
            ))}
          </div>

          <Botao onClick={() => window.print()} disabled={!comparativo}>
            Salvar em PDF / imprimir
          </Botao>
        </div>

        <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
          A impressão abre a janela do navegador — escolha <strong>Salvar como PDF</strong> no
          destino. Menu e botões não saem no papel.
        </p>
      </div>

      {semAutorizacao && (
        <Cartao>
          <Aviso tipo="info">
            Este aluno ainda não autorizou o compartilhamento dos dados de evolução. A autorização é
            dada por ele mesmo, no aplicativo.
          </Aviso>
        </Cartao>
      )}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {carregando && !comparativo && <Cartao>Montando comparativo…</Cartao>}

      {comparativo && (
        <article className="documento flex flex-col gap-lg">
          <header className="sem-quebrar">
            <h1 className="text-2xl font-bold">Comparativo de evolução</h1>
            <p className="text-lg">{comparativo.aluno.nome}</p>
            <p className="mt-xs text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              {resumoDoPeriodo(comparativo)}
            </p>
          </header>

          <Cartao className="sem-quebrar">
            <div className="mb-md grid grid-cols-3 gap-md">
              <Coluna titulo="Antes" data={comparativo.antes.data} />
              <Coluna titulo="Agora" data={comparativo.agora.data} />
              <div className="text-right">
                <p
                  className="text-xs uppercase tracking-wide"
                  style={{ color: 'var(--vv-texto-secundario)' }}
                >
                  Período
                </p>
                <p className="text-sm font-semibold">{comparativo.dias} dias</p>
              </div>
            </div>

            {linhas.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                Nenhuma medida registrada neste período.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: 'var(--vv-texto-secundario)' }}>
                    <th className="pb-xs text-left font-normal">Medida</th>
                    <th className="pb-xs text-right font-normal">Antes</th>
                    <th className="pb-xs text-right font-normal">Agora</th>
                    <th className="pb-xs text-right font-normal">Variação</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.chave} className="border-t" style={{ borderColor: 'var(--vv-borda)' }}>
                      <td className="py-sm">{l.rotulo}</td>
                      <td className="py-sm text-right tabular-nums">
                        {l.antes === null ? '—' : `${l.antes} ${l.unidade}`}
                      </td>
                      <td className="py-sm text-right font-semibold tabular-nums">
                        {l.agora === null ? '—' : `${l.agora} ${l.unidade}`}
                      </td>
                      <td
                        className="py-sm text-right font-bold tabular-nums"
                        style={{ color: corDaVariacao(l.positiva) }}
                      >
                        {l.variacao === null ? '—' : `${l.variacao} ${l.unidade}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <p className="mt-md text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
              Travessão significa medida não registrada naquela data — não significa ausência de
              mudança.
            </p>
          </Cartao>

          {comparativo.treino && (
            <Cartao className="sem-quebrar">
              <p className="mb-md font-semibold">O treino do período</p>
              <div className="grid grid-cols-3 gap-lg">
                <div>
                  <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                    Treinos concluídos
                  </p>
                  <p className="text-xl font-bold tabular-nums">{comparativo.treino.sessoes}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                    Peso total levantado
                  </p>
                  <p className="text-xl font-bold tabular-nums">
                    {Math.round(comparativo.treino.volumeKg).toLocaleString('pt-BR')} kg
                  </p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                    Tempo em treino
                  </p>
                  <p className="text-xl font-bold tabular-nums">
                    {Math.floor(comparativo.treino.minutos / 60)}h{' '}
                    {comparativo.treino.minutos % 60}min
                  </p>
                </div>
              </div>
              <p className="mt-md text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                É o esforço que explica o resultado acima — sem ele o documento seria só o corpo.
              </p>
            </Cartao>
          )}

          {fotos.length > 0 && (
            <section className="flex flex-col gap-md">
              <h2 className="text-lg font-semibold">Fotos</h2>
              {fotos.map((par) => (
                <Cartao key={par.angulo} className="sem-quebrar">
                  <p className="mb-sm text-sm font-semibold">
                    {NOME_DO_ANGULO[par.angulo] ?? par.angulo}
                  </p>
                  <div className="grid grid-cols-2 gap-md">
                    <FotoOuVazio par={par} lado="antes" />
                    <FotoOuVazio par={par} lado="agora" />
                  </div>
                </Cartao>
              ))}
            </section>
          )}

          <footer
            className="sem-quebrar border-t pt-md text-xs"
            style={{ borderColor: 'var(--vv-borda)', color: 'var(--vv-texto-secundario)' }}
          >
            <p>
              Documento gerado em{' '}
              {new Date(comparativo.geradoEm).toLocaleString('pt-BR', {
                dateStyle: 'long',
                timeStyle: 'short',
              })}
              {usuario ? ` por ${usuario.nome}` : ''} · Vívio Fit
            </p>
            {/*
              A ressalva existe porque o documento sai da tela e circula: sem
              ela, um comparativo de 60 dias vira "laudo" na mão de quem o
              recebe.
            */}
            <p className="mt-xs">
              Comparativo de acompanhamento. Não substitui avaliação clínica nem exame
              laboratorial.
            </p>
          </footer>
        </article>
      )}
    </div>
  );
}
