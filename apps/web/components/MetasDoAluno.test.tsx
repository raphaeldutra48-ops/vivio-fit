import { TipoMeta, type MetaResumo } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetasDoAluno } from './MetasDoAluno';

/**
 * As metas do aluno, vistas pelo profissional.
 *
 * Duas coisas aqui falavam com certeza sobre o que a tela não sabia, e as duas
 * têm o mesmo efeito: o profissional age como se a informação não existisse.
 *
 * 1. **Falhar ao LER as metas** mostrava o aviso de erro e, logo abaixo,
 *    "Nenhuma meta definida" — uma frase desmentindo a outra. Quem lê a de
 *    baixo recadastra a meta que já estava lá.
 * 2. **Falhar ao buscar a biblioteca de exercícios** deixava o seletor da meta
 *    de carga com só "Escolha…". O botão de salvar não liberava, e nada na tela
 *    dizia por quê — a leitura natural é que o app não tem exercícios.
 *
 * O alvo também é digitado: "82,5" é como se escreve peso em português, e a
 * conversão é a mesma dos dois aplicativos.
 */
const listarMetas = vi.fn();
const criarMeta = vi.fn();
const listarExercicios = vi.fn();

vi.mock('../lib/sdk', () => ({
  sdk: {
    metas: {
      listar: (...a: unknown[]) => listarMetas(...a),
      criar: (...a: unknown[]) => criarMeta(...a),
      concluir: vi.fn(),
      reabrir: vi.fn(),
      remover: vi.fn(),
    },
    exercicios: { listar: (...a: unknown[]) => listarExercicios(...a) },
  },
}));

const meta = (extras: Partial<MetaResumo> = {}): MetaResumo =>
  ({
    id: 'm1',
    tipo: TipoMeta.PESO_CORPORAL,
    titulo: 'Chegar a 75 kg',
    alvo: 75,
    valorInicial: 82,
    valorAtual: 80,
    progresso: 0.3,
    atingida: false,
    atrasada: false,
    prazo: null,
    concluidaEm: null,
    exercicio: null,
    ...extras,
  }) as MetaResumo;

const textoDaTela = () => document.body.textContent ?? '';

beforeEach(() => {
  listarMetas.mockResolvedValue([]);
  criarMeta.mockResolvedValue(undefined);
  listarExercicios.mockResolvedValue([
    { id: 'e1', nome: 'Agachamento livre', grupo: 'PERNAS' },
    { id: 'e2', nome: 'Supino reto', grupo: 'PEITO' },
  ]);
});

describe('metas do aluno', () => {
  it('sem meta nenhuma, explica que o sistema acompanha sozinho', async () => {
    render(<MetasDoAluno alunoId="aluna-1" />);

    expect(await screen.findByText(/nenhuma meta definida/i)).toBeInTheDocument();
  });

  it('meta existente aparece com o quanto andou, sem frase de vazio', async () => {
    listarMetas.mockResolvedValue([meta()]);
    render(<MetasDoAluno alunoId="aluna-1" />);

    expect(await screen.findByText('Chegar a 75 kg')).toBeInTheDocument();
    expect(textoDaTela()).toMatch(/começou em 82/);
    expect(textoDaTela()).toMatch(/agora 80/);
    expect(textoDaTela()).not.toMatch(/nenhuma meta definida/i);
  });

  it('falha ao ler as metas NÃO vira "nenhuma meta definida"', async () => {
    /*
      O defeito: o aviso de erro e a frase de vazio apareciam juntos. Quem lê a
      de baixo recadastra a meta que já existe — e a duplicada passa a disputar
      o mesmo gráfico de progresso.
    */
    listarMetas.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'fetch failed', 0));
    render(<MetasDoAluno alunoId="aluna-1" />);

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível carregar as metas/i));
    expect(textoDaTela()).not.toMatch(/nenhuma meta definida/i);
    expect(textoDaTela()).not.toMatch(/fetch failed/i);
  });

  it('sem autorização de evolução, a seção não aparece — e não acusa erro', async () => {
    // Não é falha nem ausência de metas: é o aluno não ter liberado a evolução.
    // Mostrar um erro aqui faria o profissional procurar defeito onde não há.
    listarMetas.mockRejectedValue(
      new ErroApi('CONSENTIMENTO_AUSENTE', 'sem autorização', 403),
    );
    render(<MetasDoAluno alunoId="aluna-1" />);

    await waitFor(() => expect(listarMetas).toHaveBeenCalled());
    expect(textoDaTela()).not.toMatch(/metas/i);
  });

  it('biblioteca de exercícios que falha avisa, em vez de deixar o seletor vazio', async () => {
    listarExercicios.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'fetch failed', 0));
    const usuario = userEvent.setup();
    render(<MetasDoAluno alunoId="aluna-1" />);

    await usuario.click(await screen.findByRole('button', { name: '+ Nova meta' }));
    await usuario.selectOptions(screen.getByLabelText('Tipo'), TipoMeta.CARGA_EXERCICIO);

    expect(
      await screen.findByText(/não deu para carregar a lista de exercícios/i),
    ).toBeInTheDocument();
  });

  it('com a biblioteca carregada, o seletor traz os exercícios e nenhum aviso', async () => {
    const usuario = userEvent.setup();
    render(<MetasDoAluno alunoId="aluna-1" />);

    await usuario.click(await screen.findByRole('button', { name: '+ Nova meta' }));
    await usuario.selectOptions(screen.getByLabelText('Tipo'), TipoMeta.CARGA_EXERCICIO);

    expect(await screen.findByRole('option', { name: 'Agachamento livre' })).toBeInTheDocument();
    expect(textoDaTela()).not.toMatch(/não deu para carregar a lista de exercícios/i);
  });

  it('alvo digitado com vírgula vira decimal, não inteiro nem NaN', async () => {
    // "82,5 kg" é como se escreve peso em português. Com `Number('82,5')` o
    // envio ia como `null` e o servidor recusava a meta inteira.
    const usuario = userEvent.setup();
    render(<MetasDoAluno alunoId="aluna-1" />);

    await usuario.click(await screen.findByRole('button', { name: '+ Nova meta' }));
    await usuario.type(screen.getByLabelText('Título'), 'Chegar a 82,5 kg');
    await usuario.type(screen.getByLabelText(/^Alvo/), '82,5');
    await usuario.click(screen.getByRole('button', { name: 'Criar meta' }));

    await waitFor(() => expect(criarMeta).toHaveBeenCalled());
    const [, corpo] = criarMeta.mock.calls[0] as [string, Record<string, unknown>];
    expect(corpo.alvo).toBe(82.5);
  });
});
