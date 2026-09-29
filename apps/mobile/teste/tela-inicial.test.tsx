import { ErroApi } from '@vivio/sdk';
import { obterTema } from '@vivio/ui-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A tela inicial — a única que quase todo mundo abre todo dia.
 *
 * Ela não coleta nada: só junta o que as outras produziram e decide o que pedir
 * à pessoa agora. Por isso o que falha aqui é sempre a MESMA coisa em formas
 * diferentes: pedir a coisa errada, ou pedir a certa para quem não pode
 * atender.
 *
 * As provas cobrem as três decisões dela:
 *
 * 1. **Qual é o próximo treino.** Era uma conta que congelava depois do quinto
 *    treino e passava a sugerir sempre a mesma sessão.
 * 2. **De quem é a culpa quando não há treino.** "Seu personal não montou um
 *    plano" dito a quem está sem sinal é acusação falsa; dito a quem nem
 *    aceitou o convite ainda, é resposta para a pergunta errada.
 * 3. **O que cobrar, e em que ordem.** Convite pendente vem antes de tudo,
 *    porque sem vínculo nada mais funciona.
 */
const obterAtivo = vi.fn();
const listarExecucoes = vi.fn();
const listarCheckins = vi.fn();
const listarConversas = vi.fn();
const meusProfissionais = vi.fn();
const obterDieta = vi.fn();
const registrosDoDia = vi.fn();
const calorias = vi.fn();

vi.mock('../src/sdk', () => ({
  sdk: {
    treinos: { obterAtivo: (...a: unknown[]) => obterAtivo(...a) },
    execucoes: { listar: (...a: unknown[]) => listarExecucoes(...a) },
    checkins: { listar: (...a: unknown[]) => listarCheckins(...a) },
    chat: { listarConversas: (...a: unknown[]) => listarConversas(...a) },
    vinculos: { meusProfissionais: (...a: unknown[]) => meusProfissionais(...a) },
    dietas: {
      obterAtiva: (...a: unknown[]) => obterDieta(...a),
      registrosDoDia: (...a: unknown[]) => registrosDoDia(...a),
    },
    cardio: { calorias: (...a: unknown[]) => calorias(...a) },
  },
}));

const navegador = { push: vi.fn(), replace: vi.fn(), back: vi.fn() };

/*
  `useFocusEffect` é o que faz a tela se atualizar ao VOLTAR — sem ele o cartão
  continuaria perguntando "como foi seu dia?" depois de a pessoa responder. No
  teste ele é um efeito comum: a tela monta uma vez, e isso basta.
*/
vi.mock('expo-router', async () => {
  const { useEffect } = await import('react');
  return {
    useRouter: () => navegador,
    useFocusEffect: (efeito: () => void) => useEffect(efeito, [efeito]),
    useLocalSearchParams: () => ({}),
    Stack: { Screen: () => null },
    Link: ({ children }: { children?: unknown }) => children,
  };
});

const usuario = { id: 'aluna-1', nome: 'Ana Souza', email: 'ana@exemplo.com', papel: 'ALUNO' };
const sair = vi.fn();
const sessao = {
  tema: obterTema('claro'),
  nomeDoTema: 'claro',
  usuario,
  carregando: false,
  sair,
};
vi.mock('../src/sessao', () => ({ useSessao: () => sessao }));

const sessaoDoPlano = (id: string, nome: string) => ({
  id,
  nome,
  ordem: 1,
  itens: [{ id: `${id}-i1`, series: 3, exercicio: { id: 'ex-1', nome: 'Supino' } }],
});

const plano = {
  id: 'plano-1',
  nome: 'Hipertrofia A/B',
  sessoes: [sessaoDoPlano('sessao-a', 'Treino A'), sessaoDoPlano('sessao-b', 'Treino B')],
};

/** Uma execução como a lista da tela inicial a entrega: da mais nova para a mais velha. */
const execucao = (id: string, sessaoId: string, sessaoNome: string) => ({
  id,
  clienteUuid: `uuid-${id}`,
  sessaoId,
  sessaoNome,
  iniciadoEm: '2026-09-28T10:00:00.000Z',
  finalizadoEm: '2026-09-28T11:00:00.000Z',
  duracaoSeg: 3600,
  totalSeries: 12,
  volumeTotalKg: 4200,
  recordes: [],
});

const vinculoAtivo = {
  id: 'vinculo-1',
  status: 'ATIVO',
  aguardandoMinhaResposta: false,
  tipo: 'PERSONAL',
  contraparte: { id: 'prof-1', nome: 'Diego Personal', papel: 'PERSONAL', avatarUrl: null },
};

/*
  O resumo de calorias COMPLETO, e não um pedaço dele.

  O contador é filho desta tela e lê `gastoDiario.totalPorDia`. Um dublê sem
  esse campo derruba o render inteiro — e como o aplicativo não tem barreira de
  erro, a tela inicial fica em branco em vez de perder só o contador. Foi o que
  aconteceu na primeira versão deste arquivo, e vale como aviso: resposta de API
  malformada tem o mesmo efeito em produção.
*/
const semCalorias = {
  dias: 1,
  pesoUsadoKg: null,
  musculacao: { sessoes: 0, minutos: 0, kcal: null },
  cardio: { sessoes: 0, minutos: 0, kcal: null },
  totalKcal: null,
  gastoDiario: { totalPorDia: null },
};

const textoDaTela = () => document.body.textContent ?? '';

async function abrirTela() {
  const { default: Inicio } = await import('../app/(tabs)/index');
  return render(<Inicio />);
}

beforeEach(() => {
  obterAtivo.mockResolvedValue(plano);
  listarExecucoes.mockResolvedValue([]);
  listarCheckins.mockResolvedValue([]);
  listarConversas.mockResolvedValue([]);
  meusProfissionais.mockResolvedValue([vinculoAtivo]);
  obterDieta.mockRejectedValue(new ErroApi('RECURSO_NAO_ENCONTRADO', 'Sem dieta.', 404));
  registrosDoDia.mockResolvedValue([]);
  calorias.mockResolvedValue(semCalorias);
});

describe('tela inicial: qual é o próximo treino', () => {
  it('sem treino nenhum, começa pela primeira sessão do plano', async () => {
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toContain('Treino A'));
  });

  it('a próxima é a SEGUINTE à última treinada', async () => {
    listarExecucoes.mockResolvedValue([execucao('e1', 'sessao-a', 'Treino A')]);
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toMatch(/Próximo treino · Hipertrofia A\/B/));
    expect(screen.getAllByText('Treino B').length).toBeGreaterThan(0);
  });

  it('depois da última sessão do plano, volta para a primeira', async () => {
    listarExecucoes.mockResolvedValue([execucao('e1', 'sessao-b', 'Treino B')]);
    await abrirTela();

    await waitFor(() => expect(screen.getAllByText('Treino A').length).toBeGreaterThan(0));
  });

  it('com mais de cinco treinos feitos, a sugestão continua girando', async () => {
    /*
      O defeito que esta prova fixa. A conta era `sessoes[execucoes.length % n]`
      e a lista de execuções vem LIMITADA A CINCO: passado o quinto treino,
      `length` congela em 5 e, num plano A/B, `5 % 2` é sempre 1 — o app
      sugeria "Treino B" para sempre. Quem confia no cartão da tela inicial
      treinava B indefinidamente, e o A ficava sem acontecer.
    */
    listarExecucoes.mockResolvedValue([
      execucao('e5', 'sessao-b', 'Treino B'),
      execucao('e4', 'sessao-a', 'Treino A'),
      execucao('e3', 'sessao-b', 'Treino B'),
      execucao('e2', 'sessao-a', 'Treino A'),
      execucao('e1', 'sessao-b', 'Treino B'),
    ]);
    await abrirTela();

    // A última foi B, então a próxima é A — e não B, como a conta antiga dizia.
    await waitFor(() => expect(textoDaTela()).toMatch(/Próximo treino/));
    const cartao = screen.getByText('Começar treino').parentElement?.parentElement;
    expect(cartao?.textContent).toContain('Treino A');
    expect(cartao?.textContent).not.toContain('Treino B');
  });

  it('plano trocado no meio da semana: recomeça do início em vez de sumir', async () => {
    // A última treinada não existe mais no plano novo. Sem tratamento, o cartão
    // do próximo treino simplesmente não aparecia.
    listarExecucoes.mockResolvedValue([execucao('e1', 'sessao-do-plano-antigo', 'Treino C')]);
    await abrirTela();

    await waitFor(() => expect(screen.getByText('Começar treino')).toBeInTheDocument());
    const cartao = screen.getByText('Começar treino').parentElement?.parentElement;
    expect(cartao?.textContent).toContain('Treino A');
  });

  it('tocar em "Começar treino" abre a sessão sugerida, e não outra', async () => {
    listarExecucoes.mockResolvedValue([execucao('e1', 'sessao-a', 'Treino A')]);
    await abrirTela();
    await waitFor(() => expect(screen.getByText('Começar treino')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Começar treino'));

    expect(navegador.push).toHaveBeenCalledWith('/execucao/sessao-b');
  });
});

describe('tela inicial: de quem é a culpa quando não há treino', () => {
  it('404 diz que o plano não existe', async () => {
    obterAtivo.mockRejectedValue(new ErroApi('RECURSO_NAO_ENCONTRADO', 'Sem plano.', 404));
    await abrirTela();

    await waitFor(() => expect(screen.getByText('Nenhum treino ativo')).toBeInTheDocument());
    expect(textoDaTela()).not.toMatch(/assim que a rede voltar/i);
  });

  it('sem rede NÃO acusa o personal — e oferece tentar de novo', async () => {
    /*
      Dizer "seu personal ainda não montou um plano" a quem está sem sinal
      manda a pessoa cobrar alguém por um trabalho já feito.
    */
    obterAtivo.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'Sem rede.', 0));
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toMatch(/assim que a rede voltar, aparece aqui/i));
    expect(textoDaTela()).not.toMatch(/ainda não montou ou ativou um plano/i);
  });

  it('quem ainda não aceitou o convite não ouve falar de plano nenhum', async () => {
    /*
      Sem vínculo não há treino, dieta nem acompanhamento. Dizer as duas coisas
      ao mesmo tempo faz a pessoa tentar resolver a que não depende dela.
    */
    obterAtivo.mockRejectedValue(new ErroApi('RECURSO_NAO_ENCONTRADO', 'Sem plano.', 404));
    meusProfissionais.mockResolvedValue([
      { ...vinculoAtivo, status: 'PENDENTE', aguardandoMinhaResposta: true },
    ]);
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toMatch(/quer te acompanhar/i));
    expect(screen.queryByText('Nenhum treino ativo')).not.toBeInTheDocument();
  });

  it('sem profissional e sem convite, mostra o e-mail que destrava tudo', async () => {
    // É esse endereço que o profissional precisa para convidar — e a pessoa
    // não tem por que saber disso sozinha.
    meusProfissionais.mockResolvedValue([]);
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toMatch(/você ainda não tem profissional/i));
    expect(textoDaTela()).toContain('ana@exemplo.com');
  });
});

describe('tela inicial: o que ela cobra', () => {
  it('o check-in de hoje aparece como feito, e não pergunta de novo', async () => {
    const hoje = new Date().toISOString().slice(0, 10);
    listarCheckins.mockResolvedValue([
      { id: 'c1', data: `${hoje}T12:00:00.000Z`, treinou: true, teveDor: false, energia: 4 },
    ]);
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toMatch(/check-in de hoje feito/i));
    expect(textoDaTela()).not.toMatch(/como foi seu dia\?/i);
  });

  it('o check-in de ONTEM não conta como o de hoje', async () => {
    /*
      A lista vem com o mais recente, que pode ser de ontem. Aceitar qualquer um
      faria o app parar de pedir o check-in justamente de quem parou de fazer.
    */
    listarCheckins.mockResolvedValue([
      { id: 'c1', data: '2020-01-01T12:00:00.000Z', treinou: true, teveDor: false, energia: 4 },
    ]);
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toMatch(/como foi seu dia\?/i));
  });

  it('mensagem não lida vira aviso no topo, com o total somado', async () => {
    listarConversas.mockResolvedValue([
      { id: 'c1', naoLidas: 2, contraparte: { nome: 'Diego' } },
      { id: 'c2', naoLidas: 1, contraparte: { nome: 'Eduarda' } },
    ]);
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toMatch(/3 mensagens novas/i));
  });

  it('sem treino registrado, diz isso — e não finge uma lista vazia', async () => {
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toMatch(/nenhum treino registrado ainda/i));
  });
});
