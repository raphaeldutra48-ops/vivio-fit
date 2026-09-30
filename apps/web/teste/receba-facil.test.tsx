import { ErroApi } from '@vivio/sdk';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Receba Fácil — a chave PIX do profissional e o código de cada cobrança.
 *
 * O dado central desta tela é o DESTINO DO DINHEIRO. Uma chave errada não dá
 * erro em lugar nenhum: o código é gerado, o aluno paga, e o valor cai na conta
 * de outra pessoa. Por isso a chave é conferida antes de sair da tela — e é a
 * regra do contrato (`validarChavePix`, com prova própria em
 * `packages/contracts/src/pix.spec.ts`) que decide, não uma expressão escrita
 * aqui de novo.
 *
 * As duas buscas da tela afirmavam coisas falsas ao falhar: "Cadastre sua chave
 * PIX acima" a quem já tem chave — desabilitando "Gerar PIX" com esse motivo — e
 * "Nenhuma cobrança em aberto neste mês" a quem tem cinco em atraso.
 */
const obterPagamento = vi.fn();
const salvarPagamento = vi.fn();
const resumoFinanceiro = vi.fn();
const gerarPix = vi.fn();

vi.mock('../lib/sdk', () => ({
  sdk: {
    financeiro: {
      obterPagamento: (...a: unknown[]) => obterPagamento(...a),
      salvarPagamento: (...a: unknown[]) => salvarPagamento(...a),
      resumo: (...a: unknown[]) => resumoFinanceiro(...a),
      gerarPix: (...a: unknown[]) => gerarPix(...a),
    },
  },
}));

const chaveSalva = {
  tipoChave: 'EMAIL' as const,
  chave: 'diego@exemplo.com',
  recebedor: 'Diego Personal',
  cidade: 'Sao Paulo',
};

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
  mes: '2026-10',
  recebidoCentavos: 0,
  aReceberCentavos: 24990,
  atrasadoCentavos: 0,
  alunosEmAtraso: 0,
  cobrancas,
});

const textoDaTela = () => document.body.textContent ?? '';

async function abrirTela() {
  const { default: RecebaFacil } = await import('../app/(pro)/receba-facil/page');
  return render(<RecebaFacil />);
}

/** Os campos da chave, na ordem em que aparecem no formulário. */
function campoDeTexto(indice: number): HTMLInputElement {
  return [...document.querySelectorAll('input')][indice] as HTMLInputElement;
}

/**
 * Preenche a chave inteira, escolhendo o TIPO primeiro.
 *
 * O tipo padrão é CPF: um e-mail digitado sem trocar o tipo é chave inválida, e o
 * botão fica travado — que é justamente o comportamento provado no primeiro caso.
 */
function preencherChave(tipo: string, chave: string): void {
  const seletor = document.querySelector('select') as HTMLSelectElement;
  fireEvent.change(seletor, { target: { value: tipo } });
  fireEvent.change(campoDeTexto(0), { target: { value: chave } });
  fireEvent.change(campoDeTexto(1), { target: { value: 'Diego Personal' } });
  fireEvent.change(campoDeTexto(2), { target: { value: 'Sao Paulo' } });
}

beforeEach(() => {
  obterPagamento.mockResolvedValue(null);
  salvarPagamento.mockImplementation((dados: unknown) => Promise.resolve(dados));
  resumoFinanceiro.mockResolvedValue(resumo([cobranca()]));
  /*
    `CobrancaComPix` é um tipo PRÓPRIO, e não a cobrança com um campo a mais: o
    `aluno` dele é uma string. Espalhar a cobrança aqui punha `{id, nome}` onde a
    tela renderiza texto — e objeto como filho de React derruba a árvore inteira,
    que foi como esta prova apareceu com a tela em branco.
  */
  gerarPix.mockResolvedValue({
    cobrancaId: 'cob-1',
    valorCentavos: 24990,
    descricao: 'Mensalidade de outubro',
    aluno: 'Ana Souza',
    brCode: '00020126580014BR.GOV.BCB.PIX...6304ABCD',
  });
});

describe('receba fácil: a chave', () => {
  it('chave inválida não sai da tela', async () => {
    /*
      Chave errada não dá erro em lugar nenhum: o código é gerado, o aluno paga, e
      o dinheiro vai para outra conta. A recusa tem de ser aqui.
    */
    await abrirTela();
    await waitFor(() => expect(screen.getByText('Salvar chave')).toBeInTheDocument());

    // Tipo CPF (o padrão) com um e-mail digitado: chave que não existe.
    preencherChave('CPF', 'nao-e-um-cpf');

    expect(screen.getByText('Salvar chave')).toBeDisabled();
    expect(salvarPagamento).not.toHaveBeenCalled();
  });

  it('chave válida é salva, e a tela confirma que agora dá para gerar código', async () => {
    await abrirTela();
    await waitFor(() => expect(screen.getByText('Salvar chave')).toBeInTheDocument());

    preencherChave('EMAIL', 'diego@exemplo.com');
    fireEvent.click(screen.getByText('Salvar chave'));

    await waitFor(() =>
      expect(salvarPagamento).toHaveBeenCalledWith(
        expect.objectContaining({ chave: 'diego@exemplo.com', recebedor: 'Diego Personal' }) as unknown,
      ),
    );
    // Sem a confirmação, ninguém sabe se a chave ficou salva.
    await waitFor(() => expect(textoDaTela()).toMatch(/chave salva/i));
  });

  it('com chave já cadastrada, o botão fala de atualizar — e não de criar', async () => {
    obterPagamento.mockResolvedValue(chaveSalva);
    await abrirTela();

    await waitFor(() => expect(screen.getByText('Atualizar chave')).toBeInTheDocument());
    expect(campoDeTexto(0)).toHaveValue('diego@exemplo.com');
  });

  it('se não salvar, a tela não diz que salvou', async () => {
    salvarPagamento.mockRejectedValue(new ErroApi('DADOS_INVALIDOS', 'Chave já usada.', 422));
    await abrirTela();
    await waitFor(() => expect(screen.getByText('Salvar chave')).toBeInTheDocument());

    preencherChave('EMAIL', 'diego@exemplo.com');
    fireEvent.click(screen.getByText('Salvar chave'));

    // A mensagem da API passa: ela diz o que corrigir.
    await waitFor(() => expect(textoDaTela()).toMatch(/chave já usada/i));
    expect(textoDaTela()).not.toMatch(/chave salva\./i);
  });
});

describe('receba fácil: o código de cada cobrança', () => {
  it('gera o código da cobrança tocada', async () => {
    obterPagamento.mockResolvedValue(chaveSalva);
    await abrirTela();
    await waitFor(() => expect(screen.getByText('Gerar PIX')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Gerar PIX'));

    await waitFor(() => expect(gerarPix).toHaveBeenCalledWith('cob-1'));
    await waitFor(() => expect(textoDaTela()).toContain('00020126580014BR.GOV.BCB.PIX'));
  });

  it('sem chave cadastrada, não deixa gerar', async () => {
    // Gerar sem chave produziria um código que ninguém consegue pagar.
    await abrirTela();
    await waitFor(() => expect(screen.getByText('Gerar PIX')).toBeInTheDocument());

    expect(screen.getByText('Gerar PIX')).toBeDisabled();
  });

  it('falha ao gerar é dita, e não deixa um painel vazio no lugar', async () => {
    obterPagamento.mockResolvedValue(chaveSalva);
    gerarPix.mockRejectedValue(new Error('Failed to fetch'));
    await abrirTela();
    await waitFor(() => expect(screen.getByText('Gerar PIX')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Gerar PIX'));

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível gerar o código/i));
    expect(textoDaTela()).not.toMatch(/failed to fetch/i);
  });
});

describe('receba fácil: o que a tela diz quando não sabe', () => {
  it('falha ao ler a chave NÃO vira "cadastre sua chave PIX"', async () => {
    /*
      Dito a quem já tem chave, manda a pessoa cadastrar de novo o que já está
      lá — e o motivo que aparece nos botões desabilitados é falso.
    */
    obterPagamento.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'fetch failed', 0));
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toMatch(/não deu para ler sua chave pix/i));
    expect(textoDaTela()).not.toMatch(/cadastre sua chave pix acima/i);
  });

  it('falha ao ler as cobranças NÃO vira "nenhuma cobrança em aberto"', async () => {
    // Quem tem cinco em atraso leria que ninguém deve nada.
    resumoFinanceiro.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'fetch failed', 0));
    await abrirTela();

    await waitFor(() =>
      expect(textoDaTela()).toMatch(/não foi possível carregar as cobranças em aberto/i),
    );
    expect(textoDaTela()).not.toMatch(/nenhuma cobrança em aberto neste mês/i);
  });

  it('mês realmente sem cobrança continua dizendo isso', async () => {
    obterPagamento.mockResolvedValue(chaveSalva);
    resumoFinanceiro.mockResolvedValue(resumo([]));
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toMatch(/nenhuma cobrança em aberto neste mês/i));
  });

  it('cobrança já paga não entra na lista de a receber', async () => {
    // Gerar código de algo já pago é o caminho para receber duas vezes — e
    // devolver depois.
    obterPagamento.mockResolvedValue(chaveSalva);
    resumoFinanceiro.mockResolvedValue(
      resumo([cobranca({ situacao: 'PAGA', pagaEm: '2026-10-05', formaPagamento: 'PIX' })]),
    );
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toMatch(/nenhuma cobrança em aberto neste mês/i));
    expect(screen.queryByText('Gerar PIX')).not.toBeInTheDocument();
  });
});
