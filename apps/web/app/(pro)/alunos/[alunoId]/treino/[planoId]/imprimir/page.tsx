'use client';

import type { PlanoTreinoCompleto, ResumoAluno } from '@vivio/contracts';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Aviso, Botao, Cartao } from '../../../../../../../components/ui';
import { sdk } from '../../../../../../../lib/sdk';
import { useSessao } from '../../../../../../../lib/sessao';

/**
 * A ficha de treino em papel.
 *
 * Mesma escolha do comparativo: o "PDF" sai pela impressão do navegador
 * (`window.print()` → *Salvar como PDF*), não por um gerador no servidor. Um
 * gerador exigiria uma segunda descrição do documento, que envelheceria em
 * separado da tela — e o navegador já pagina, quebra e imprime.
 *
 * Página própria, e não a ficha do aluno com CSS de impressão: a ficha tem
 * alertas clínicos, progresso e cardio, e nada disso vai para a academia. O
 * papel é uma coisa só.
 *
 * A coluna vazia da direita é o ponto da folha. Ficha impressa serve para
 * **escrever em cima** — quem treina anota a carga que conseguiu, e é essa
 * anotação que ele leva de volta ao professor. Sem ela o papel é um cartaz.
 */
export default function ImprimirTreino() {
  const { alunoId, planoId } = useParams<{ alunoId: string; planoId: string }>();
  const { usuario } = useSessao();
  const [plano, setPlano] = useState<PlanoTreinoCompleto | null>(null);
  const [aluno, setAluno] = useState<ResumoAluno | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [p, a] = await Promise.all([
          sdk.treinos.obter(alunoId, planoId),
          sdk.alunos.resumo(alunoId),
        ]);
        setPlano(p);
        setAluno(a);
      } catch {
        setErro('Não foi possível carregar este plano.');
      }
    })();
  }, [alunoId, planoId]);

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!plano || !aluno) return <Aviso tipo="info">Carregando…</Aviso>;

  const linhas = (n: number) => Array.from({ length: n }, (_, i) => i);

  return (
    <div className="flex flex-col gap-lg">
      <div data-nao-imprime className="flex flex-wrap items-center justify-between gap-md">
        <Link href={`/alunos/${alunoId}`} className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          ← Voltar para a ficha
        </Link>
        <Botao onClick={() => window.print()}>Salvar em PDF / imprimir</Botao>
      </div>

      <p data-nao-imprime className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
        A impressão abre a janela do navegador — escolha <strong>Salvar como PDF</strong> no destino
        para gerar o arquivo, ou mande direto para a impressora.
      </p>

      <article className="documento flex flex-col gap-lg">
        <header className="sem-quebrar">
          <h1 className="text-2xl font-bold">{plano.nome}</h1>
          <p className="text-lg">{aluno.nome}</p>
          <p className="mt-xs text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            {[
              plano.objetivo,
              `versão ${plano.versao}`,
              `${plano.totalSessoes} ${plano.totalSessoes === 1 ? 'sessão' : 'sessões'}`,
              `por ${plano.personal.nome}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </header>

        {plano.sessoes.map((s) => (
          <Cartao key={s.id} className="sem-quebrar">
            <h2 className="mb-md text-lg font-semibold">{s.nome}</h2>

            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--vv-borda)' }}>
                  <th className="py-xs text-left">Exercício</th>
                  <th className="py-xs text-left">Séries × reps</th>
                  <th className="py-xs text-left">Carga</th>
                  <th className="py-xs text-left">Descanso</th>
                  {/*
                    O cabeçalho diz "feito" e não "carga real": na academia a
                    pessoa anota o que deu, e às vezes o que deu foi menos
                    repetição com a mesma carga.
                  */}
                  <th className="py-xs text-left" style={{ width: '22%' }}>
                    Feito
                  </th>
                </tr>
              </thead>
              <tbody>
                {s.itens.map((i) => (
                  <tr key={i.id} style={{ borderBottom: '1px solid var(--vv-borda)' }}>
                    <td className="py-sm">
                      {i.exercicio.nome}
                      {/* Bi-set e tri-set mudam a execução: sem a marca, viram exercícios soltos. */}
                      {i.supersetGrupo && (
                        <span style={{ color: 'var(--vv-texto-secundario)' }}>
                          {' '}
                          · em sequência ({i.supersetGrupo})
                        </span>
                      )}
                      {i.tecnica && (
                        <span style={{ color: 'var(--vv-texto-secundario)' }}> · {i.tecnica}</span>
                      )}
                      {i.observacao && (
                        <p className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                          {i.observacao}
                        </p>
                      )}
                    </td>
                    <td className="py-sm whitespace-nowrap">
                      {i.series} × {i.repsAlvo}
                    </td>
                    <td className="py-sm whitespace-nowrap">
                      {i.cargaSugeridaKg === null ? '—' : `${i.cargaSugeridaKg} kg`}
                    </td>
                    <td className="py-sm whitespace-nowrap">
                      {i.descansoSeg === null ? '—' : `${i.descansoSeg}s`}
                    </td>
                    {/* Uma linha por série: é assim que a anotação acontece de verdade. */}
                    <td className="py-sm">
                      <span style={{ color: 'var(--vv-texto-secundario)', letterSpacing: '0.15em' }}>
                        {linhas(Math.min(i.series, 5)).map((n) => (
                          <span key={n}>___ </span>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Cartao>
        ))}

        <footer
          className="sem-quebrar border-t pt-md text-xs"
          style={{ borderColor: 'var(--vv-borda)', color: 'var(--vv-texto-secundario)' }}
        >
          <p>
            Documento gerado em{' '}
            {new Date().toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}
            {usuario ? ` por ${usuario.nome}` : ''} · Vívio Fit
          </p>
          {/*
            O papel sai do app e circula sem as travas dele: quem recebe não vê
            a anamnese nem os alertas clínicos que existem na ficha.
          */}
          <p className="mt-xs">
            Prescrição de treino individual, feita para {aluno.nome.split(' ')[0]}. Não deve ser
            usada por outra pessoa.
          </p>
        </footer>
      </article>
    </div>
  );
}
