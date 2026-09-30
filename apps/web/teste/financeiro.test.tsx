import { render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O financeiro do profissional — a única tela do sistema que mexe em dinheiro.
 *
 * Não há gateway ainda: o pagamento é REGISTRADO à mão por quem recebeu. Isso
 * põe três ações de um clique lado a lado numa lista de linhas parecidas, e duas
 * delas não perguntavam nada:
 *
 * - **Estornar** desfaz um pagamento já registrado. A cobrança volta a pendente,
 *   e quem errou vai cobrar de novo alguém que pagou.
 * - **Cancelar** faz o contrário: o aluno deixa de dever e a receita sai do mês,
 *   em silêncio.
 * - **Remover** apagava a cobrança — e era a única que perguntava.
 *
 * O resto das provas é sobre o valor: "149,90" tem de virar 14990 centavos, e
 * "R$ 1.499,90" também — o ponto de milhar e o "R$" vêm de quem copia de outro
 * sistema. Um erro de fator dez aqui cobra o décuplo de alguém.
 */
const resumoFinanceiro = vi.fn();
const criarCobranca = vi.fn();
const registrarPagamento = vi.fn();
const estornar = vi.fn();
const cancelar = vi.fn();
const remover = vi.fn();
const meusAlunos = vi.fn();

vi.mock('../lib/sdk', () => ({
  sdk: {
    financeiro: {
      resumo: (...a: unknown[]) => resumoFinanceiro(...a),
      criar: (...a: unknown[]) => criarCobranca(...a),
      registrarPagamento: (...a: unknown[]) => registrarPagamento(...a),
      estornar: (...a: unknown[]) => estornar(...a),
      cancelar: (...a: unknown[]) => cancelar(...a),
      remover: (...a: unknown[]) => remover(...a),
    },
    vinculos: { meusAlunos: (...a: unknown[]) => meusAlunos(...a) },
  },
}));

const aluna = {
  id: 'vinculo-1',
  status: 'ATIVO',
  aguardandoMinhaResposta: false,
  tipo: 'PERSONAL',
  contraparte: { id: 'aluna-1', nome: 'Ana Souza', papel: 'ALUNO', avatarUrl: null },
};

/*
  A cobrança COMPLETA. A tela lê `aluno.nome` e `diasDeAtraso` direto; fixture
  pela metade não mostra menos — derruba o render, que foi como esta suíte
  descobriu que o painel também não tem barreira de erro.
*/
const cobranca = (extras: Record<string, unknown> = {}) => ({
  id: 'cob-1',
  aluno: { id: 'aluna-1', nome: 'Ana Souza' },
  descricao: 'Mensalidade de outubro',
  valorCentavos: 24990,
  vencimento: '2026-10-10',
  situacao: 'PENDENTE',
  pagaEm: null,
  formaPagamento: null,
  observacao: null,
  diasDeAtraso: null,
  ...extras,
});

const resumo = (cobrancas: unknown[]) => ({
  mes: new Date().toISOString().slice(0, 7),
  recebidoCentavos: 0,
  aReceberCentavos: 24990,
  atrasadoCentavos: 0,
  alunosEmAtraso: 0,
  cobrancas,
});

const textoDaTela = () => document.body.textContent ?? '';

async function abrirTela() {
  const { default: Financeiro } = await import('../app/(pro)/financeiro/page');
  return render(<Financeiro />);
}

/** O corpo da cobrança criada. */
const criada = () => (criarCobranca.mock.calls[0] as [Record<string, unknown>])[0];

beforeEach(() => {
  resumoFinanceiro.mockResolvedValue(resumo([cobranca()]));
  criarCobranca.mockResolvedValue(undefined);
  registrarPagamento.mockResolvedValue(undefined);
  estornar.mockResolvedValue(undefined);
  cancelar.mockResolvedValue(undefined);
  remover.mockResolvedValue(undefined);
  meusAlunos.mockResolvedValue([aluna]);
});

describe('financeiro: o valor', () => {
  async function preencherCobranca(valor: string) {
    await abrirTela();
    await waitFor(() => expect(screen.getByText('+ Nova cobrança')).toBeInTheDocument());
    fireEvent.click(screen.getByText('+ Nova cobrança'));
    // O nome aparece na lista de cobranças E no seletor; esperar pela OPÇÃO é o
    // que garante que a carteira chegou.
    await waitFor(() =>
      expect([...document.querySelectorAll('option')].some((o) => o.value === 'aluna-1')).toBe(true),
    );

    const seletor = document.querySelector('select') as HTMLSelectElement;
    fireEvent.change(seletor, { target: { value: 'aluna-1' } });
    const campos = [...document.querySelectorAll('input')];
    const texto = campos.find((c) => c.type === 'text') as HTMLInputElement;
    const data = campos.find((c) => c.type === 'date') as HTMLInputElement;
    fireEvent.change(texto, { target: { value: 'Mensalidade de outubro' } });
    fireEvent.change(data, { target: { value: '2026-10-10' } });
    // O valor é o último campo de texto do formulário.
    const valorCampo = campos.filter((c) => c.type === 'text')[1] as HTMLInputElement;
    fireEvent.change(valorCampo, { target: { value: valor } });
  }

  it('"149,90" vira 14990 centavos', async () => {
    /*
      Centavos inteiros, e não reais com decimal: dinheiro em ponto flutuante
      acumula erro de arredondamento, e aqui o erro aparece na fatura de alguém.
    */
    await preencherCobranca('149,90');

    fireEvent.click(screen.getByText('Criar cobrança'));

    await waitFor(() => expect(criarCobranca).toHaveBeenCalled());
    expect(criada().valorCentavos).toBe(14990);
  });

  it('"R$ 1.499,90" também é lido — é o que se copia de outro sistema', async () => {
    await preencherCobranca('R$ 1.499,90');

    fireEvent.click(screen.getByText('Criar cobrança'));

    await waitFor(() => expect(criarCobranca).toHaveBeenCalled());
    expect(criada().valorCentavos).toBe(149990);
  });

  it('valor sem número nenhum não deixa criar', async () => {
    /*
      "cento e cinquenta" não tem como ser lido, e o botão fica travado — nada
      sai da tela para ser recusado pelo servidor depois.

      Vale registrar o que a leitura ACEITA de propósito: "R$ 150 reais" vira
      R$ 150,00, porque `paraCentavos` descarta o que não é dígito. É tolerância
      deliberada com quem copia valor de outro sistema, e não um descuido.
    */
    await preencherCobranca('cento e cinquenta');

    expect(screen.getByText('Criar cobrança')).toBeDisabled();
    expect(criarCobranca).not.toHaveBeenCalled();
  });

  it('o vencimento é ancorado ao meio-dia, para não cair no dia anterior', async () => {
    /*
      `new Date('2026-10-10')` puro é meia-noite UTC, que no Brasil é dia 9 às
      21h — a cobrança venceria um dia antes do combinado.
    */
    await preencherCobranca('100,00');

    fireEvent.click(screen.getByText('Criar cobrança'));

    await waitFor(() => expect(criarCobranca).toHaveBeenCalled());
    const vencimento = criada().vencimento as Date;
    expect(vencimento.getDate()).toBe(10);
    expect(vencimento.getHours()).toBe(12);
  });
});

describe('financeiro: as três ações de dinheiro', () => {
  async function abrirComCobranca(extras: Record<string, unknown> = {}) {
    resumoFinanceiro.mockResolvedValue(resumo([cobranca(extras)]));
    await abrirTela();
    await waitFor(() => expect(textoDaTela()).toMatch(/mensalidade de outubro/i));
  }

  it('estornar PERGUNTA antes — e diz que a cobrança volta a pendente', async () => {
    /*
      A ação que esta prova existe para defender. Estornar por engano faz o
      profissional cobrar de novo alguém que já pagou, e a conversa que vem disso
      não se desfaz com um clique de volta.
    */
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await abrirComCobranca({ situacao: 'PAGA', pagaEm: '2026-10-05T12:00:00Z', formaPagamento: 'PIX' });

    fireEvent.click(screen.getByText('Estornar'));

    expect(confirmar).toHaveBeenCalled();
    expect(confirmar.mock.calls[0]![0]).toMatch(/volta a ficar pendente/i);
    expect(estornar).not.toHaveBeenCalled();
    confirmar.mockRestore();
  });

  it('confirmando, estorna', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await abrirComCobranca({ situacao: 'PAGA', pagaEm: '2026-10-05T12:00:00Z', formaPagamento: 'PIX' });

    fireEvent.click(screen.getByText('Estornar'));

    await waitFor(() => expect(estornar).toHaveBeenCalledWith('cob-1'));
    confirmar.mockRestore();
  });

  it('cancelar PERGUNTA antes — e diz que o valor sai do mês', async () => {
    // O oposto do estorno, e igualmente silencioso: a receita desaparece do
    // total e ninguém vê de onde.
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await abrirComCobranca();

    fireEvent.click(screen.getByText('Cancelar cobrança'));

    expect(confirmar.mock.calls[0]![0]).toMatch(/deixa de dever/i);
    expect(cancelar).not.toHaveBeenCalled();
    confirmar.mockRestore();
  });

  it('remover continua perguntando, e nomeia o que vai embora', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await abrirComCobranca();

    fireEvent.click(screen.getByText('Remover'));

    expect(confirmar.mock.calls[0]![0]).toMatch(/mensalidade de outubro/i);
    expect(remover).not.toHaveBeenCalled();
    confirmar.mockRestore();
  });

  it('se a ação falhar, a tela diz — em vez de parecer que não fez nada', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    cancelar.mockRejectedValue(new Error('Failed to fetch'));
    await abrirComCobranca();

    fireEvent.click(screen.getByText('Cancelar cobrança'));

    /*
      A frase é da TELA, não do erro. Antes era `e instanceof Error ? e.message`,
      e o profissional lia "Failed to fetch" — que soa como sistema quebrado e não
      diz o que fazer. Mensagem de `ErroApi` continua passando, porque essa é
      escrita para gente.
    */
    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível concluir a ação/i));
    expect(textoDaTela()).not.toMatch(/failed to fetch/i);
    confirmar.mockRestore();
  });
});

describe('financeiro: o que a tela diz', () => {
  it('falha ao carregar o mês é dita', async () => {
    resumoFinanceiro.mockRejectedValue(new Error('rede'));
    await abrirTela();

    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar o financeiro.')).toBeInTheDocument(),
    );
    // E não mostra "nenhuma cobrança": sem dados, não há afirmação a fazer.
    expect(textoDaTela()).not.toMatch(/nenhuma cobrança neste mês/i);
  });

  it('sem alunos por FALHA, o seletor diz isso — e não "nenhum aluno ativo"', async () => {
    /*
      Criar cobrança exige escolher um aluno. Com a lista vazia em silêncio, o
      profissional fica sem entender por que não consegue cobrar — e a leitura
      natural é que perdeu a carteira.
    */
    meusAlunos.mockRejectedValue(new Error('rede'));
    await abrirTela();
    await waitFor(() => expect(screen.getByText('+ Nova cobrança')).toBeInTheDocument());

    fireEvent.click(screen.getByText('+ Nova cobrança'));

    await waitFor(() =>
      expect(textoDaTela()).toMatch(/não foi possível carregar seus alunos/i),
    );
  });
});

describe('mensagem de erro que a pessoa lê', () => {
  it('erro da API passa como está — ele é escrito para gente', async () => {
    /*
      "Já existe cobrança com esta descrição neste mês" é informação; trocá-la
      pela frase genérica da tela esconderia o que a pessoa precisa saber para
      corrigir.
    */
    const { ErroApi } = await import('@vivio/sdk');
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    cancelar.mockRejectedValue(
      new ErroApi('DADOS_INVALIDOS', 'Cobrança paga não pode ser cancelada.', 422),
    );
    resumoFinanceiro.mockResolvedValue(resumo([cobranca()]));
    await abrirTela();
    await waitFor(() => expect(textoDaTela()).toMatch(/mensalidade de outubro/i));

    fireEvent.click(screen.getByText('Cancelar cobrança'));

    await waitFor(() =>
      expect(textoDaTela()).toMatch(/cobrança paga não pode ser cancelada/i),
    );
    confirmar.mockRestore();
  });

  it('falta de rede vira frase que diz que nada foi perdido', async () => {
    const { ErroApi } = await import('@vivio/sdk');
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    cancelar.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'fetch failed', 0));
    resumoFinanceiro.mockResolvedValue(resumo([cobranca()]));
    await abrirTela();
    await waitFor(() => expect(textoDaTela()).toMatch(/mensalidade de outubro/i));

    fireEvent.click(screen.getByText('Cancelar cobrança'));

    await waitFor(() => expect(textoDaTela()).toMatch(/sem conexão agora/i));
    expect(textoDaTela()).not.toMatch(/fetch failed/i);
    confirmar.mockRestore();
  });
});
