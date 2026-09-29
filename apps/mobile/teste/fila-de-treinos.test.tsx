import type { RegistrarExecucaoInput } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lerFila } from '../src/fila';
import { SincronizacaoProvider, useSincronizacao } from '../src/sincronizacao';

/**
 * A fila de saída dos treinos — o caminho onde "treinou e o sistema não viu"
 * acontece.
 *
 * Academia é o pior lugar de rede que existe: subsolo, paredão, wi-fi de
 * visitante. O aluno termina a série, o envio falha, e a única coisa que separa
 * o treino de sumir é esta fila. Nada disso aparece na tela quando dá errado —
 * é justamente o silêncio que torna a prova necessária.
 *
 * O armazenamento é real (o módulo `fila.ts` de verdade, sobre um AsyncStorage
 * em memória): o que se prova aqui é a **persistência**, e um dublê da fila
 * provaria só que o dublê funciona.
 */
const registrar = vi.fn();

vi.mock('../src/sdk', () => ({
  sdk: { execucoes: { registrar: (...a: unknown[]) => registrar(...a) } },
}));

/** O AsyncStorage do aparelho, em memória — mesmo formato, mesma serialização. */
const aparelho = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (c: string) => Promise.resolve(aparelho.get(c) ?? null),
    setItem: (c: string, v: string) => {
      aparelho.set(c, v);
      return Promise.resolve();
    },
    removeItem: (c: string) => {
      aparelho.delete(c);
      return Promise.resolve();
    },
  },
}));

// A sondagem periódica não interessa aqui, e ligada tornaria o teste lento e
// imprevisível: cada caso chama `sincronizar()` quando quer.
vi.mock('../src/sondagem', () => ({ useSondagem: () => undefined }));

const treino = (uuid: string): RegistrarExecucaoInput =>
  ({
    clienteUuid: uuid,
    sessaoId: 'sessao-1',
    iniciadoEm: new Date('2026-09-29T10:00:00Z'),
    finalizadoEm: new Date('2026-09-29T11:00:00Z'),
    series: [{ itemTreinoId: 'item-1', serieNum: 1, repsFeitas: 10, cargaKg: 40 }],
  }) as unknown as RegistrarExecucaoInput;

const resumoDoServidor = { id: 'exec-1', recordes: [{ tipo: 'CARGA', exercicio: 'Supino' }] };

/** Uma tela mínima que só expõe o que o gancho faz. */
function Tela({ aoRegistrar }: { aoRegistrar?: (r: unknown) => void }) {
  const { pendentes, registrarTreino, sincronizar } = useSincronizacao();
  return (
    <div>
      <span data-testid="pendentes">{pendentes.length}</span>
      <button
        onClick={() => {
          void registrarTreino('aluna-1', treino('uuid-1')).then((r) => aoRegistrar?.(r));
        }}
      >
        registrar
      </button>
      <button onClick={() => void sincronizar()}>sincronizar</button>
    </div>
  );
}

function abrirApp(aoRegistrar?: (r: unknown) => void) {
  return render(
    <SincronizacaoProvider>
      <Tela aoRegistrar={aoRegistrar} />
    </SincronizacaoProvider>,
  );
}

beforeEach(() => {
  aparelho.clear();
  registrar.mockReset();
});

describe('fila de treinos', () => {
  it('com rede: envia, esvazia a fila e entrega os recordes da sessão', async () => {
    /*
      O resumo importa: os recordes são apurados no servidor no instante do
      registro e não ficam guardados em lugar nenhum. Engolir a resposta seria
      tirar a medalha de quem acabou de bater o recorde.
    */
    registrar.mockResolvedValue(resumoDoServidor);
    const recebido = vi.fn();
    abrirApp(recebido);

    screen.getByText('registrar').click();

    await waitFor(() => expect(recebido).toHaveBeenCalledWith(resumoDoServidor));
    expect(await lerFila()).toHaveLength(0);
  });

  it('sem rede: o treino FICA gravado no aparelho, e some da tela nada', async () => {
    registrar.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'Sem rede.', 0));
    const recebido = vi.fn();
    abrirApp(recebido);

    screen.getByText('registrar').click();

    // Devolve `null` — não houve resumo —, mas o treino está salvo.
    await waitFor(() => expect(recebido).toHaveBeenCalledWith(null));
    const fila = await lerFila();
    expect(fila).toHaveLength(1);
    expect(fila[0]!.clienteUuid).toBe('uuid-1');
    expect(fila[0]!.tentativas).toBe(1);
    expect(fila[0]!.ultimoErro).toBe('ERRO_DE_REDE');
  });

  it('a rede volta: a próxima tentativa envia o que estava guardado', async () => {
    registrar.mockRejectedValueOnce(new ErroApi('ERRO_DE_REDE', 'Sem rede.', 0));
    abrirApp();
    screen.getByText('registrar').click();
    await waitFor(async () => expect(await lerFila()).toHaveLength(1));

    registrar.mockResolvedValue(resumoDoServidor);
    screen.getByText('sincronizar').click();

    await waitFor(async () => expect(await lerFila()).toHaveLength(0));
    expect(registrar).toHaveBeenCalledTimes(2);
  });

  it('fechar e reabrir o app não perde o treino guardado', async () => {
    /*
      É o caso real: o aluno sai da academia, o celular fica sem bateria, ele
      abre o app de novo no dia seguinte. A fila mora no aparelho, não na
      memória do processo.
    */
    registrar.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'Sem rede.', 0));
    const primeira = abrirApp();
    screen.getByText('registrar').click();
    await waitFor(async () => expect(await lerFila()).toHaveLength(1));
    primeira.unmount();

    registrar.mockReset();
    registrar.mockResolvedValue(resumoDoServidor);
    abrirApp(); // o provider tenta sincronizar ao montar

    await waitFor(async () => expect(await lerFila()).toHaveLength(0));
    expect(registrar).toHaveBeenCalledTimes(1);
  });

  it('erro definitivo sai da fila, em vez de travá-la para sempre', async () => {
    /*
      Sessão apagada, corpo inválido, sem permissão: reenviar não resolve, e o
      item ficaria na frente bloqueando todos os treinos seguintes — que é
      como uma fila de saída morre em silêncio.
    */
    registrar.mockRejectedValue(new ErroApi('DADOS_INVALIDOS', 'Sessão não existe.', 422));
    abrirApp();

    screen.getByText('registrar').click();

    await waitFor(async () => expect(await lerFila()).toHaveLength(0));
  });

  it('o mesmo treino registrado duas vezes não vira dois na fila', async () => {
    // Toque duplo no botão de finalizar, ou retry da tela. O `clienteUuid` é a
    // identidade do treino, e é ele que o servidor usa para não duplicar.
    registrar.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'Sem rede.', 0));
    abrirApp();

    screen.getByText('registrar').click();
    await waitFor(async () => expect(await lerFila()).toHaveLength(1));
    screen.getByText('registrar').click();

    await waitFor(() => expect(registrar).toHaveBeenCalledTimes(2));
    expect(await lerFila()).toHaveLength(1);
  });
});
