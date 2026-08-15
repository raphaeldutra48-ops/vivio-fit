import type { ExercicioAGravar } from '@vivio/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FilaDeGravacao } from '../components/FilaDeGravacao';

/**
 * A fila de gravação das demonstrações.
 *
 * O que se protege aqui é uma coisa só: **nunca mostrar uma fila vazia quando
 * há trabalho a fazer**. O primeiro corte que escrevi só listava o que o
 * profissional já tinha prescrito — e no primeiro dia de uso ninguém prescreveu
 * nada, então a tela aparecia sem um único botão de gravar. O botão existia,
 * atrás de um link discreto, mas quem abriu a tela concluiu que a gravação não
 * estava lá. Foi exatamente o que aconteceu.
 */

const planoDeGravacao = vi.fn();

vi.mock('../lib/sdk', () => ({
  sdk: { exercicios: { planoDeGravacao: () => planoDeGravacao() } },
}));

function item(nome: string, vezesPrescrito: number, temAlgumaReferencia = false): ExercicioAGravar {
  return {
    id: `id-${nome.replace(/\s/g, '-')}`,
    nome,
    grupoMuscular: 'PEITO',
    equipamento: 'Barra',
    escopo: 'GLOBAL',
    vezesPrescrito,
    temAlgumaReferencia,
  };
}

/** O serviço já entrega ordenado; aqui só imitamos o formato. */
const acervoSemHistorico = Array.from({ length: 30 }, (_, i) => item(`Exercício ${i + 1}`, 0));

beforeEach(() => {
  planoDeGravacao.mockReset();
});

describe('FilaDeGravacao', () => {
  const props = { aoGravar: vi.fn(), gravandoId: null, recarregarEm: 0 };

  it('sem treinos montados, ainda oferece o que gravar', async () => {
    planoDeGravacao.mockResolvedValue(acervoSemHistorico);
    render(<FilaDeGravacao {...props} />);

    // O defeito: aqui vinham zero botões, e a tela parecia não ter a função.
    const botoes = await screen.findAllByRole('button', { name: /Gravar/ });
    expect(botoes.length).toBeGreaterThan(0);
    expect(screen.getByText(/ainda não montou treinos/)).toBeTruthy();
  });

  it('com prescrições, mostra só o que ele prescreve', async () => {
    planoDeGravacao.mockResolvedValue([
      item('Agachamento livre', 2),
      item('Supino reto', 2, true),
      ...acervoSemHistorico,
    ]);
    render(<FilaDeGravacao {...props} />);

    expect(await screen.findByText(/Agachamento livre/)).toBeTruthy();
    expect(screen.getByText(/Supino reto/)).toBeTruthy();
    // O acervo fica atrás do link — senão a fila volta a ser a biblioteca.
    expect(screen.queryByText('Exercício 1')).toBeNull();
    expect(screen.getByText(/Ver os outros 30 do acervo/)).toBeTruthy();
  });

  /* Concordância: "em 1 treino seus" saltava aos olhos na tela. */
  it('fala 1 treino seu, e 2 treinos seus', async () => {
    planoDeGravacao.mockResolvedValue([item('Remada', 1), item('Supino', 2)]);
    render(<FilaDeGravacao {...props} />);

    expect(await screen.findByText(/em 1 treino seu$/)).toBeTruthy();
    expect(screen.getByText(/em 2 treinos seus$/)).toBeTruthy();
  });

  it('o link abre o resto do acervo e volta', async () => {
    planoDeGravacao.mockResolvedValue([item('Agachamento livre', 2), ...acervoSemHistorico]);
    render(<FilaDeGravacao {...props} />);

    await userEvent.click(await screen.findByText(/Ver os outros 30 do acervo/));
    expect(screen.getByText('Exercício 1')).toBeTruthy();

    await userEvent.click(screen.getByText(/Mostrar só o que eu prescrevo/));
    expect(screen.queryByText('Exercício 1')).toBeNull();
  });

  it('acervo todo gravado: diz isso, e não uma lista vazia', async () => {
    planoDeGravacao.mockResolvedValue([]);
    render(<FilaDeGravacao {...props} />);

    expect(await screen.findByText(/Acervo gravado/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Gravar/ })).toBeNull();
  });

  /*
    Falha de rede não pode deixar a tela em branco: a biblioteca inteira fica
    logo abaixo, e um erro mudo faria a página parecer quebrada.
  */
  it('erro de carregamento é dito', async () => {
    planoDeGravacao.mockRejectedValue(new Error('rede'));
    render(<FilaDeGravacao {...props} />);

    expect(await screen.findByText(/Não foi possível carregar a fila/)).toBeTruthy();
  });
});
