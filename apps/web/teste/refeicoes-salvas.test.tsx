import {
  salvarRefeicaoSchema,
  type AlimentoResumo,
  type Macros,
  type ReceitaResumo,
  type RefeicaoSalvaResumo,
  type SalvarRefeicaoInput,
} from '@vivio/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RefeicoesSalvas from '../app/(pro)/plano-alimentar/refeicoes/page';

/**
 * Complemento de `lib/plano-alimentar.spec.ts`: lá está a regra, aqui a fiação.
 *
 * O que só existe nesta tela é o **mesmo formulário servindo a criar e a
 * editar**, distinguidos por um detalhe fácil de apagar sem querer: `editando`
 * vale `null` na listagem, `''` no formulário de criação e o id na edição — e o
 * `if (editando)` conta com `''` ser falso. Trocar esse `''` por `null` mandaria
 * toda criação para a rota de atualização, sem quebrar nenhum teste de unidade.
 *
 * O outro é a volta do servidor para o formulário: `porcoes` e `quantidadeG`
 * são campos diferentes, e ler o errado põe um número plausível no lugar certo.
 */

const listarRefeicoes = vi.fn();
const listarReceitas = vi.fn();
const listarAlimentos = vi.fn();
const criar = vi.fn();
const atualizar = vi.fn();
const remover = vi.fn();

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('../lib/sdk', () => ({
  sdk: {
    refeicoesSalvas: {
      listar: (...a: unknown[]) => listarRefeicoes(...a),
      criar: (...a: unknown[]) => criar(...a),
      atualizar: (...a: unknown[]) => atualizar(...a),
      remover: (...a: unknown[]) => remover(...a),
    },
    receitas: { listar: (...a: unknown[]) => listarReceitas(...a) },
    alimentos: { listar: (...a: unknown[]) => listarAlimentos(...a) },
  },
}));

const MACROS: Macros = { kcal: 100, proteinaG: 10, carboidratoG: 5, gorduraG: 2, fibraG: 1 };

const AVEIA: AlimentoResumo = {
  id: 'cln00000000000000000001',
  nome: 'Aveia em flocos',
  grupo: 'Cereais',
  porcao100g: { kcal: 389, proteinaG: 17, carboidratoG: 66, gorduraG: 7, fibraG: 10 },
  medidaCaseira: 'colher de sopa',
  medidaGramas: 30,
};

const PANQUECA: ReceitaResumo = {
  id: 'cln00000000000000000002',
  nome: 'Panqueca proteica',
  descricao: null,
  modoPreparo: null,
  rendePorcoes: 2,
  nomeDaPorcao: 'unidade',
  tempoMinutos: 15,
  ingredientes: [],
  macrosTotais: MACROS,
  macrosPorPorcao: MACROS,
  pesoTotalG: 200,
};

/** Uma refeição já salva, com um item de cada tipo — é o que a edição relê. */
const CAFE: RefeicaoSalvaResumo = {
  id: 'cln00000000000000000003',
  nome: 'Café da manhã padrão',
  horarioSugerido: '07:30',
  observacao: 'Trocar a fruta conforme a estação.',
  itens: [
    {
      id: 'i1',
      nome: 'Aveia em flocos',
      ehReceita: false,
      alimentoId: AVEIA.id,
      receitaId: null,
      quantidadeG: 45,
      porcoes: null,
      observacao: null,
      macros: MACROS,
    },
    {
      id: 'i2',
      nome: 'Panqueca proteica',
      ehReceita: true,
      alimentoId: null,
      receitaId: PANQUECA.id,
      quantidadeG: null,
      porcoes: 2,
      observacao: null,
      macros: MACROS,
    },
  ],
  macrosTotais: MACROS,
};

beforeEach(() => {
  listarRefeicoes.mockResolvedValue([CAFE]);
  listarReceitas.mockResolvedValue([PANQUECA]);
  listarAlimentos.mockResolvedValue([AVEIA]);
  criar.mockResolvedValue({ id: 'cln00000000000000000004' });
  atualizar.mockResolvedValue({ id: CAFE.id });
  remover.mockResolvedValue(undefined);
});

const corpoDe = (espiao: typeof criar, indice: number) =>
  espiao.mock.calls[0]![indice] as SalvarRefeicaoInput;

/** A quantidade não tem rótulo próprio; o nome do item é o que identifica a linha. */
const linhaDe = (nome: string) =>
  within(screen.getByText(nome, { selector: 'span' }).parentElement!);

/** Busca com debounce de 300ms — sem os timers falsos, o teste esperaria de verdade. */
async function escolherAveia(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.type(screen.getByLabelText('Buscar alimento'), 'aveia');
  await usuario.click(await screen.findByRole('button', { name: /Aveia em flocos/ }));
}

describe('Refeições salvas', () => {
  it('criar manda para a rota de criação, não para a de atualização', async () => {
    const usuario = userEvent.setup();
    render(<RefeicoesSalvas />);

    await usuario.click(await screen.findByRole('button', { name: '+ Nova refeição' }));
    await usuario.type(screen.getByLabelText('Nome'), 'Lanche da tarde');
    await escolherAveia(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Criar refeição' }));

    expect(criar).toHaveBeenCalledTimes(1);
    expect(atualizar).not.toHaveBeenCalled();

    const corpo = corpoDe(criar, 0);
    expect(salvarRefeicaoSchema.safeParse(corpo).success).toBe(true);
    expect(corpo).toMatchObject({
      nome: 'Lanche da tarde',
      itens: [{ alimentoId: AVEIA.id, quantidadeG: 30 }],
    });
  });

  it('editar manda para a rota de atualização, com o id da refeição', async () => {
    const usuario = userEvent.setup();
    render(<RefeicoesSalvas />);

    await usuario.click(await screen.findByRole('button', { name: 'Editar' }));
    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(atualizar).toHaveBeenCalledTimes(1);
    expect(criar).not.toHaveBeenCalled();
    expect(atualizar.mock.calls[0]![0]).toBe(CAFE.id);
    expect(salvarRefeicaoSchema.safeParse(corpoDe(atualizar, 1)).success).toBe(true);
  });

  /*
    A volta do servidor: gramas e porções moram em campos diferentes do resumo.
    Ler o errado não quebra nada visivelmente — põe um número plausível no campo
    certo, e o nutricionista salva por cima achando que confirmou o que viu.
  */
  it('abrir para editar relê gramas do alimento e porções da receita', async () => {
    const usuario = userEvent.setup();
    render(<RefeicoesSalvas />);

    await usuario.click(await screen.findByRole('button', { name: 'Editar' }));

    expect(screen.getByLabelText('Nome')).toHaveValue('Café da manhã padrão');
    expect(screen.getByLabelText('Horário sugerido')).toHaveValue('07:30');
    expect(linhaDe('Aveia em flocos').getByRole('textbox')).toHaveValue('45');
    expect(linhaDe('Panqueca proteica').getByRole('textbox')).toHaveValue('2');
  });

  it('a mesma refeição volta ao servidor com os dois tipos de item intactos', async () => {
    const usuario = userEvent.setup();
    render(<RefeicoesSalvas />);

    await usuario.click(await screen.findByRole('button', { name: 'Editar' }));
    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    const corpo = corpoDe(atualizar, 1);
    expect(salvarRefeicaoSchema.safeParse(corpo).success).toBe(true);
    expect(corpo.itens).toEqual([
      expect.objectContaining({ alimentoId: AVEIA.id, quantidadeG: 45 }),
      expect.objectContaining({ receitaId: PANQUECA.id, porcoes: 2 }),
    ]);
  });

  it('receita entra como 1 porção; alimento entra na medida caseira dele', async () => {
    const usuario = userEvent.setup();
    render(<RefeicoesSalvas />);

    await usuario.click(await screen.findByRole('button', { name: '+ Nova refeição' }));
    await escolherAveia(usuario);
    await usuario.click(screen.getByRole('button', { name: /Panqueca proteica/ }));

    // 30 g é a `medidaGramas` da aveia, não um padrão de 100.
    expect(linhaDe('Aveia em flocos').getByRole('textbox')).toHaveValue('30');
    expect(linhaDe('Panqueca proteica').getByRole('textbox')).toHaveValue('1');
  });

  it('editar a quantidade de um item não mexe na do outro', async () => {
    const usuario = userEvent.setup();
    render(<RefeicoesSalvas />);

    await usuario.click(await screen.findByRole('button', { name: 'Editar' }));

    const gramas = linhaDe('Aveia em flocos').getByRole('textbox');
    await usuario.clear(gramas);
    await usuario.type(gramas, '60');

    expect(linhaDe('Aveia em flocos').getByRole('textbox')).toHaveValue('60');
    expect(linhaDe('Panqueca proteica').getByRole('textbox')).toHaveValue('2');
  });

  it('quantidade apagada trava o envio e marca o item', async () => {
    const usuario = userEvent.setup();
    render(<RefeicoesSalvas />);

    await usuario.click(await screen.findByRole('button', { name: 'Editar' }));
    await usuario.clear(linhaDe('Aveia em flocos').getByRole('textbox'));

    expect(linhaDe('Aveia em flocos').getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
  });

  it('refeição sem nenhum item não pode ser salva', async () => {
    const usuario = userEvent.setup();
    render(<RefeicoesSalvas />);

    await usuario.click(await screen.findByRole('button', { name: '+ Nova refeição' }));
    await usuario.type(screen.getByLabelText('Nome'), 'Vazia');

    expect(screen.getByRole('button', { name: 'Criar refeição' })).toBeDisabled();
    expect(criar).not.toHaveBeenCalled();
  });

  it('cancelar volta para a lista sem enviar nada', async () => {
    const usuario = userEvent.setup();
    render(<RefeicoesSalvas />);

    await usuario.click(await screen.findByRole('button', { name: 'Editar' }));
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByRole('button', { name: '+ Nova refeição' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome')).toBeNull();
    expect(atualizar).not.toHaveBeenCalled();
    expect(criar).not.toHaveBeenCalled();
  });

  it('abrir "nova" depois de editar não herda o que estava na tela', async () => {
    const usuario = userEvent.setup();
    render(<RefeicoesSalvas />);

    await usuario.click(await screen.findByRole('button', { name: 'Editar' }));
    expect(screen.getByLabelText('Nome')).toHaveValue('Café da manhã padrão');

    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));
    await usuario.click(screen.getByRole('button', { name: '+ Nova refeição' }));

    expect(screen.getByLabelText('Nome')).toHaveValue('');
    expect(screen.getByLabelText('Horário sugerido')).toHaveValue('');
    // E o botão volta a ser o de criação — é o `editando: ''` fazendo efeito.
    expect(screen.getByRole('button', { name: 'Criar refeição' })).toBeInTheDocument();
  });
});
