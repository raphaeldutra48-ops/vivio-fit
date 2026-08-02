'use client';

import {
  MARCADORES,
  ROTULO_FORCA,
  ROTULO_SISTEMA,
  referenciaDe,
  type Fonte,
} from '@vivio/contracts';
import { useMemo, useState } from 'react';
import { Cartao } from '../../../components/ui';
import { faixaEmTexto } from '../../../lib/exames';

/**
 * Metodologia.
 *
 * **Gerada da mesma tabela que classifica os exames.** Escrita à mão, esta
 * página divergiria da regra que roda — e uma página de metodologia que mente
 * é pior que nenhuma. Se um coeficiente mudar em `REFERENCIAS`, o texto aqui
 * muda junto, sem ninguém lembrar de editar.
 */
export default function Metodologia() {
  const [expandido, setExpandido] = useState<string | null>('faixas');

  const fontes = useMemo(() => {
    const mapa = new Map<string, { fonte: Fonte; usadoEm: string[] }>();
    for (const marcador of MARCADORES) {
      const ref = referenciaDe(marcador);
      for (const fonte of [ref.fonteLaboratorial, ref.fonteFuncional]) {
        const atual = mapa.get(fonte.sigla) ?? { fonte, usadoEm: [] };
        if (!atual.usadoEm.includes(ref.rotulo)) atual.usadoEm.push(ref.rotulo);
        mapa.set(fonte.sigla, atual);
      }
    }
    // Diretriz primeiro: a leitura de cima para baixo é a do peso da evidência.
    const peso = { DIRETRIZ: 0, ESTUDO: 1, CONSENSO_FUNCIONAL: 2 };
    return [...mapa.values()].sort((a, b) => peso[a.fonte.forca] - peso[b.fonte.forca]);
  }, []);

  const porSistema = useMemo(() => {
    const mapa = new Map<string, typeof MARCADORES>();
    for (const marcador of MARCADORES) {
      const sistema = ROTULO_SISTEMA[referenciaDe(marcador).sistema];
      mapa.set(sistema, [...(mapa.get(sistema) ?? []), marcador]);
    }
    return [...mapa.entries()];
  }, []);

  const secao = (chave: string, titulo: string, conteudo: React.ReactNode) => (
    <Cartao key={chave}>
      <button
        onClick={() => setExpandido(expandido === chave ? null : chave)}
        aria-expanded={expandido === chave}
        className="flex w-full items-center justify-between gap-md text-left font-semibold"
      >
        {titulo}
        <span aria-hidden style={{ color: 'var(--vv-texto-secundario)' }}>
          {expandido === chave ? '▲' : '▼'}
        </span>
      </button>
      {expandido === chave && <div className="mt-lg">{conteudo}</div>}
    </Cartao>
  );

  return (
    <div className="flex flex-col gap-lg pb-2xl">
      <div>
        <h1 className="text-2xl font-bold">Metodologia</h1>
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          Como as faixas de análise funcional são definidas, e de onde vem cada uma.
        </p>
      </div>

      {secao(
        'faixas',
        'Como ler as faixas: funcional vs. laboratorial',
        <div className="flex flex-col gap-md text-sm">
          <p>
            A faixa do <strong>laboratório</strong> existe para sinalizar doença. A faixa{' '}
            <strong>funcional</strong> é mais estreita e sinaliza afastamento do ideal. Um valor
            pode estar normal no laudo e ainda assim merecer conversa.
          </p>
          <ul className="flex flex-col gap-xs">
            <li>
              <strong style={{ color: 'var(--vv-erro)' }}>Crítico</strong> — fora da faixa do
              laboratório. É achado clínico.
            </li>
            <li>
              <strong style={{ color: 'var(--vv-alerta)' }}>Atenção</strong> — dentro da faixa do
              laboratório, fora da funcional.
            </li>
            <li>
              <strong style={{ color: 'var(--vv-sucesso)' }}>Ótimo</strong> — dentro da faixa
              funcional.
            </li>
          </ul>
          <p>
            <strong>Nada é classificado como crítico por causa da faixa funcional.</strong> Só sair
            da faixa do laboratório produz esse selo. A faixa funcional distingue &quot;atenção&quot;
            de &quot;ótimo&quot; dentro do que o laudo já considera normal.
          </p>
        </div>,
      )}

      {secao(
        'limites',
        'Limitações e uso responsável desta ferramenta',
        <div className="flex flex-col gap-md text-sm">
          <p>
            As faixas funcionais são referências de otimização, <strong>não</strong> critérios de
            diagnóstico. Nenhum número desta tela substitui avaliação clínica.
          </p>
          <p>
            A força da fonte é exibida em cada faixa. Diretriz de sociedade médica e consenso de
            prática funcional não têm o mesmo peso, e a tela não os apresenta como se tivessem.
          </p>
          <p>
            O acesso é dividido por papel: o nutricionista vê os marcadores da avaliação
            nutricional; tireoide e hormônios sexuais exigem avaliação médica. O personal não
            acessa marcador nenhum.
          </p>
          <p>
            A classificação é gravada no momento do registro. Se uma faixa for revista depois, os
            exames antigos preservam o que foi discutido na consulta.
          </p>
        </div>,
      )}

      {secao(
        'fontes',
        'Principais fontes e organizações de referência',
        <div className="flex flex-col gap-md">
          {fontes.map(({ fonte, usadoEm }) => (
            <div
              key={fonte.sigla}
              className="flex flex-wrap gap-md rounded-md border p-md"
              style={{ borderColor: 'var(--vv-borda)' }}
            >
              <span
                className="rounded-md px-md py-xs text-xs font-semibold"
                style={{
                  background: 'var(--vv-superficie-elevada)',
                  color: 'var(--vv-texto-secundario)',
                  minWidth: 96,
                }}
              >
                {fonte.sigla}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{fonte.organizacao}</p>
                <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  {fonte.documento}
                  {fonte.ano ? `, ${fonte.ano}` : ''}
                  {fonte.pmid ? ` · PMID ${fonte.pmid}` : ''}
                </p>
                <p className="text-xs italic" style={{ color: 'var(--vv-texto-secundario)' }}>
                  {ROTULO_FORCA[fonte.forca]} · Usado em: {usadoEm.join(', ')}
                </p>
              </div>
            </div>
          ))}
        </div>,
      )}

      {secao(
        'tabela',
        'Todas as faixas, marcador por marcador',
        <div className="flex flex-col gap-lg">
          {porSistema.map(([sistema, marcadores]) => (
            <div key={sistema}>
              <p className="mb-sm text-sm font-semibold" style={{ color: 'var(--vv-texto-secundario)' }}>
                {sistema}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: 'var(--vv-texto-secundario)' }}>
                      <th className="p-sm text-left font-normal">Marcador</th>
                      <th className="p-sm text-left font-normal">Laboratório</th>
                      <th className="p-sm text-left font-normal">Funcional</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marcadores.map((m) => {
                      const ref = referenciaDe(m);
                      const faixa = (f: typeof ref.laboratorial) =>
                        'M' in f
                          ? `H: ${faixaEmTexto(f.M, '')} · M: ${faixaEmTexto(f.F, '')}`
                          : faixaEmTexto(f, '');
                      return (
                        <tr key={m} style={{ borderTop: '1px solid var(--vv-borda)' }}>
                          <td className="p-sm">
                            {ref.rotulo}
                            {ref.unidade ? (
                              <span
                                className="ml-xs text-xs"
                                style={{ color: 'var(--vv-texto-secundario)' }}
                              >
                                {ref.unidade}
                              </span>
                            ) : null}
                          </td>
                          <td className="p-sm tabular-nums">{faixa(ref.laboratorial)}</td>
                          <td className="p-sm tabular-nums">{faixa(ref.funcional)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>,
      )}
    </div>
  );
}
