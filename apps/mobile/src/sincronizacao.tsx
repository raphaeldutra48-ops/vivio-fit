import type { ExecucaoResumo, RegistrarExecucaoInput } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { enfileirar, lerFila, paraEnvio, registrarFalha, remover, type ItemDaFila } from './fila';
import { sdk } from './sdk';
import { useSondagem } from './sondagem';

interface Sincronizacao {
  pendentes: ItemDaFila[];
  sincronizando: boolean;
  /**
   * Grava na fila e tenta enviar.
   *
   * Devolve o resumo que o servidor respondeu quando o envio saiu agora, e
   * `null` quando ficou na fila. O resumo importa porque é ele que traz os
   * **recordes** da sessão — eles são apurados no servidor no momento do
   * registro e não ficam guardados em lugar nenhum. Quem treina sem sinal não
   * vê a medalha na hora; ela reaparece em "meus recordes", que é derivado das
   * séries e não depende deste instante.
   */
  registrarTreino: (
    alunoId: string,
    execucao: RegistrarExecucaoInput,
  ) => Promise<ExecucaoResumo | null>;
  sincronizar: () => Promise<void>;
}

const Contexto = createContext<Sincronizacao | null>(null);

/** De quanto em quanto tempo a fila tenta sozinha, quando há algo pendente. */
const INTERVALO_MS = 30_000;

export function SincronizacaoProvider({ children }: { children: ReactNode }) {
  const [pendentes, setPendentes] = useState<ItemDaFila[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const emCurso = useRef(false);

  /*
    Onde ficam os resumos que o servidor devolveu nesta rodada, por
    `clienteUuid`. É um `ref` e não estado: ninguém desenha isto na tela, e
    quem pediu o registro lê o seu logo depois de `sincronizar` voltar.
  */
  const resumos = useRef(new Map<string, ExecucaoResumo>());

  const sincronizar = useCallback(async () => {
    // Uma rodada por vez: duas rodadas simultâneas reenviariam o mesmo item e,
    // apesar de o servidor ser idempotente, gastariam rede à toa.
    if (emCurso.current) return;
    emCurso.current = true;
    setSincronizando(true);

    try {
      let fila = await lerFila();
      for (const item of fila) {
        try {
          const resumo = await sdk.execucoes.registrar(item.alunoId, paraEnvio(item));
          resumos.current.set(item.clienteUuid, resumo);
          // Servidor confirmou (inclusive se respondeu "jaRegistrada"): sai da fila.
          fila = await remover(item.clienteUuid);
        } catch (erro) {
          const api = erro instanceof ErroApi ? erro : null;

          // Erro definitivo (payload inválido, sessão apagada, sem permissão):
          // reenviar não vai resolver. Tira da fila para não travar as outras.
          if (api && !api.ehTemporario && !api.exigeNovoLogin) {
            fila = await remover(item.clienteUuid);
            continue;
          }

          await registrarFalha(item.clienteUuid, api?.codigo ?? 'ERRO_DESCONHECIDO');
          fila = await lerFila();
          break; // sem rede: não adianta tentar os próximos agora
        }
      }
      setPendentes(fila);
    } finally {
      emCurso.current = false;
      setSincronizando(false);
    }
  }, []);

  const registrarTreino = useCallback(
    async (alunoId: string, execucao: RegistrarExecucaoInput) => {
      // Grava PRIMEIRO. Se o envio falhar (ou o app fechar), o treino sobrevive.
      setPendentes(await enfileirar(alunoId, execucao));
      await sincronizar();
      const restante = await lerFila();
      setPendentes(restante);

      const saiuAgora = !restante.some((i) => i.clienteUuid === execucao.clienteUuid);
      const resumo = resumos.current.get(execucao.clienteUuid) ?? null;
      // Consumido uma vez só: o mapa não é histórico, é entrega.
      resumos.current.delete(execucao.clienteUuid);

      return saiuAgora ? resumo : null;
    },
    [sincronizar],
  );

  useEffect(() => {
    void lerFila().then(setPendentes);
    void sincronizar();
  }, [sincronizar]);

  /*
    A cada 30 s enquanto o app está na frente, e nunca em segundo plano.

    Antes o intervalo continuava rodando com o app fechado — celular no bolso
    batendo na API duas vezes por minuto, indefinidamente, de quem não estava
    usando nada. O gancho também dispara ao voltar para a frente, que é o
    melhor momento para tentar de qualquer forma: normalmente é quando o aluno
    saiu da academia e reencontrou rede.
  */
  useSondagem(() => void sincronizar(), INTERVALO_MS);

  return (
    <Contexto.Provider value={{ pendentes, sincronizando, registrarTreino, sincronizar }}>
      {children}
    </Contexto.Provider>
  );
}

export function useSincronizacao(): Sincronizacao {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useSincronizacao precisa estar dentro de <SincronizacaoProvider>');
  return contexto;
}
