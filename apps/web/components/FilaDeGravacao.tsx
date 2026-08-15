'use client';

import type { ExercicioAGravar } from '@vivio/contracts';
import { useEffect, useState } from 'react';
import { Aviso, Botao, Cartao, Etiqueta } from './ui';

/**
 * A fila de gravação das demonstrações.
 *
 * Existe porque "gravar o acervo" é um projeto que ninguém termina: são 159
 * exercícios, e uma lista alfabética não diz por onde começar. Aqui a ordem é
 * a das prescrições do próprio profissional — as 15 primeiras cobrem quase
 * todos os treinos que ele passa, e isso é uma tarde de trabalho em vez de um
 * mês.
 *
 * O que ele grava fica; o que ele não grava continua com o vídeo do acervo ou
 * sem nada. Não há estado quebrado no meio do caminho, e é isso que permite
 * parar na décima e voltar semana que vem.
 */
export function FilaDeGravacao({
  aoGravar,
  gravandoId,
  recarregarEm,
}: {
  aoGravar: (exercicioId: string, ehExercicioProprio: boolean) => void;
  gravandoId: string | null;
  /** Muda quando uma gravação termina lá fora, para a fila encurtar sozinha. */
  recarregarEm: number;
}) {
  const [fila, setFila] = useState<ExercicioAGravar[] | null>(null);
  const [erro, setErro] = useState(false);
  const [mostrarTodos, setMostrarTodos] = useState(false);

  useEffect(() => {
    let ativo = true;
    void (async () => {
      try {
        const { sdk } = await import('../lib/sdk');
        const lista = await sdk.exercicios.planoDeGravacao();
        if (!ativo) return;
        setFila(lista);
        setErro(false);
      } catch {
        if (ativo) setErro(true);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [recarregarEm]);

  if (erro) return <Aviso tipo="erro">Não foi possível carregar a fila de gravação.</Aviso>;
  if (!fila) return null;

  /*
    Prescrito ao menos uma vez é o corte que separa "isto os meus alunos fazem"
    de "isto está no catálogo". Sem o corte, a fila volta a ter 159 itens e
    deixa de ser uma fila.
  */
  const usados = fila.filter((e) => e.vezesPrescrito > 0);
  const resto = fila.filter((e) => e.vezesPrescrito === 0);

  /*
    Quem ainda não montou treino nenhum não tem histórico de prescrição — e é
    o caso de TODO profissional no primeiro dia. Mostrar uma fila vazia ali
    esconde o botão de gravar atrás de um link discreto, e a tela passa a
    impressão de que a gravação não existe.

    Sem prescrição, o critério que sobra é a falta de referência: o serviço já
    ordena assim, então os primeiros são exatamente aqueles em que o aluno não
    tem nem imagem para olhar. Um punhado deles é uma tarefa; os 159 seriam a
    mesma lista da biblioteca logo abaixo.
  */
  const semHistorico = usados.length === 0;
  const PRIMEIROS_SEM_HISTORICO = 12;
  const visiveis = mostrarTodos
    ? [...usados, ...resto]
    : semHistorico
      ? resto.slice(0, PRIMEIROS_SEM_HISTORICO)
      : usados;

  if (fila.length === 0) {
    return (
      <Cartao>
        <p className="font-semibold">Acervo gravado.</p>
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          Todos os exercícios da sua biblioteca já têm demonstração sua.
        </p>
      </Cartao>
    );
  }

  return (
    <Cartao>
      <div className="flex flex-wrap items-baseline justify-between gap-md">
        <p className="font-semibold">O que gravar primeiro</p>
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          {semHistorico
            ? `${fila.length} exercícios sem gravação sua`
            : `${usados.length} que você prescreve · ${resto.length} no resto do acervo`}
        </p>
      </div>

      <p className="mt-sm text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
        {semHistorico
          ? 'Você ainda não montou treinos, então a ordem começa pelos que não têm imagem nem vídeo nenhum — onde o aluno executa sem nada para olhar. Depois que você prescrever, a fila passa a seguir o que você mais usa.'
          : 'Em ordem de quanto você prescreve. Os primeiros são os que mais aluno executa sem ninguém olhando — e é onde faltar referência vira risco de lesão.'}
      </p>

      <ul className="mt-lg flex flex-col gap-sm">
        {visiveis.map((e) => (
          <li
            key={e.id}
            className="flex flex-wrap items-center justify-between gap-md border-t pt-sm"
            style={{ borderColor: 'var(--vv-borda)' }}
          >
            <div>
              <p className="font-semibold">{e.nome}</p>
              <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                {e.grupoMuscular.replace('_', ' ')}
                {e.equipamento && ` · ${e.equipamento}`}
                {e.vezesPrescrito > 0 &&
                  (e.vezesPrescrito === 1
                    ? ' · em 1 treino seu'
                    : ` · em ${e.vezesPrescrito} treinos seus`)}
              </p>
            </div>
            <div className="flex items-center gap-md">
              {/*
                Sem imagem nem vídeo o aluno executa por adivinhação. Com
                alguma referência ele pelo menos vê o movimento — a etiqueta
                marca a diferença entre urgente e desejável.
              */}
              {!e.temAlgumaReferencia && <Etiqueta texto="sem referência" cor="var(--vv-erro)" />}
              <Botao
                variante="neutra"
                disabled={gravandoId === e.id}
                onClick={() => aoGravar(e.id, e.escopo === 'PRIVADO')}
              >
                {gravandoId === e.id ? 'Enviando…' : '🎥 Gravar'}
              </Botao>
            </div>
          </li>
        ))}
      </ul>

      {fila.length > visiveis.length || mostrarTodos ? (
        <button
          onClick={() => setMostrarTodos((v) => !v)}
          className="mt-lg min-h-toque text-sm underline"
          style={{ color: 'var(--vv-texto-secundario)' }}
        >
          {mostrarTodos
            ? semHistorico
              ? 'Mostrar só os primeiros'
              : 'Mostrar só o que eu prescrevo'
            : `Ver os outros ${fila.length - visiveis.length} do acervo`}
        </button>
      ) : null}
    </Cartao>
  );
}
