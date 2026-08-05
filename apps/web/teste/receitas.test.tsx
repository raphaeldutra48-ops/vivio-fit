import {
  salvarReceitaSchema,
  type AlimentoResumo,
  type Macros,
  type ReceitaResumo,
  type SalvarReceitaInput,
} from '@vivio/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Receitas from '../app/(pro)/plano-alimentar/receitas/page';

/**
 * Complemento de `lib/plano-alimentar.spec.ts`: lá está a regra, aqui a fiação.
 *
 * O que é próprio desta tela, e que a regra não alcança, é a conversa com a
 * `BuscaDeAlimento`: ela recebe `jaEscolhidos` e some com o que já está na
 * receita. Isso não é enfeite — a lista usa `key={i.alimentoId}`, então o mesmo
 * alimento duas vezes daria chave repetida no React, e as gramas passariam a
 * ser escritas na linha errada. O filtro é o que impede.
 *
 * O outro é o campo de busca da listagem, que refaz a consulta ao servidor.
 */

const listarReceitas = vi.fn();
const listarAlimentos = vi.fn();
const criar = vi.fn();
const atualizar = vi.fn();

vi.mock('../lib/sdk', () => ({
  sdk: {
    receitas: {
      listar: (...a: unknown[]) => listarReceitas(...a),
      criar: (...a: unknown[]) => criar(...a),
      atualizar: (...a: unknown[]) => atualizar(...a),
      remover: vi.fn(),
    },
    alimentos: { listar: (...a: unknown[]) => listarAlimentos(...a) },
  },
}));

const MACROS: Macros = { kcal: 100, proteinaG: 10, carboidratoG: 5, gorduraG: 2, fibraG: 1 };

function alimento(id: string, nome: string, medidaGramas: number | null): AlimentoResumo {
  return {
    id,
    nome,
    grupo: 'Diversos',
    porcao100g: MACROS,
    medidaCaseira: medidaGramas ? 'unidade' : null,
    medidaGramas,
  };
}

const AVEIA = alimento('cln00000000000000000001', 'Aveia em flocos', 30);
const OVO = alimento('cln00000000000000000002', 'Ovo de galinha', 50);
/** Sem medida caseira: o padrão de 100 g é o que deve aparecer. */
const FARINHA = alimento('cln00000000000000000003', 'Farinha de amêndoas', null);

const PANQUECA: ReceitaResumo = {
  id: 'cln00000000000000000010',
  nome: 'Panqueca proteica',
  descricao: null,
  modoPreparo: 'Amasse a banana e misture.',
  rendePorcoes: 2,
  nomeDaPorcao: 'unidade',
  tempoMinutos: 15,
  ingredientes: [
    {
      id: 'ing1',
      alimentoId: AVEIA.id,
      nome: 'Aveia em flocos',
      quantidadeG: 45,
      observacao: null,
      macros: MACROS,
    },
  ],
  macrosTotais: MACROS,
  macrosPorPorcao: MACROS,
  pesoTotalG: 45,
};

beforeEach(() => {
  listarReceitas.mockResolvedValue([PANQUECA]);
  listarAlimentos.mockResolvedValue([AVEIA, OVO, FARINHA]);
  criar.mockResolvedValue({ id: 'cln00000000000000000011' });
  atualizar.mockResolvedValue({ id: PANQUECA.id });
});

const corpoDe = (espiao: typeof criar, indice: number) =>
  espiao.mock.calls[0]![indice] as SalvarReceitaInput;

const linhaDe = (nome: string) =>
  within(screen.getByText(nome, { selector: 'span' }).parentElement!);

async function buscar(usuario: ReturnType<typeof userEvent.setup>, termo: string) {
  const campo = screen.getByLabelText('Buscar alimento');
  await usuario.clear(campo);
  await usuario.type(campo, termo);
}

async function escolher(usuario: ReturnType<typeof userEvent.setup>, nome: string) {
  await buscar(usuario, nome.slice(0, 4));
  await usuario.click(await screen.findByRole('button', { name: new RegExp(nome) }));
}

describe('Receitas', () => {
  /*
    A defesa contra chave repetida no React. Sem o `jaEscolhidos`, dá para
    adicionar o mesmo alimento duas vezes, as duas linhas passam a compartilhar
    a chave, e digitar as gramas numa escreve na outra.
  */
  it('alimento já na receita some da busca', async () => {
    const usuario = userEvent.setup();
    render(<Receitas />);

    await usuario.click(await screen.findByRole('button', { name: '+ Nova receita' }));
    await escolher(usuario, 'Aveia em flocos');

    // Uma busca que casaria com os três: só os outros dois voltam.
    await buscar(usuario, 'a');
    await buscar(usuario, 'aa');

    expect(await screen.findByRole('button', { name: /Ovo de galinha/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aveia em flocos/ })).toBeNull();
  });

  it('alimento sem medida caseira entra com 100 g', async () => {
    const usuario = userEvent.setup();
    render(<Receitas />);

    await usuario.click(await screen.findByRole('button', { name: '+ Nova receita' }));
    await escolher(usuario, 'Farinha de amêndoas');
    await escolher(usuario, 'Ovo de galinha');

    expect(linhaDe('Farinha de amêndoas').getByRole('textbox')).toHaveValue('100');
    expect(linhaDe('Ovo de galinha').getByRole('textbox')).toHaveValue('50');
  });

  it('criar manda para a rota de criação, e o corpo passa no schema', async () => {
    const usuario = userEvent.setup();
    render(<Receitas />);

    await usuario.click(await screen.findByRole('button', { name: '+ Nova receita' }));
    await usuario.type(screen.getByLabelText('Nome'), 'Mingau de aveia');
    await escolher(usuario, 'Aveia em flocos');

    await usuario.click(screen.getByRole('button', { name: 'Criar receita' }));

    expect(criar).toHaveBeenCalledTimes(1);
    expect(atualizar).not.toHaveBeenCalled();

    const corpo = corpoDe(criar, 0);
    expect(salvarReceitaSchema.safeParse(corpo).success).toBe(true);
    expect(corpo).toMatchObject({
      nome: 'Mingau de aveia',
      rendePorcoes: 1,
      ingredientes: [{ alimentoId: AVEIA.id, quantidadeG: 30 }],
    });
    // Opcionais em branco viram ausência, não string vazia nem zero.
    expect(corpo.tempoMinutos).toBeUndefined();
    expect(corpo.nomeDaPorcao).toBeUndefined();
    expect(corpo.modoPreparo).toBeUndefined();
  });

  it('editar relê a receita inteira e volta pela rota de atualização', async () => {
    const usuario = userEvent.setup();
    render(<Receitas />);

    await usuario.click(await screen.findByRole('button', { name: 'Editar' }));

    expect(screen.getByLabelText('Nome')).toHaveValue('Panqueca proteica');
    expect(screen.getByLabelText('Rende quantas porções')).toHaveValue('2');
    expect(screen.getByLabelText('Tempo de preparo em minutos (opcional)')).toHaveValue('15');
    expect(screen.getByLabelText('Nome da porção (opcional)')).toHaveValue('unidade');
    expect(linhaDe('Aveia em flocos').getByRole('textbox')).toHaveValue('45');

    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(atualizar).toHaveBeenCalledTimes(1);
    expect(criar).not.toHaveBeenCalled();
    expect(atualizar.mock.calls[0]![0]).toBe(PANQUECA.id);

    const corpo = corpoDe(atualizar, 1);
    expect(salvarReceitaSchema.safeParse(corpo).success).toBe(true);
    expect(corpo).toMatchObject({
      rendePorcoes: 2,
      tempoMinutos: 15,
      ingredientes: [{ alimentoId: AVEIA.id, quantidadeG: 45 }],
    });
  });

  it('rendimento apagado trava o envio — é divisor do cálculo por porção', async () => {
    const usuario = userEvent.setup();
    render(<Receitas />);

    await usuario.click(await screen.findByRole('button', { name: 'Editar' }));
    await usuario.clear(screen.getByLabelText('Rende quantas porções'));

    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();

    await usuario.type(screen.getByLabelText('Rende quantas porções'), '0');
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
  });

  it('receita sem ingrediente não pode ser salva', async () => {
    const usuario = userEvent.setup();
    render(<Receitas />);

    await usuario.click(await screen.findByRole('button', { name: '+ Nova receita' }));
    await usuario.type(screen.getByLabelText('Nome'), 'Água quente');

    expect(screen.getByRole('button', { name: 'Criar receita' })).toBeDisabled();
    expect(criar).not.toHaveBeenCalled();
  });

  it('remover ingrediente tira o certo da lista', async () => {
    const usuario = userEvent.setup();
    render(<Receitas />);

    await usuario.click(await screen.findByRole('button', { name: '+ Nova receita' }));
    await escolher(usuario, 'Aveia em flocos');
    await escolher(usuario, 'Ovo de galinha');

    await usuario.click(linhaDe('Aveia em flocos').getByRole('button', { name: 'Remover' }));

    expect(screen.queryByText('Aveia em flocos', { selector: 'span' })).toBeNull();
    expect(linhaDe('Ovo de galinha').getByRole('textbox')).toHaveValue('50');
  });

  it('a busca da listagem refaz a consulta ao servidor', async () => {
    const usuario = userEvent.setup();
    render(<Receitas />);
    await screen.findByRole('button', { name: '+ Nova receita' });

    // A primeira carga vem sem termo.
    expect(listarReceitas).toHaveBeenCalledWith(undefined);

    await usuario.type(screen.getByLabelText('Buscar receita'), 'panq');

    expect(listarReceitas).toHaveBeenLastCalledWith('panq');
  });

  it('abrir "nova" depois de editar zera o formulário, com rendimento de volta em 1', async () => {
    const usuario = userEvent.setup();
    render(<Receitas />);

    await usuario.click(await screen.findByRole('button', { name: 'Editar' }));
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));
    await usuario.click(screen.getByRole('button', { name: '+ Nova receita' }));

    expect(screen.getByLabelText('Nome')).toHaveValue('');
    // '1' e não '': o rendimento em branco travaria o botão de saída.
    expect(screen.getByLabelText('Rende quantas porções')).toHaveValue('1');
    expect(screen.getByRole('button', { name: 'Criar receita' })).toBeInTheDocument();
  });
});
