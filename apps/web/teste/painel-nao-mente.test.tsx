import { ErroApi } from '@vivio/sdk';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O painel do profissional não pode dizer "não tem" quando o que houve foi
 * "não sei".
 *
 * O aplicativo do aluno passou por esta varredura tela por tela; o painel tinha
 * as mesmas frases, e do lado de quem PRESCREVE elas custam mais:
 *
 * - "Nenhuma prescrição emitida ainda" dito por falha de rede faz o profissional
 *   emitir de novo o que já está valendo, ou algo que interage com o que ele não
 *   viu.
 * - "Nenhuma anamnese aplicada ainda" esconde alergia, restrição e condição de
 *   saúde — e a dieta ou o treino saem como se não houvesse nada a evitar.
 * - "Nenhum atendimento neste dia" faz marcar outra coisa no horário, ou não
 *   aparecer.
 * - "Nenhum aluno ativo. Convide alguém" é a frase de quem está começando, dita
 *   a quem tem trinta alunos.
 *
 * As quatro telas mostram o aviso de erro E mostravam a frase do vazio. Quem lê
 * as duas juntas acredita na segunda: ela parece resposta, e a primeira parece
 * ruído de sistema.
 */
const listarPrescricoes = vi.fn();
const listarModelosPrescricao = vi.fn();
const listarAnamneses = vi.fn();
const listarModelosAnamnese = vi.fn();
const listarAgenda = vi.fn();
const horariosLivres = vi.fn();
const carteira = vi.fn();
const meusAlunos = vi.fn();
const listarConversas = vi.fn();
const listarCardapios = vi.fn();
const removerCardapio = vi.fn();

vi.mock('../lib/sdk', () => ({
  sdk: {
    prescricoes: { listar: (...a: unknown[]) => listarPrescricoes(...a) },
    modelosPrescricao: { listar: (...a: unknown[]) => listarModelosPrescricao(...a) },
    anamneses: { listar: (...a: unknown[]) => listarAnamneses(...a) },
    modelosAnamnese: { listar: (...a: unknown[]) => listarModelosAnamnese(...a) },
    agenda: {
      listar: (...a: unknown[]) => listarAgenda(...a),
      horariosLivres: (...a: unknown[]) => horariosLivres(...a),
      marcar: vi.fn(),
      mudarStatus: vi.fn(),
    },
    relatorios: { carteira: (...a: unknown[]) => carteira(...a) },
    vinculos: {
      meusAlunos: (...a: unknown[]) => meusAlunos(...a),
      convidar: vi.fn(),
    },
    cardapios: {
      listar: (...a: unknown[]) => listarCardapios(...a),
      remover: (...a: unknown[]) => removerCardapio(...a),
      aplicar: vi.fn(),
    },
    dietas: { listar: vi.fn(() => Promise.resolve([])) },
    chat: {
      listarConversas: (...a: unknown[]) => listarConversas(...a),
      mensagens: vi.fn(() => Promise.resolve({ dados: [] })),
      marcarVista: vi.fn(),
    },
  },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ alunoId: 'aluna-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

/*
  O cartão do cardápio lê `macrosTotais` e `totalRefeicoes` direto. Uma fixture
  sem eles não "mostra menos": estoura o render inteiro — que é exatamente o
  motivo de o aplicativo ter ganhado barreira de erro.
*/
const cardapio = {
  id: 'c1',
  nome: 'Cutting 1.800 kcal',
  descricao: null,
  kcalAlvo: 1800,
  totalRefeicoes: 4,
  macrosTotais: { kcal: 1796, proteinaG: 140, carboidratoG: 180, gorduraG: 55 },
  criadoEm: '2026-09-01T12:00:00.000Z',
};

const textoDaTela = () => document.body.textContent ?? '';

const semRede = () => new ErroApi('ERRO_DE_REDE', 'Sem rede.', 0);

beforeEach(() => {
  listarPrescricoes.mockResolvedValue([]);
  listarModelosPrescricao.mockResolvedValue([]);
  listarAnamneses.mockResolvedValue([]);
  listarModelosAnamnese.mockResolvedValue([]);
  listarAgenda.mockResolvedValue([]);
  horariosLivres.mockResolvedValue([]);
  carteira.mockResolvedValue({ linhas: [], geradoEm: new Date().toISOString() });
  meusAlunos.mockResolvedValue([]);
  listarConversas.mockResolvedValue([]);
  listarCardapios.mockResolvedValue([]);
  removerCardapio.mockResolvedValue(undefined);
});

describe('prescrições do aluno (painel)', () => {
  it('falha NÃO vira "nenhuma prescrição emitida ainda"', async () => {
    listarPrescricoes.mockRejectedValue(semRede());
    const { default: Prescricoes } = await import('../app/(pro)/alunos/[alunoId]/prescricoes/page');
    render(<Prescricoes />);

    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar as prescrições.')).toBeInTheDocument(),
    );
    expect(textoDaTela()).not.toMatch(/nenhuma prescrição emitida ainda/i);
  });

  it('o vazio de verdade continua dito', async () => {
    const { default: Prescricoes } = await import('../app/(pro)/alunos/[alunoId]/prescricoes/page');
    render(<Prescricoes />);

    await waitFor(() =>
      expect(screen.getByText('Nenhuma prescrição emitida ainda.')).toBeInTheDocument(),
    );
  });

  it('falta de consentimento é dita como tal, e não como erro', async () => {
    /*
      403 aqui não é falha do sistema: é o aluno não ter liberado o escopo. As
      duas exigem ações diferentes — uma é pedir autorização, a outra é tentar de
      novo.
    */
    listarPrescricoes.mockRejectedValue(
      new ErroApi('CONSENTIMENTO_AUSENTE', 'sem consentimento', 403),
    );
    const { default: Prescricoes } = await import('../app/(pro)/alunos/[alunoId]/prescricoes/page');
    render(<Prescricoes />);

    await waitFor(() => expect(textoDaTela()).toMatch(/autoriz/i));
    expect(textoDaTela()).not.toMatch(/não foi possível carregar as prescrições/i);
  });
});

describe('anamnese do aluno (painel)', () => {
  it('falha NÃO vira "nenhuma anamnese aplicada ainda"', async () => {
    /*
      É aqui que moram alergia e condição de saúde. A frase do vazio, lida por
      quem vai montar a dieta, significa "pode usar qualquer ingrediente".
    */
    listarAnamneses.mockRejectedValue(semRede());
    const { default: Anamnese } = await import('../app/(pro)/alunos/[alunoId]/anamnese/page');
    render(<Anamnese />);

    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar as anamneses.')).toBeInTheDocument(),
    );
    expect(textoDaTela()).not.toMatch(/nenhuma anamnese aplicada ainda/i);
  });

  it('o vazio de verdade continua dito', async () => {
    const { default: Anamnese } = await import('../app/(pro)/alunos/[alunoId]/anamnese/page');
    render(<Anamnese />);

    await waitFor(() =>
      expect(screen.getByText('Nenhuma anamnese aplicada ainda.')).toBeInTheDocument(),
    );
  });
});

describe('agenda (painel)', () => {
  it('falha NÃO vira "nenhum atendimento neste dia"', async () => {
    listarAgenda.mockRejectedValue(semRede());
    const { default: Agenda } = await import('../app/(pro)/agenda/page');
    render(<Agenda />);

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível ler este dia/i));
    expect(textoDaTela()).not.toMatch(/nenhum atendimento neste dia/i);
  });

  it('dia realmente livre continua dizendo que está livre', async () => {
    const { default: Agenda } = await import('../app/(pro)/agenda/page');
    render(<Agenda />);

    await waitFor(() => expect(textoDaTela()).toMatch(/nenhum atendimento neste dia/i));
  });
});

describe('meus alunos (painel)', () => {
  it('falha NÃO vira "convide alguém para começar"', async () => {
    meusAlunos.mockRejectedValue(semRede());
    const { default: Alunos } = await import('../app/(pro)/alunos/page');
    render(<Alunos />);

    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar seus alunos.')).toBeInTheDocument(),
    );
    expect(textoDaTela()).not.toMatch(/convide alguém pelo e-mail acima/i);
  });

  it('carteira realmente vazia continua convidando', async () => {
    const { default: Alunos } = await import('../app/(pro)/alunos/page');
    render(<Alunos />);

    await waitFor(() => expect(textoDaTela()).toMatch(/convide alguém pelo e-mail acima/i));
  });
});

describe('conversas (painel)', () => {
  it('falha NÃO vira "nenhuma conversa ainda"', async () => {
    // O outro lado da correção feita no aplicativo: aqui a leitura errada faz o
    // profissional deixar aluno sem resposta.
    listarConversas.mockRejectedValue(semRede());
    const { default: Chat } = await import('../app/(pro)/chat/page');
    render(<Chat />);

    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar suas conversas.')).toBeInTheDocument(),
    );
    expect(textoDaTela()).not.toMatch(/nenhuma conversa ainda/i);
  });
});

describe('acervo do nutricionista: excluir', () => {
  it('excluir cardápio PERGUNTA antes — era a única exclusão do painel que não perguntava', async () => {
    /*
      Botão vermelho, ao lado de "Aplicar", que apagava sem volta o cardápio
      montado a partir de uma dieta que deu certo. Todas as outras exclusões do
      painel confirmam; esta não, e o trabalho perdido não se recupera.
    */
    const remover = vi.fn(() => Promise.resolve(undefined));
    listarCardapios.mockResolvedValue([cardapio]);
    removerCardapio.mockImplementation(remover);
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const { default: Cardapios } = await import('../app/(pro)/plano-alimentar/cardapios/page');
    render(<Cardapios />);
    await waitFor(() => expect(screen.getByText('Cutting 1.800 kcal')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Excluir'));

    expect(confirmar).toHaveBeenCalled();
    // Recusando, nada é apagado.
    expect(remover).not.toHaveBeenCalled();
    confirmar.mockRestore();
  });

  it('exclusão que falha AVISA, em vez de o item reaparecer sem explicação', async () => {
    /*
      O `.catch(() => undefined)` fazia o item voltar na recarga e a tela ficar
      idêntica ao que era antes do clique: a pessoa confirmou uma exclusão e nada
      aconteceu, sem nenhuma palavra.
    */
    listarCardapios.mockResolvedValue([cardapio]);
    removerCardapio.mockRejectedValue(semRede());
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const { default: Cardapios } = await import('../app/(pro)/plano-alimentar/cardapios/page');
    render(<Cardapios />);
    await waitFor(() => expect(screen.getByText('Cutting 1.800 kcal')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Excluir'));

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível remover/i));
    confirmar.mockRestore();
  });

  it('acervo vazio por FALHA não diz "nenhum cardápio no seu acervo ainda"', async () => {
    listarCardapios.mockRejectedValue(semRede());
    const { default: Cardapios } = await import('../app/(pro)/plano-alimentar/cardapios/page');
    render(<Cardapios />);

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível carregar/i));
    expect(textoDaTela()).not.toMatch(/nenhum cardápio no seu acervo ainda/i);
  });
});
