import { ErroApi } from '@vivio/sdk';
import { obterTema } from '@vivio/ui-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * As duas abas que só mostram: o plano de treino e o histórico.
 *
 * Elas não escrevem nada, e é por isso que o defeito delas é sempre o mesmo e
 * sempre invisível: **vazio e falha se leem igual na tela e significam coisas
 * opostas**. "Nenhum plano de treino ativo" dito a quem está sem sinal manda o
 * aluno cobrar o personal por um treino que já está montado; "0 treinos · 0
 * séries · 0 kg" mostrado a quem tem cinquenta treinos gravados faz a pessoa
 * achar que perdeu o histórico.
 *
 * As duas já tratam isso — estas provas existem para que continue assim. O
 * resto é o que sustenta treinar no subsolo da academia: a cópia no aparelho,
 * o aviso de que ela está em uso, e a fila do que ainda não subiu.
 */
const obterAtivo = vi.fn();
const listarExecucoes = vi.fn();
const lerPlano = vi.fn();
const salvarPlano = vi.fn();
const sincronizar = vi.fn();

vi.mock('../src/sdk', () => ({
  sdk: {
    treinos: { obterAtivo: (...a: unknown[]) => obterAtivo(...a) },
    execucoes: { listar: (...a: unknown[]) => listarExecucoes(...a) },
  },
}));

vi.mock('../src/cacheTreino', () => ({
  lerPlano: (...a: unknown[]) => lerPlano(...a),
  salvarPlano: (...a: unknown[]) => salvarPlano(...a),
  lerAnteriores: vi.fn(() => Promise.resolve(null)),
  salvarAnteriores: vi.fn(() => Promise.resolve(undefined)),
}));

/*
  Objeto mutável e estável: `pendentes` muda de teste para teste, mas a
  identidade não pode mudar a cada render — a aba de evolução recarrega quando
  a fila esvazia, e um objeto novo a cada chamada a poria em laço.
*/
const tentarDeNovo = vi.fn();
const esquecer = vi.fn();

const sincronizacao: {
  pendentes: unknown[];
  descartados: unknown[];
  sincronizando: boolean;
  sincronizar: () => void;
  tentarDeNovo: (uuid: string) => void;
  esquecer: (uuid: string) => void;
} = {
  pendentes: [],
  descartados: [],
  sincronizando: false,
  sincronizar,
  tentarDeNovo,
  esquecer,
};
vi.mock('../src/sincronizacao', () => ({ useSincronizacao: () => sincronizacao }));

const navegador = { push: vi.fn(), replace: vi.fn(), back: vi.fn() };
vi.mock('expo-router', () => ({
  useRouter: () => navegador,
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children?: unknown }) => children,
}));

const usuario = { id: 'aluna-1', nome: 'Ana Souza', email: 'ana@exemplo.com', papel: 'ALUNO' };
const sessao = { tema: obterTema('claro'), nomeDoTema: 'claro', usuario, carregando: false };
vi.mock('../src/sessao', () => ({ useSessao: () => sessao }));

const sessaoDoPlano = (id: string, nome: string, diaSugerido: number | null) => ({
  id,
  nome,
  ordem: 1,
  diaSugerido,
  itens: [
    {
      id: `${id}-i1`,
      ordem: 1,
      series: 3,
      repsAlvo: '8-12',
      cargaSugeridaKg: 40,
      descansoSeg: 90,
      observacao: null,
      exercicio: { id: 'ex-1', nome: 'Supino reto', temVideo: false, videoExternoUrl: null },
    },
  ],
});

const plano = {
  id: 'plano-1',
  nome: 'Hipertrofia A/B',
  versao: 3,
  personal: { id: 'prof-1', nome: 'Diego Personal' },
  sessoes: [sessaoDoPlano('sessao-a', 'Treino A', 1), sessaoDoPlano('sessao-b', 'Treino B', 3)],
};

const execucao = (id: string, extras: Record<string, unknown> = {}) => ({
  id,
  clienteUuid: `uuid-${id}`,
  sessaoId: 'sessao-a',
  sessaoNome: 'Treino A',
  iniciadoEm: '2026-09-28T10:00:00.000Z',
  finalizadoEm: '2026-09-28T11:00:00.000Z',
  duracaoSeg: 3600,
  totalSeries: 12,
  volumeTotalKg: 4200,
  recordes: [],
  feedback: null,
  ...extras,
});

const textoDaTela = () => document.body.textContent ?? '';

async function abrirTreino() {
  const { default: Treino } = await import('../app/(tabs)/treino');
  return render(<Treino />);
}

async function abrirEvolucao() {
  const { default: Evolucao } = await import('../app/(tabs)/evolucao');
  return render(<Evolucao />);
}

beforeEach(() => {
  sincronizacao.pendentes = [];
  sincronizacao.descartados = [];
  sincronizacao.sincronizando = false;
  obterAtivo.mockResolvedValue(plano);
  salvarPlano.mockResolvedValue(undefined);
  lerPlano.mockResolvedValue(null);
  listarExecucoes.mockResolvedValue([]);
});

describe('aba de treino', () => {
  it('mostra o plano com quem o prescreveu e a versão', async () => {
    /*
      A versão e o nome do personal não são enfeite: é o que permite a alguém
      dizer "estou no treino 3" e o profissional saber do que se trata.
    */
    await abrirTreino();

    await waitFor(() => expect(screen.getByText('Hipertrofia A/B')).toBeInTheDocument());
    expect(textoDaTela()).toMatch(/versão 3 · por Diego Personal/);
    expect(textoDaTela()).toContain('3 × 8-12');
  });

  it('404 diz que não há plano — e não fala em rede', async () => {
    obterAtivo.mockRejectedValue(new ErroApi('RECURSO_NAO_ENCONTRADO', 'Sem plano.', 404));
    await abrirTreino();

    await waitFor(() =>
      expect(screen.getByText('Nenhum plano de treino ativo no momento.')).toBeInTheDocument(),
    );
    expect(textoDaTela()).not.toMatch(/sem conexão/i);
  });

  it('sem rede, treina com a cópia do aparelho — e diz que é cópia', async () => {
    /*
      Mostrar a cópia sem avisar é pior que não mostrar: a pessoa treinaria
      achando que vê o plano de hoje, quando o personal pode tê-lo trocado
      ontem.
    */
    obterAtivo.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'Sem rede.', 0));
    lerPlano.mockResolvedValue({ plano, salvoEm: new Date().toISOString() });
    await abrirTreino();

    await waitFor(() => expect(screen.getByText('Hipertrofia A/B')).toBeInTheDocument());
    expect(textoDaTela()).toMatch(/mostrando a cópia salva no aparelho/i);
  });

  it('sem rede e SEM cópia, não acusa o personal', async () => {
    // A acusação errada, ao profissional errado, pelo motivo errado.
    obterAtivo.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'Sem rede.', 0));
    await abrirTreino();

    await waitFor(() => expect(textoDaTela()).toMatch(/sem conexão e sem cópia salva/i));
    expect(textoDaTela()).not.toMatch(/nenhum plano de treino ativo/i);
  });

  it('"tentar de novo" busca de novo — e a tela se recupera sozinha', async () => {
    obterAtivo.mockRejectedValueOnce(new ErroApi('ERRO_DE_REDE', 'Sem rede.', 0));
    await abrirTreino();
    await waitFor(() => expect(textoDaTela()).toMatch(/sem conexão e sem cópia salva/i));

    fireEvent.click(screen.getByText(/tentar de novo/i));

    await waitFor(() => expect(screen.getByText('Hipertrofia A/B')).toBeInTheDocument());
  });

  it('guarda a cópia a cada carga bem-sucedida — é ela que salva o treino de amanhã', async () => {
    await abrirTreino();

    await waitFor(() => expect(salvarPlano).toHaveBeenCalledWith('aluna-1', plano));
  });

  it('"Iniciar" abre a sessão daquele cartão, e não a primeira', async () => {
    await abrirTreino();
    await waitFor(() => expect(screen.getByLabelText(/iniciar treino b/i)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/iniciar treino b/i));

    expect(navegador.push).toHaveBeenCalledWith('/execucao/sessao-b');
  });
});

describe('aba de evolução', () => {
  it('falha NÃO vira "0 treinos"', async () => {
    /*
      O defeito que esta aba já teve. Zero é uma afirmação sobre a vida da
      pessoa; dito a quem tem cinquenta treinos gravados, faz concluir que
      perdeu o histórico — e a reação a isso é parar de registrar.
    */
    listarExecucoes.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'Sem rede.', 0));
    await abrirEvolucao();

    await waitFor(() => expect(textoDaTela()).toMatch(/ele continua salvo — nada foi perdido/i));
    expect(screen.queryByText('Treinos')).not.toBeInTheDocument();
    expect(screen.queryByText('Histórico')).not.toBeInTheDocument();
  });

  it('o vazio de verdade diz que é o primeiro treino que falta', async () => {
    await abrirEvolucao();

    await waitFor(() =>
      expect(textoDaTela()).toMatch(/seus treinos aparecem aqui depois que você registrar/i),
    );
    // E aí sim os números aparecem, porque agora são verdade.
    expect(screen.getByText('Treinos')).toBeInTheDocument();
  });

  it('os números somam o que está na lista, no formato daqui', async () => {
    listarExecucoes.mockResolvedValue([
      execucao('e1', { totalSeries: 12, volumeTotalKg: 4200 }),
      execucao('e2', { totalSeries: 10, volumeTotalKg: 3800.4 }),
    ]);
    await abrirEvolucao();

    await waitFor(() => expect(screen.getByText('Treinos')).toBeInTheDocument());
    expect(screen.getByText('22')).toBeInTheDocument();
    // 8.000,4 arredondado, com o ponto de milhar do português.
    expect(screen.getByText('8.000')).toBeInTheDocument();
  });

  it('a fila pendente aparece, e o toque tenta enviar agora', async () => {
    /*
      O treino que ficou no aparelho é o que a pessoa mais teme ter perdido.
      Dizer quantos são, e deixá-la tentar, é o que diferencia "guardado" de
      "sumiu".
    */
    sincronizacao.pendentes = [{ clienteUuid: 'u1' }, { clienteUuid: 'u2' }];
    await abrirEvolucao();
    await waitFor(() => expect(textoDaTela()).toMatch(/2 treinos aguardando envio/i));

    fireEvent.click(screen.getByLabelText(/enviar treinos pendentes agora/i));

    expect(sincronizar).toHaveBeenCalled();
  });

  it('treino RECUSADO de vez aparece, com motivo e com saída', async () => {
    /*
      O defeito mais caro do aplicativo, e o mais silencioso: o treino recusado
      saía da fila e o contador voltava a zero — a mesma tela de "tudo enviado".
      A pessoa acreditava que uma hora de academia tinha subido.

      A tela precisa dizer três coisas: que não chegou, por quê, e o que fazer. O
      motivo mais comum (compartilhamento desligado) é reversível, e por isso o
      primeiro botão é "tentar de novo", não "apagar".
    */
    sincronizacao.descartados = [
      {
        clienteUuid: 'uuid-1',
        alunoId: 'aluna-1',
        enfileiradoEm: '2026-09-28T10:00:00.000Z',
        tentativas: 3,
        descartadoEm: '2026-09-28T11:00:00.000Z',
        motivo: 'CONSENTIMENTO_AUSENTE',
        execucao: {
          clienteUuid: 'uuid-1',
          sessaoId: 'sessao-a',
          iniciadoEm: '2026-09-28T10:00:00.000Z',
          finalizadoEm: '2026-09-28T11:00:00.000Z',
          series: [{ itemTreinoId: 'item-1', serieNum: 1, repsFeitas: 10, cargaKg: 40, tipo: 'NORMAL' }],
          feedback: { dificuldade: 3, teveDor: false },
        },
      },
    ];
    await abrirEvolucao();

    await waitFor(() => expect(textoDaTela()).toMatch(/um treino não foi aceito pelo servidor/i));
    // Diz que não foi perdido E que não chegou — as duas coisas.
    expect(textoDaTela()).toMatch(/continua salvo aqui no aparelho/i);
    expect(textoDaTela()).toMatch(/não chegou ao seu profissional/i);
    // E traduz o motivo em ação, em vez de mostrar o código cru.
    expect(textoDaTela()).toMatch(/ligue em minha equipe/i);

    fireEvent.click(screen.getByLabelText(/tentar enviar este treino de novo/i));
    expect(tentarDeNovo).toHaveBeenCalledWith('uuid-1');
  });

  it('esquecer o recusado é uma escolha separada, e não o caminho fácil', async () => {
    // "Esquecer" existe porque às vezes a pessoa não quer mais aquele registro —
    // mas fica em segundo plano, depois de "tentar de novo".
    sincronizacao.descartados = [
      {
        clienteUuid: 'uuid-2',
        alunoId: 'aluna-1',
        enfileiradoEm: '2026-09-28T10:00:00.000Z',
        tentativas: 1,
        descartadoEm: '2026-09-28T11:00:00.000Z',
        motivo: 'DADOS_INVALIDOS',
        execucao: {
          clienteUuid: 'uuid-2',
          sessaoId: 'sessao-a',
          iniciadoEm: '2026-09-28T10:00:00.000Z',
          finalizadoEm: null,
          series: [],
          feedback: { dificuldade: 3, teveDor: false },
        },
      },
    ];
    await abrirEvolucao();
    await waitFor(() => expect(textoDaTela()).toMatch(/um treino não foi aceito/i));

    // Motivo sem tradução conhecida aparece como o servidor mandou, e não como
    // uma frase inventada sobre uma causa que ninguém conferiu.
    expect(textoDaTela()).toMatch(/motivo informado pelo servidor: dados_invalidos/i);

    fireEvent.click(screen.getByLabelText(/esquecer este treino/i));
    expect(esquecer).toHaveBeenCalledWith('uuid-2');
  });

  it('o relato de dor acompanha o treino em que ela aconteceu', async () => {
    // É o dado que faz o personal trocar o exercício. Perdido no meio da lista,
    // vira observação que ninguém lê.
    listarExecucoes.mockResolvedValue([
      execucao('e1', { feedback: { teveDor: true, localDor: 'ombro direito', dificuldade: 4 } }),
    ]);
    await abrirEvolucao();

    await waitFor(() => expect(textoDaTela()).toMatch(/relato de dor: ombro direito/i));
  });
});
