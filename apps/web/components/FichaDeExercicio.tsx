'use client';

import type { ExercicioResumo } from '@vivio/contracts';
import { useState } from 'react';
import { Aviso, Botao, Cartao, Etiqueta } from './ui';

type Aba = 'RESUMO' | 'INSTRUCOES';

/**
 * Ficha do exercício.
 *
 * Duas abas, e não três como no app que serviu de referência: **Histórico não
 * cabe aqui**. A biblioteca é do profissional e não tem aluno escolhido — o
 * histórico de carga é de uma pessoa, e vive na ficha dela. Uma aba "Histórico"
 * nesta tela ou ficaria vazia ou mostraria o de alguém arbitrário.
 *
 * `Instruções` só aparece quando há passo a passo. Aba vazia é pior que aba
 * ausente: promete conteúdo e entrega decepção.
 */
export function FichaDeExercicio({
  exercicio,
  aoFechar,
  videoUrl,
  aoPedirVideo,
}: {
  exercicio: ExercicioResumo;
  aoFechar: () => void;
  videoUrl?: string | null;
  aoPedirVideo?: () => void;
}) {
  const temPassos = exercicio.passos.length > 0;
  const [aba, setAba] = useState<Aba>('RESUMO');

  return (
    <Cartao>
      <div className="mb-lg flex items-start justify-between gap-md">
        <div>
          <h2 className="text-lg font-semibold">{exercicio.nome}</h2>
          <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            {exercicio.grupoMuscular.replace('_', ' ')}
            {exercicio.equipamento && ` · ${exercicio.equipamento}`}
          </p>
        </div>
        <Botao variante="neutra" onClick={aoFechar}>
          Fechar
        </Botao>
      </div>

      {temPassos && (
        <div
          role="tablist"
          className="mb-lg flex gap-xs border-b"
          style={{ borderColor: 'var(--vv-borda)' }}
        >
          {(
            [
              ['RESUMO', 'Resumo'],
              ['INSTRUCOES', 'Instruções'],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              role="tab"
              aria-selected={aba === valor}
              onClick={() => setAba(valor)}
              className="min-h-toque px-lg font-semibold"
              style={{
                color: aba === valor ? 'var(--vv-primaria-fundo)' : 'var(--vv-texto-secundario)',
                borderBottom: aba === valor ? '2px solid var(--vv-primaria-fundo)' : '2px solid transparent',
              }}
            >
              {rotulo}
            </button>
          ))}
        </div>
      )}

      {aba === 'RESUMO' ? (
        <div className="flex flex-col gap-lg">
          {exercicio.imagemUrl && (
            <figure className="flex flex-col gap-xs">
              <img
                src={exercicio.imagemUrl}
                alt={`Execução do exercício ${exercicio.nome}`}
                className="w-full rounded-md"
                style={{ maxHeight: 360, objectFit: 'contain', background: 'var(--vv-fundo)' }}
              />
              {/*
                O crédito fica colado na imagem, e não no rodapé da página: a
                licença aberta (CC-BY, CC-BY-SA) exige atribuição junto da obra,
                e crédito longe da figura não cumpre isso.
              */}
              {exercicio.imagemCredito && (
                <figcaption className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Imagem: {exercicio.imagemCredito}
                </figcaption>
              )}
            </figure>
          )}

          {exercicio.instrucoes && (
            <div>
              <p className="mb-xs text-sm font-semibold">Atenção na execução</p>
              <p>{exercicio.instrucoes}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-md">
            {exercicio.temVideo ? (
              <>
                <Etiqueta texto="com vídeo" cor="var(--vv-sucesso)" />
                {aoPedirVideo && (
                  <Botao variante="neutra" onClick={aoPedirVideo}>
                    Ver vídeo
                  </Botao>
                )}
              </>
            ) : (
              <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                Sem vídeo demonstrativo
              </span>
            )}
          </div>

          {videoUrl && (
            <figure className="flex flex-col gap-xs">
              <video
                controls
                src={videoUrl}
                className="w-full rounded-md"
                style={{ maxHeight: 420, background: '#000' }}
              />
              {exercicio.videoCredito && (
                <figcaption className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                  Vídeo: {exercicio.videoCredito}
                </figcaption>
              )}
            </figure>
          )}

          {!temPassos && (
            <Aviso tipo="info">
              Este exercício ainda não tem passo a passo. A linha acima é o que orienta a execução.
            </Aviso>
          )}
        </div>
      ) : (
        <ol className="flex flex-col gap-md">
          {exercicio.passos.map((passo, i) => (
            <li key={passo} className="flex gap-md">
              <span
                className="font-semibold tabular-nums"
                style={{ color: 'var(--vv-primaria-fundo)', minWidth: '1.5rem' }}
              >
                {i + 1}.
              </span>
              <span>{passo}</span>
            </li>
          ))}
        </ol>
      )}
    </Cartao>
  );
}
