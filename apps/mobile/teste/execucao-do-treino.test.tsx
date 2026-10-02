import { obterTema } from '@vivio/ui-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { alertas, mudarEstadoDoApp, responderAlerta } from './preparo';

/**
 * A tela de executar o treino — a razão de o aplicativo existir.
 *
 * É a única usada COM O CELULAR NA MÃO, no subsolo da academia, entre uma série
 * e outra: sem rede, com o app indo e voltando do segundo plano, e com números
 * digitados em teclado de vidro com a mão suada. Tudo o que ela decide é caro
 * de errar, porque o que sai daqui vira o histórico em cima do qual o personal
 * ajusta a carga da semana seguinte.
 *
 * As provas cobrem quatro coisas, e nenhuma é aparência:
 *
 * 1. **O que sai.** Só as séries marcadas, com os números que a pessoa digitou
 *    — inclusive com VÍRGULA, que é como se escreve decimal aqui.
 * 2. **O que não se perde.** O treino interrompido volta com a mesma identidade
 *    (senão o servidor grava duas execuções), e o rascunho não ressuscita
 *    depois do envio.
 * 3. **O que acontece sem rede.** O treino vai para a fila, a tela avisa, e o
 *    cardio — que precisa do id da execução — diz onde lançar em vez de sumir.
 * 4. **O que a tela diz quando não dá para abrir.** Sem plano e sem cópia, e
 *    sessão que não é do plano, são frases diferentes.
 *
 * O que ela NÃO cobre: gesto, teclado nativo e o encerramento real do processo
 * pelo Android. Para isso não há substituto a um aparelho.
 */
const obterAtivo = vi.fn();
const anteriores = vi.fn();
const midiaDeExercicios = vi.fn();
const registrarCardio = vi.fn();
const registrarTreino = vi.fn();

const lerPlano = vi.fn();
const salvarPlano = vi.fn();
const lerAnteriores = vi.fn();
const salvarAnteriores = vi.fn();
const lerRascunho = vi.fn();
const salvarRascunho = vi.fn();
const descartarRascunho = vi.fn();

vi.mock('../src/sdk', () => ({
  sdk: {
    treinos: { obterAtivo: (...a: unknown[]) => obterAtivo(...a) },
    execucoes: { anteriores: (...a: unknown[]) => anteriores(...a) },
    exercicios: {
      midia: (...a: unknown[]) => midiaDeExercicios(...a),
      urlDoVideo: vi.fn(() => Promise.resolve({ url: null })),
    },
    cardio: { registrar: (...a: unknown[]) => registrarCardio(...a) },
  },
}));

vi.mock('../src/sincronizacao', () => ({
  useSincronizacao: () => ({ registrarTreino, sincronizar: vi.fn(), pendentes: [] }),
}));

vi.mock('../src/cacheTreino', () => ({
  lerPlano: (...a: unknown[]) => lerPlano(...a),
  salvarPlano: (...a: unknown[]) => salvarPlano(...a),
  lerAnteriores: (...a: unknown[]) => lerAnteriores(...a),
  salvarAnteriores: (...a: unknown[]) => salvarAnteriores(...a),
}));

vi.mock('../src/rascunhoTreino', () => ({
  lerRascunho: (...a: unknown[]) => lerRascunho(...a),
  salvarRascunho: (...a: unknown[]) => salvarRascunho(...a),
  descartarRascunho: (...a: unknown[]) => descartarRascunho(...a),
}));

const navegador = { push: vi.fn(), replace: vi.fn(), back: vi.fn() };

/*
  A rota traz o id da sessão, e é ele que decide qual treino abre — o dublê
  global do `preparo` devolve parâmetros vazios, que aqui significaria "sessão
  não encontrada".
*/
vi.mock('expo-router', () => ({
  useRouter: () => navegador,
  useLocalSearchParams: () => ({ sessaoId: 'sessao-1' }),
  Stack: { Screen: () => null },
  Link: ({ children }: { children?: unknown }) => children,
}));

const usuario = { id: 'aluna-1', nome: 'Ana Souza', email: 'ana@exemplo.com', papel: 'ALUNO' };
const sessao = { tema: obterTema('claro'), nomeDoTema: 'claro', usuario, carregando: false };
vi.mock('../src/sessao', () => ({ useSessao: () => sessao }));

const exercicio = {
  id: 'ex-1',
  nome: 'Supino reto',
  grupo: 'PEITO',
  equipamento: 'BARRA',
  temVideo: false,
  videoExternoUrl: null,
  instrucoes: null,
  passos: [],
};

const plano = {
  id: 'plano-1',
  nome: 'Hipertrofia A/B',
  sessoes: [
    {
      id: 'sessao-1',
      nome: 'Treino A',
      ordem: 1,
      itens: [
        {
          id: 'item-1',
          ordem: 1,
          series: 2,
          repsAlvo: '8-12',
          cargaSugeridaKg: 40,
          descansoSeg: 60,
          observacao: null,
          exercicio,
        },
      ],
    },
  ],
};

const textoDaTela = () => document.body.textContent ?? '';

async function abrirTela() {
  const { default: Execucao } = await import('../app/execucao/[sessaoId]');
  return render(<Execucao />);
}

/** Espera a tela sair de "Carregando treino…". */
async function telaPronta(): Promise<void> {
  await waitFor(() => expect(screen.getByText('Supino reto')).toBeInTheDocument());
}

function digitar(rotulo: RegExp, valor: string): void {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
}

/** Marca a série, abre o feedback e envia — o caminho que a pessoa percorre. */
async function concluirTreino(): Promise<void> {
  fireEvent.click(screen.getByLabelText(/concluir treino/i));
  await waitFor(() => expect(screen.getByText('Enviar')).toBeInTheDocument());
  fireEvent.click(screen.getByLabelText(/concluir treino/i));
}

/** As séries como o rascunho as guarda: já com trabalho feito. */
const seriesComTrabalho = [
  {
    chave: 'item-1-1',
    itemTreinoId: 'item-1',
    exercicioId: 'ex-1',
    serieNum: 1,
    tipo: 'NORMAL',
    repsFeitas: '10',
    cargaKg: '42,5',
    concluida: true,
  },
  {
    chave: 'item-1-2',
    itemTreinoId: 'item-1',
    exercicioId: 'ex-1',
    serieNum: 2,
    tipo: 'NORMAL',
    repsFeitas: '',
    cargaKg: '40',
    concluida: false,
  },
];

beforeEach(() => {
  alertas.length = 0;
  obterAtivo.mockResolvedValue(plano);
  salvarPlano.mockResolvedValue(undefined);
  lerPlano.mockResolvedValue(null);
  anteriores.mockResolvedValue({ porExercicio: {} });
  salvarAnteriores.mockResolvedValue(undefined);
  lerAnteriores.mockResolvedValue(null);
  midiaDeExercicios.mockResolvedValue({});
  lerRascunho.mockResolvedValue(null);
  salvarRascunho.mockResolvedValue(undefined);
  descartarRascunho.mockResolvedValue(undefined);
  registrarTreino.mockResolvedValue({ id: 'execucao-1', recordes: [] });
  registrarCardio.mockResolvedValue(undefined);
});

describe('execução do treino: o que sai do aparelho', () => {
  it('carga com VÍRGULA chega como número — 22,5 e não NaN', async () => {
    /*
      O defeito que esta prova fixa, e o mais caro da tela: o teclado decimal
      daqui oferece vírgula, `Number('22,5')` é `NaN`, e NaN vira `null` no
      JSON. O treino inteiro era recusado no fim, depois de uma hora de
      academia, com a frase "não foi possível salvar o treino no aparelho" —
      que não diz a ninguém que o problema foi a vírgula.
    */
    await abrirTela();
    await telaPronta();
    digitar(/carga em quilos da série 1/i, '22,5');
    digitar(/repetições da série 1/i, '10');
    fireEvent.click(screen.getByLabelText(/concluir série 1 de supino reto/i));

    await concluirTreino();

    await waitFor(() => expect(registrarTreino).toHaveBeenCalled());
    const [, execucao] = registrarTreino.mock.calls[0] as [string, { series: unknown[] }];
    expect(execucao.series).toEqual([
      expect.objectContaining({ cargaKg: 22.5, repsFeitas: 10, serieNum: 1 }),
    ]);
  });

  it('só as séries marcadas vão — as em branco não entram no histórico', async () => {
    /*
      Série que ninguém fez entrando no histórico é pior que série faltando: o
      personal ajusta a carga da semana seguinte em cima dela.
    */
    await abrirTela();
    await telaPronta();
    digitar(/carga em quilos da série 2/i, '50');
    fireEvent.click(screen.getByLabelText(/concluir série 2 de supino reto/i));

    await concluirTreino();

    await waitFor(() => expect(registrarTreino).toHaveBeenCalled());
    const [, execucao] = registrarTreino.mock.calls[0] as [string, { series: { serieNum: number }[] }];
    expect(execucao.series).toHaveLength(1);
    expect(execucao.series[0]!.serieNum).toBe(2);
  });

  it('sem nenhuma série marcada, pergunta antes e não manda nada', async () => {
    await abrirTela();
    await telaPronta();

    await concluirTreino();

    await waitFor(() => expect(alertas).toHaveLength(1));
    expect(alertas[0]!.titulo).toMatch(/nenhuma série concluída/i);
    expect(registrarTreino).not.toHaveBeenCalled();
  });
});

describe('execução do treino: o que não se perde', () => {
  it('o treino interrompido volta com a MESMA identidade', async () => {
    /*
      O `clienteUuid` é o que impede o servidor de gravar duas execuções quando
      o primeiro envio saiu e o app morreu antes de saber. Se a retomada
      gerasse um id novo, o treino entraria duas vezes no histórico — e ninguém
      apaga isso sem falar com o suporte.
    */
    lerRascunho.mockResolvedValue({
      sessaoId: 'sessao-1',
      clienteUuid: 'uuid-do-treino-interrompido',
      iniciadoEm: '2026-09-29T18:00:00.000Z',
      series: seriesComTrabalho,
    });
    await abrirTela();
    await telaPronta();

    await concluirTreino();

    await waitFor(() => expect(registrarTreino).toHaveBeenCalled());
    const [, execucao] = registrarTreino.mock.calls[0] as [
      string,
      { clienteUuid: string; iniciadoEm: Date; series: { cargaKg: number }[] },
    ];
    expect(execucao.clienteUuid).toBe('uuid-do-treino-interrompido');
    // E o relógio continua de onde parou, senão 40 minutos de treino viram 2.
    expect(execucao.iniciadoEm.toISOString()).toBe('2026-09-29T18:00:00.000Z');
    // A carga digitada com vírgula antes da interrupção sobrevive à volta.
    expect(execucao.series[0]!.cargaKg).toBe(42.5);
  });

  it('a retomada é ANUNCIADA, com o horário de quando começou', async () => {
    /*
      Recuperar em silêncio assusta: a pessoa abre o app depois de o sistema
      tê-lo encerrado, encontra séries marcadas e não sabe se são dela.
    */
    lerRascunho.mockResolvedValue({
      sessaoId: 'sessao-1',
      clienteUuid: 'uuid-1',
      iniciadoEm: new Date().toISOString(),
      series: seriesComTrabalho,
    });
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toMatch(/retomando o treino que você começou às/i));
  });

  it('"começar do zero" pergunta antes, e limpa o que estava marcado', async () => {
    lerRascunho.mockResolvedValue({
      sessaoId: 'sessao-1',
      clienteUuid: 'uuid-1',
      iniciadoEm: new Date().toISOString(),
      series: seriesComTrabalho,
    });
    await abrirTela();
    await telaPronta();
    await waitFor(() => expect(textoDaTela()).toMatch(/1\/2 séries/));

    fireEvent.click(screen.getByText('Começar do zero'));
    await waitFor(() => expect(alertas).toHaveLength(1));
    // Até aqui nada foi apagado: a pergunta é a proteção.
    expect(textoDaTela()).toMatch(/1\/2 séries/);
    responderAlerta('começar do zero');

    await waitFor(() => expect(textoDaTela()).toMatch(/0\/2 séries/));
    expect(descartarRascunho).toHaveBeenCalledWith('aluna-1');
  });

  it('rascunho sem trabalho nenhum não vira aviso de retomada', async () => {
    // Anunciar "retomando" numa tela idêntica à que o plano geraria confunde
    // quem acabou de abrir, e ensina a ignorar o aviso quando ele importa.
    lerRascunho.mockResolvedValue({
      sessaoId: 'sessao-1',
      clienteUuid: 'uuid-1',
      iniciadoEm: new Date().toISOString(),
      series: seriesComTrabalho.map((s) => ({ ...s, concluida: false, repsFeitas: '' })),
    });
    await abrirTela();
    await telaPronta();

    expect(textoDaTela()).not.toMatch(/retomando o treino/i);
  });

  it('depois de enviar, ir para segundo plano NÃO ressuscita o rascunho', async () => {
    /*
      Caminho de volta já corrigido, e que esta prova tranca: concluir o treino,
      ficar na tela da medalha e mandar o app para segundo plano fazia a
      gravação por `AppState` regravar o rascunho recém-apagado. Na abertura
      seguinte o app ofereceria retomar um treino JÁ ENVIADO — e concluí-lo de
      novo criaria execução duplicada.
    */
    registrarTreino.mockResolvedValue({
      id: 'execucao-1',
      recordes: [
        { exercicioId: 'ex-1', exercicioNome: 'Supino reto', tipo: 'CARGA', valor: 60, anterior: 55 },
      ],
    });
    await abrirTela();
    await telaPronta();
    fireEvent.click(screen.getByLabelText(/concluir série 1 de supino reto/i));
    await concluirTreino();
    await waitFor(() => expect(descartarRascunho).toHaveBeenCalled());
    salvarRascunho.mockClear();

    mudarEstadoDoApp('background');

    await new Promise((r) => setTimeout(r, 50));
    expect(salvarRascunho).not.toHaveBeenCalled();
  });
});

describe('execução do treino: sem rede', () => {
  it('sem plano na rede, treina com a cópia do aparelho — e avisa', async () => {
    obterAtivo.mockRejectedValue(new Error('sem rede'));
    lerPlano.mockResolvedValue({ plano, salvoEm: new Date().toISOString() });
    await abrirTela();

    await telaPronta();
    expect(textoDaTela()).toMatch(/sem conexão — treinando com a cópia salva/i);
  });

  it('sem plano e SEM cópia, diz exatamente isso — e oferece tentar de novo', async () => {
    obterAtivo.mockRejectedValue(new Error('sem rede'));
    lerPlano.mockResolvedValue(null);
    await abrirTela();

    await waitFor(() =>
      expect(textoDaTela()).toMatch(/não foi possível carregar o treino e não há cópia salva/i),
    );
    // A causa é sinal indo e voltando na academia: um toque resolve, e sem o
    // botão a única saída era fechar o app antes de treinar.
    expect(screen.getByText('Tentar de novo')).toBeInTheDocument();
    // E explica por que valeu a pena abrir: da segunda vez funciona sem rede.
    expect(textoDaTela()).toMatch(/fica guardado aqui para treinar sem internet/i);
  });

  it('o toque de tentar de novo abre o treino quando o sinal volta', async () => {
    obterAtivo.mockRejectedValue(new Error('sem rede'));
    lerPlano.mockResolvedValue(null);
    await abrirTela();
    await waitFor(() => expect(screen.getByText('Tentar de novo')).toBeInTheDocument());

    obterAtivo.mockResolvedValue(plano);
    fireEvent.click(screen.getByText('Tentar de novo'));

    await telaPronta();
    expect(textoDaTela()).not.toMatch(/não foi possível carregar o treino/i);
  });

  it('o treino que ficou na fila não mostra medalha — vai para a evolução', async () => {
    /*
      Sem rede o servidor não apurou recorde nenhum, e inventar uma medalha
      seria pior que não mostrar: a pessoa contaria para alguém um recorde que
      pode não existir.
    */
    registrarTreino.mockResolvedValue(null);
    await abrirTela();
    await telaPronta();
    fireEvent.click(screen.getByLabelText(/concluir série 1 de supino reto/i));

    await concluirTreino();

    await waitFor(() => expect(navegador.replace).toHaveBeenCalledWith('/(tabs)/evolucao'));
    expect(textoDaTela()).not.toMatch(/recorde/i);
  });

  it('o cardio sem rede não some: a tela diz onde lançar', async () => {
    registrarTreino.mockResolvedValue(null);
    await abrirTela();
    await telaPronta();
    fireEvent.click(screen.getByLabelText(/concluir série 1 de supino reto/i));
    fireEvent.click(screen.getByLabelText(/concluir treino/i));
    await waitFor(() => expect(screen.getByText('Enviar')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/fiz cardio neste treino/i));
    digitar(/minutos de cardio/i, '20');

    fireEvent.click(screen.getByLabelText(/concluir treino/i));

    await waitFor(() => expect(textoDaTela()).toMatch(/o cardio precisa de conexão/i));
    expect(registrarCardio).not.toHaveBeenCalled();
  });
});

describe('execução do treino: com rede', () => {
  it('o cardio vai amarrado à execução que acabou de ser gravada', async () => {
    // Solto, ele viraria um cardio órfão no mesmo dia — e o relatório do
    // personal contaria a esteira duas vezes.
    await abrirTela();
    await telaPronta();
    fireEvent.click(screen.getByLabelText(/concluir série 1 de supino reto/i));
    fireEvent.click(screen.getByLabelText(/concluir treino/i));
    await waitFor(() => expect(screen.getByText('Enviar')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/fiz cardio neste treino/i));
    digitar(/minutos de cardio/i, '20');

    fireEvent.click(screen.getByLabelText(/concluir treino/i));

    await waitFor(() =>
      expect(registrarCardio).toHaveBeenCalledWith(
        'aluna-1',
        expect.objectContaining({ execucaoId: 'execucao-1', duracaoMin: 20 }) as unknown,
      ),
    );
  });

  it('recorde vira medalha, e a medalha segura a tela', async () => {
    registrarTreino.mockResolvedValue({
      id: 'execucao-1',
      recordes: [
        { exercicioId: 'ex-1', exercicioNome: 'Supino reto', tipo: 'CARGA', valor: 60, anterior: 55 },
      ],
    });
    await abrirTela();
    await telaPronta();
    fireEvent.click(screen.getByLabelText(/concluir série 1 de supino reto/i));

    await concluirTreino();

    await waitFor(() => expect(textoDaTela()).toMatch(/você bateu um recorde/i));
    // Não navega por cima da medalha: é a única vez que ela aparece.
    expect(navegador.replace).not.toHaveBeenCalled();
    // E o "de X para Y" é o que dá tamanho ao passo.
    expect(textoDaTela()).toMatch(/antes 55 kg/i);
  });

  it('a dor só é perguntada a quem disse que sentiu', async () => {
    /*
      Perguntar sobre dor a quem não sentiu ensina a responder no automático, e
      aí a resposta de quem sentiu de verdade vale menos — é o dado que faz o
      personal trocar o exercício.
    */
    await abrirTela();
    await telaPronta();
    fireEvent.click(screen.getByLabelText(/concluir treino/i));
    await waitFor(() => expect(screen.getByText('Enviar')).toBeInTheDocument());

    expect(screen.queryByLabelText(/onde doeu/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/senti dor durante o treino/i));

    await waitFor(() => expect(screen.getByLabelText(/onde doeu/i)).toBeInTheDocument());
  });
});

describe('execução do treino: sessão errada', () => {
  it('sessão que não é do plano ativo não abre', async () => {
    /*
      Acontece quando o personal troca o plano com o aluno no vestiário, com a
      tela aberta. Deixar treinar gravaria séries contra um item que já não
      existe.
    */
    obterAtivo.mockResolvedValue({ ...plano, sessoes: [{ ...plano.sessoes[0]!, id: 'outra' }] });
    await abrirTela();

    await waitFor(() =>
      expect(textoDaTela()).toMatch(/esta sessão não pertence ao seu plano ativo/i),
    );
  });
});
