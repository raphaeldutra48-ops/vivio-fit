import type { RegistrarExecucaoInput } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { enfileirar, lerFila, paraEnvio, registrarFalha, remover, type ItemDaFila } from './fila';
import { sdk } from './sdk';

interface Sincronizacao {
  pendentes: ItemDaFila[];
  sincronizando: boolean;
  /** Grava na fila e tenta enviar. Devolve true se o servidor confirmou agora. */
  registrarTreino: (alunoId: string, execucao: RegistrarExecucaoInput) => Promise<boolean>;
  sincronizar: () => Promise<void>;
}

const Contexto = createContext<Sincronizacao | null>(null);

/** De quanto em quanto tempo a fila tenta sozinha, quando há algo pendente. */
const INTERVALO_MS = 30_000;

export function SincronizacaoProvider({ children }: { children: ReactNode }) {
  const [pendentes, setPendentes] = useState<ItemDaFila[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const emCurso = useRef(false);

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
          await sdk.execucoes.registrar(item.alunoId, paraEnvio(item));
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
      return !restante.some((i) => i.clienteUuid === execucao.clienteUuid);
    },
    [sincronizar],
  );

  useEffect(() => {
    void lerFila().then(setPendentes);
    void sincronizar();

    // Voltar para o app é o melhor momento para tentar: normalmente é quando o
    // aluno saiu da academia e reencontrou rede.
    const inscricao = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') void sincronizar();
    });
    const intervalo = setInterval(() => void sincronizar(), INTERVALO_MS);

    return () => {
      inscricao.remove();
      clearInterval(intervalo);
    };
  }, [sincronizar]);

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
