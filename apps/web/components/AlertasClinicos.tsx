'use client';

import { ROTULO_SEVERIDADE, SeveridadeAlerta, type AlertaResumo } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { sdk } from '../lib/sdk';
import { Aviso, Botao, Cartao } from './ui';

const COR_DA_SEVERIDADE: Record<SeveridadeAlerta, string> = {
  ALTA: 'var(--vv-erro)',
  MEDIA: 'var(--vv-alerta)',
};

/**
 * Alertas cruzados na ficha do aluno.
 *
 * O personal vê esta seção e não vê exame nenhum — é justamente o ponto. O que
 * chega aqui já vem sem marcador e sem valor para quem não pode vê-los; a tela
 * não decide nada disso, só exibe o que o servidor mandou.
 */
export function AlertasClinicos({
  alunoId,
  atualizarEm = 0,
}: {
  alunoId: string;
  /**
   * Muda quando as condições do aluno mudam, para esta lista buscar de novo.
   *
   * Sem isso, dar alta numa condição deixava o alerta dela na tela até alguém
   * recarregar a página — e clicar em "marcar como visto" num alerta que o
   * servidor já apagou responde 404.
   */
  atualizarEm?: number;
}) {
  const [alertas, setAlertas] = useState<AlertaResumo[]>([]);
  const [semConsentimento, setSemConsentimento] = useState(false);
  /*
    Não poder ver é diferente de não ter conseguido buscar.

    O `.catch` mandava QUALQUER erro para `semConsentimento`, e com ele a seção
    desaparecia: um tropeço de rede fazia a ficha do aluno abrir sem alertas
    clínicos nenhum, no meio de um atendimento, e a ausência se lê como "não há
    alerta". Aqui isso não é um incômodo de interface — é a parte da tela que
    existe para avisar que algo precisa de olhar.
  */
  const [falhou, setFalhou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocultarResolvidos, setOcultarResolvidos] = useState(true);

  useEffect(() => {
    setFalhou(false);
    sdk.alertas
      .listar(alunoId)
      .then((lista) => {
        setAlertas(lista);
        setSemConsentimento(false);
        setFalhou(false);
      })
      // 403 aqui é informação, não falha: pode ser papel sem alerta ou falta de
      // consentimento clínico. Nos dois casos a seção simplesmente não aparece.
      .catch((e: unknown) => {
        if (e instanceof ErroApi && e.status === 403) setSemConsentimento(true);
        else setFalhou(true);
      });
  }, [alunoId, atualizarEm]);

  async function reconhecer(id: string) {
    try {
      const atualizado = await sdk.alertas.reconhecer(alunoId, id);
      setAlertas((atual) => atual.map((a) => (a.id === id ? atualizado : a)));
      setErro(null);
    } catch {
      /*
        O botão falhava calado: o alerta continuava pendente e a tela não mudava
        nada. Quem clicou acha que marcou como visto, e o alerta volta a cobrar
        atenção na próxima abertura — ou pior, não volta a ser olhado.
      */
      setErro('Não foi possível marcar este alerta como visto. Ele continua pendente.');
    }
  }

  if (semConsentimento) return null;

  if (falhou) {
    return (
      <section>
        <Aviso tipo="erro">
          Não deu para buscar os alertas clínicos agora. Esta seção pode estar incompleta —
          recarregue a página antes de concluir que não há nada a olhar.
        </Aviso>
      </section>
    );
  }

  if (alertas.length === 0) return null;

  const pendentes = alertas.filter((a) => a.reconhecidoEm === null);
  const visiveis = ocultarResolvidos ? pendentes : alertas;

  return (
    <section>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className="mb-md flex flex-wrap items-center justify-between gap-md">
        <h2 className="text-lg font-semibold">
          Alertas clínicos
          {pendentes.length > 0 && (
            <span className="ml-sm text-sm font-normal" style={{ color: 'var(--vv-texto-secundario)' }}>
              {pendentes.length} {pendentes.length === 1 ? 'pendente' : 'pendentes'}
            </span>
          )}
        </h2>
        {alertas.length > pendentes.length && (
          <button
            onClick={() => setOcultarResolvidos((v) => !v)}
            className="text-sm underline"
            style={{ color: 'var(--vv-texto-secundario)' }}
          >
            {ocultarResolvidos ? 'Mostrar os já vistos' : 'Ocultar os já vistos'}
          </button>
        )}
      </div>

      {visiveis.length === 0 ? (
        <Aviso tipo="info">Nenhum alerta pendente.</Aviso>
      ) : (
        <div className="flex flex-col gap-md">
          {visiveis.map((alerta) => {
            const cor = COR_DA_SEVERIDADE[alerta.severidade];
            const visto = alerta.reconhecidoEm !== null;

            return (
              <Cartao key={alerta.id}>
                <div className="flex flex-wrap items-start justify-between gap-md">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-sm font-semibold">
                      <span
                        aria-hidden
                        className="inline-block rounded-pill"
                        style={{ width: 10, height: 10, background: visto ? 'var(--vv-borda)' : cor }}
                      />
                      {alerta.titulo}
                      <span
                        className="rounded-pill px-md py-xs text-xs font-normal"
                        style={{ color: visto ? 'var(--vv-texto-secundario)' : cor, border: `1px solid ${visto ? 'var(--vv-borda)' : cor}` }}
                      >
                        {ROTULO_SEVERIDADE[alerta.severidade]}
                      </span>
                    </p>
                    <p className="mt-xs text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                      {alerta.orientacao}
                    </p>

                    {/* Só aparece para quem pode ver a origem — o servidor decide. */}
                    {alerta.exameId && (
                      <Link
                        href={`/alunos/${alunoId}/exames/${alerta.exameId}`}
                        className="mt-xs inline-block text-sm underline"
                        style={{ color: 'var(--vv-texto-secundario)' }}
                      >
                        Ver o exame de origem
                      </Link>
                    )}

                    {visto && (
                      <p className="mt-xs text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                        Visto por {alerta.reconhecidoPor?.nome ?? 'você'} em{' '}
                        {new Date(alerta.reconhecidoEm!).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>

                  {!visto && (
                    <Botao variante="neutra" onClick={() => void reconhecer(alerta.id)}>
                      Marcar como visto
                    </Botao>
                  )}
                </div>
              </Cartao>
            );
          })}
        </div>
      )}
    </section>
  );
}
