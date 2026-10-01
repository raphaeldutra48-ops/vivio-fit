import type { RegistrarExecucaoInput } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  descartar,
  enfileirar,
  esquecerDescartado,
  lerDescartados,
  lerFila,
  reenfileirar,
} from '../src/fila';
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
  const { pendentes, descartados, registrarTreino, sincronizar, tentarDeNovo } =
    useSincronizacao();
  return (
    <div>
      <span data-testid="pendentes">{pendentes.length}</span>
      {/*
        Os descartados entram na tela mínima porque a prova que faltava é de
        COSTURA: a recusa definitiva acontece dentro do provedor, e testar
        `descartar()` sozinho não garante que o provedor o chame. Uma mutação
        trocando `descartar` por `remover` passou por todas as provas anteriores.
      */}
      <span data-testid="descartados">{descartados.length}</span>
      <span data-testid="motivos">{descartados.map((d) => d.motivo).join(',')}</span>
      <button onClick={() => void tentarDeNovo(descartados[0]?.clienteUuid ?? '')}>
        tentar de novo
      </button>
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

describe('a costura entre a recusa definitiva e o descarte', () => {
  it('erro definitivo move o treino para os descartados, com o código do servidor', async () => {
    /*
      A prova que faltava, e que uma mutação revelou: trocar `descartar` por
      `remover` dentro do provedor passava por todas as outras. Aqui o caminho é
      o inteiro — registra, o servidor recusa de vez, e o treino tem de SAIR da
      fila e APARECER nos descartados.
    */
    registrar.mockRejectedValue(new ErroApi('CONSENTIMENTO_AUSENTE', 'sem autorização', 403));
    abrirApp();

    fireEvent.click(screen.getByText('registrar'));

    await waitFor(() => expect(screen.getByTestId('descartados')).toHaveTextContent('1'));
    expect(screen.getByTestId('pendentes')).toHaveTextContent('0');
    expect(screen.getByTestId('motivos')).toHaveTextContent('CONSENTIMENTO_AUSENTE');
  });

  it('erro TEMPORÁRIO não descarta: o treino fica na fila', async () => {
    // O outro lado da regra. Sem rede, o treino espera — descartar aqui seria
    // perder treino por causa de sinal fraco.
    registrar.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'sem rede', 0));
    abrirApp();

    fireEvent.click(screen.getByText('registrar'));

    await waitFor(() => expect(screen.getByTestId('pendentes')).toHaveTextContent('1'));
    expect(screen.getByTestId('descartados')).toHaveTextContent('0');
  });

  it('tentar de novo devolve à fila e reenvia — e some dos descartados quando aceito', async () => {
    registrar.mockRejectedValue(new ErroApi('CONSENTIMENTO_AUSENTE', 'sem autorização', 403));
    abrirApp();
    fireEvent.click(screen.getByText('registrar'));
    await waitFor(() => expect(screen.getByTestId('descartados')).toHaveTextContent('1'));

    // A causa foi resolvida: o aluno autorizou de novo.
    registrar.mockResolvedValue(resumoDoServidor);
    fireEvent.click(screen.getByText('tentar de novo'));

    await waitFor(() => expect(screen.getByTestId('descartados')).toHaveTextContent('0'));
    expect(screen.getByTestId('pendentes')).toHaveTextContent('0');
  });
});

describe('treino recusado de vez não desaparece', () => {
  /*
    O defeito que estas provas fixam, e o mais caro do aplicativo.

    Quando o servidor recusa definitivamente — consentimento retirado, sessão que
    não existe mais, dado que o schema não aceita — reenviar não resolve, e o item
    tem de sair da fila para não travar os outros. A sincronização fazia isso
    APAGANDO: o aviso "1 treino aguardando envio" desaparecia, e contador em zero
    é a mesma tela de "tudo enviado". A pessoa acreditava que uma hora de academia
    tinha subido, e nem ela nem o profissional ficavam sabendo que não.
  */
  it('descartar tira da fila e guarda com o motivo', async () => {
    await enfileirar('aluna-1', treino('uuid-recusado'));

    const filaDepois = await descartar('uuid-recusado', 'CONSENTIMENTO_AUSENTE');

    expect(filaDepois).toHaveLength(0);
    const descartados = await lerDescartados();
    expect(descartados).toHaveLength(1);
    expect(descartados[0]!.motivo).toBe('CONSENTIMENTO_AUSENTE');
    // E o treino inteiro continua ali: é o que permite tentar de novo depois.
    expect(descartados[0]!.execucao.series).toHaveLength(1);
  });

  it('o mesmo treino descartado duas vezes não vira duas linhas', async () => {
    // Acontece com quem toca "tentar de novo" e recebe a mesma recusa.
    await enfileirar('aluna-1', treino('uuid-1'));
    await descartar('uuid-1', 'CONSENTIMENTO_AUSENTE');
    await enfileirar('aluna-1', treino('uuid-1'));
    await descartar('uuid-1', 'CONSENTIMENTO_AUSENTE');

    expect(await lerDescartados()).toHaveLength(1);
  });

  it('reenfileirar devolve o treino para a fila, e ele sai dos descartados', async () => {
    /*
      A causa mais comum de descarte é reversível: o aluno desligou o
      compartilhamento de treino, o envio foi recusado, e depois ele ligou de
      novo. Sem este caminho o treino ficaria guardado para sempre sem chance de
      subir.
    */
    await enfileirar('aluna-1', treino('uuid-1'));
    await descartar('uuid-1', 'CONSENTIMENTO_AUSENTE');

    const fila = await reenfileirar('uuid-1');

    expect(fila.map((i) => i.clienteUuid)).toEqual(['uuid-1']);
    expect(await lerDescartados()).toHaveLength(0);
  });

  it('esquecer apaga só o escolhido', async () => {
    await enfileirar('aluna-1', treino('uuid-1'));
    await descartar('uuid-1', 'DADOS_INVALIDOS');
    await enfileirar('aluna-1', treino('uuid-2'));
    await descartar('uuid-2', 'DADOS_INVALIDOS');

    const restantes = await esquecerDescartado('uuid-1');

    expect(restantes.map((d) => d.clienteUuid)).toEqual(['uuid-2']);
  });

  it('reenfileirar algo que não existe não quebra nem inventa item', async () => {
    const fila = await reenfileirar('uuid-que-nunca-existiu');

    expect(fila).toHaveLength(0);
    expect(await lerDescartados()).toHaveLength(0);
  });
});
