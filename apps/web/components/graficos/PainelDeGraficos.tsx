'use client';

import type { EvolucaoCorporal, ExecucaoResumo, HistoricoCarga } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { useEffect, useState } from 'react';
import { comoPontos, rotuloDaSemana, treinosPorSemana } from '../../lib/graficos';
import { useModoDiscreto } from '../../lib/modo-discreto';
import { sdk } from '../../lib/sdk';
import { Aviso, Cartao, EstadoVazio, Explicacao } from '../ui';
import { GraficoDeBarras } from './GraficoDeBarras';
import { GraficoDeLinha } from './GraficoDeLinha';

/**
 * Os gráficos da ficha do aluno.
 *
 * O painel de progresso ao lado já mostrava os números — 9 treinos, 22.695 kg
 * de volume, 102 → 110 kg. Número diz o quanto; forma diz o caminho. "Subiu
 * 7%" não distingue quem subiu de pouco em pouco de quem subiu tudo numa
 * semana e estacionou, e é essa diferença que muda a conduta.
 *
 * Três gráficos aqui e um na dieta, porque o quarto (macros) pertence a onde a
 * dieta está. Juntar tudo numa aba de "relatórios" separaria o gráfico da
 * decisão que ele informa.
 */

const SEMANAS_NO_GRAFICO = 8;

/**
 * O que aparece no lugar de um gráfico de composição corporal com o modo
 * discreto ligado.
 *
 * Um `•••` não serve aqui: a forma da linha revela tanto quanto o eixo. Quem
 * olha por cima do ombro vê a curva descer e já sabe o que aconteceu, mesmo sem
 * ler um número.
 */
function TalvezOculto({ oQue, children }: { oQue: string; children: React.ReactNode }) {
  const { discreto } = useModoDiscreto();
  if (!discreto) return <>{children}</>;

  return (
    <>
      <div
        data-nao-imprime
        className="grid place-items-center rounded-md px-md py-xl text-center text-sm"
        style={{ background: 'var(--vv-superficie-elevada)', color: 'var(--vv-texto-secundario)' }}
      >
        <p>
          <span aria-hidden>🙈 </span>
          {oQue} oculto pelo modo discreto.
        </p>
      </div>
      {/* Mesma regra do `Sensivel`: no papel, o gráfico de verdade. */}
      <div data-so-imprime>{children}</div>
    </>
  );
}

export function PainelDeGraficos({ alunoId, dias }: { alunoId: string; dias: number }) {
  const [evolucao, setEvolucao] = useState<EvolucaoCorporal | null>(null);
  const [execucoes, setExecucoes] = useState<ExecucaoResumo[] | null>(null);
  const [carga, setCarga] = useState<HistoricoCarga | null>(null);
  const [semAutorizacao, setSemAutorizacao] = useState(false);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    /*
      Guarda de cancelamento: trocar 30 → 90 dias rápido faria a resposta lenta
      da janela anterior sobrescrever a atual, e a tela mostraria o gráfico de
      um período com o botão de outro marcado.
    */
    let ativo = true;

    void (async () => {
      try {
        const [corpo, feitos, progresso] = await Promise.all([
          sdk.medidas.evolucao(alunoId, { limit: 60 }),
          // 60 treinos cobrem as 8 semanas com folga, mesmo em quem treina 6x.
          sdk.execucoes.listar(alunoId, 60),
          sdk.progresso.painel(alunoId, dias),
        ]);
        if (!ativo) return;

        setEvolucao(corpo);
        setExecucoes(feitos);
        setErro(false);
        setSemAutorizacao(false);

        /*
          O exercício que mais evoluiu é o que vale desenhar: é sobre ele que a
          conversa acontece. Sem histórico de carga no período, não há gráfico
          e a seção some — melhor do que um eixo vazio.
        */
        const destaque = progresso.cargas[0];
        if (destaque) {
          const historico = await sdk.execucoes.historicoDeCarga(alunoId, destaque.exercicioId, 20);
          if (ativo) setCarga(historico);
        } else if (ativo) {
          setCarga(null);
        }
      } catch (e) {
        if (!ativo) return;
        if (e instanceof ErroApi && e.codigo === 'CONSENTIMENTO_AUSENTE') setSemAutorizacao(true);
        else setErro(true);
      }
    })();

    return () => {
      ativo = false;
    };
  }, [alunoId, dias]);

  // A falta de autorização já é dita pelo painel de progresso logo acima;
  // repetir aqui ocuparia espaço com a mesma informação.
  if (semAutorizacao) return null;
  if (erro) return <Aviso tipo="erro">Não foi possível carregar os gráficos.</Aviso>;
  if (!evolucao || !execucoes) return null;

  const peso = evolucao.series.find((s) => s.metrica === 'PESO');
  const gordura = evolucao.series.find((s) => s.metrica === 'GORDURA_PERCENTUAL');
  const semanas = treinosPorSemana(execucoes, SEMANAS_NO_GRAFICO);
  const treinouAlgumaSemana = semanas.some((s) => s.treinos > 0);

  return (
    <section className="flex flex-col gap-md">
      <h2 className="text-lg font-semibold">Evolução em gráfico</h2>

      <div className="grid gap-md lg:grid-cols-2">
        {peso && peso.pontos.length >= 2 && (
          <Cartao>
            <p className="mb-md font-semibold">
              Peso corporal{' '}
              <span className="font-normal" style={{ color: 'var(--vv-texto-secundario)' }}>
                · {peso.unidade}
              </span>
            </p>
            <TalvezOculto oQue="Peso corporal">
              <GraficoDeLinha
                pontos={comoPontos(peso.pontos)}
                unidade={peso.unidade}
                cor="var(--vv-area-treino)"
                descricao={`Evolução do peso corporal em ${peso.pontos.length} medições`}
              />
            </TalvezOculto>
          </Cartao>
        )}

        {gordura && gordura.pontos.length >= 2 && (
          <Cartao>
            <p className="mb-md font-semibold">
              Percentual de gordura{' '}
              <span className="font-normal" style={{ color: 'var(--vv-texto-secundario)' }}>
                · {gordura.unidade}
              </span>
            </p>
            <TalvezOculto oQue="Percentual de gordura">
              <GraficoDeLinha
                pontos={comoPontos(gordura.pontos)}
                unidade={gordura.unidade}
                cor="var(--vv-area-nutricao)"
                descricao={`Evolução do percentual de gordura em ${gordura.pontos.length} medições`}
              />
            </TalvezOculto>
          </Cartao>
        )}

        <Cartao>
          <p className="mb-md flex items-center gap-xs font-semibold">
            Treinos por semana
            <Explicacao termo="Treinos por semana">
              Cada barra é uma semana começando na segunda-feira. Semana sem treino aparece como
              barra zerada de propósito — omiti-la daria impressão de constância que não houve.
            </Explicacao>
          </p>
          {treinouAlgumaSemana ? (
            <GraficoDeBarras
              descricao={`Treinos realizados nas últimas ${SEMANAS_NO_GRAFICO} semanas`}
              barras={semanas.map((s) => ({
                rotulo: rotuloDaSemana(s.semana),
                valor: s.treinos,
                detalhe: s.treinos === 1 ? '1 treino' : `${s.treinos} treinos`,
                cor: 'var(--vv-area-treino)',
              }))}
            />
          ) : (
            <EstadoVazio
              icone="🏋️"
              titulo={`Nenhum treino nas últimas ${SEMANAS_NO_GRAFICO} semanas`}
              descricao="O aluno registra o treino no aplicativo dele, ao terminar cada sessão. Se ele está treinando e nada aparece aqui, vale conferir se o plano ativo é o certo."
            />
          )}
        </Cartao>

        {carga && carga.pontos.length >= 2 && (
          <Cartao>
            <p className="mb-md font-semibold">
              Carga em {carga.exercicioNome}{' '}
              <span className="font-normal" style={{ color: 'var(--vv-texto-secundario)' }}>
                · 1RM estimado
              </span>
            </p>
            <GraficoDeLinha
              pontos={carga.pontos.map((p) => ({ data: p.data, valor: p.estimativa1rmKg }))}
              unidade="kg"
              cor="var(--vv-area-consultoria)"
              descricao={`Progressão de carga em ${carga.exercicioNome}, por 1RM estimado`}
            />
            {/*
              O 1RM é conta, não medição: quem levantou 80 kg por 10 nunca
              tentou o máximo. Dizer isso evita que o número vire promessa.
            */}
            <p className="mt-sm text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
              Estimativa pela fórmula de Epley, a partir da carga e das repetições feitas — não é
              um teste de carga máxima.
            </p>
          </Cartao>
        )}
      </div>
    </section>
  );
}
