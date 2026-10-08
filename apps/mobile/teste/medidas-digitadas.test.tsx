import { obterTema } from '@vivio/ui-native';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { navegacao, renderizar } from './preparo';

/**
 * As medidas digitadas à mão — sete campos, todos opcionais, todos decimais.
 *
 * É a tela onde a conversão de texto para número mais aparece: fita métrica dá
 * "84,5", balança dá "78,4", e o teclado daqui oferece vírgula. O que se prova
 * aqui é que nenhum caminho produz `NaN` — o valor que atravessa a tela calado,
 * vira `null` no JSON e volta como uma recusa genérica do formulário INTEIRO,
 * sem dizer qual campo tinha o problema.
 *
 * A mesma regra tem prova de unidade em `packages/contracts/src/numeros.spec.ts`.
 * O que falta lá e está aqui é a fiação: que a tela usa a regra, que ela avisa
 * ANTES de mandar, e que ela manda só o que a pessoa preencheu.
 */
const registrar = vi.fn();

vi.mock('../src/sdk', () => ({
  sdk: { medidas: { registrar: (...a: unknown[]) => registrar(...a) } },
}));

const usuario = { id: 'aluna-1', nome: 'Ana Souza', email: 'ana@exemplo.com', papel: 'ALUNO' };
const sessao = { tema: obterTema('claro'), nomeDoTema: 'claro', usuario, carregando: false };
vi.mock('../src/sessao', () => ({ useSessao: () => sessao }));

async function abrirTela() {
  const { default: Medidas } = await import('../app/medidas');
  return renderizar(<Medidas />);
}

function digitar(rotulo: RegExp, valor: string): void {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
}

const corpoEnviado = () => (registrar.mock.calls[0] as [string, Record<string, unknown>])[1];

beforeEach(() => {
  registrar.mockResolvedValue(undefined);
});

describe('medidas digitadas', () => {
  it('vírgula é decimal: 78,4 chega como 78.4', async () => {
    await abrirTela();
    digitar(/peso em kg/i, '78,4');

    fireEvent.click(screen.getByLabelText(/salvar medidas/i));

    await waitFor(() => expect(registrar).toHaveBeenCalled());
    expect(corpoEnviado().pesoKg).toBe(78.4);
  });

  it('valor ilegível é apontado pelo NOME do campo, e nada é enviado', async () => {
    /*
      O defeito que esta prova fixa: "1,7,5" (acontece ao corrigir sem apagar)
      virava `NaN`, o servidor recusava o formulário inteiro e a tela dizia
      "Confira os valores" — sobre sete campos, sem dizer qual.
    */
    await abrirTela();
    digitar(/peso em kg/i, '78,4');
    digitar(/cintura em cm/i, '84,,5');

    fireEvent.click(screen.getByLabelText(/salvar medidas/i));

    await waitFor(() =>
      expect(screen.getByText(/não consegui ler o valor de cintura/i)).toBeInTheDocument(),
    );
    // E nada foi gravado pela metade.
    expect(registrar).not.toHaveBeenCalled();
  });

  it('só vai o que a pessoa mediu hoje', async () => {
    /*
      Campo em branco virando zero gravaria uma cintura de 0 cm no histórico —
      e o gráfico de evolução mostraria uma queda que nunca existiu.
    */
    await abrirTela();
    digitar(/peso em kg/i, '78');
    digitar(/braço em cm/i, '35');

    fireEvent.click(screen.getByLabelText(/salvar medidas/i));

    await waitFor(() => expect(registrar).toHaveBeenCalled());
    expect(Object.keys(corpoEnviado()).sort()).toEqual(['bracoCm', 'data', 'pesoKg']);
  });

  it('salvou, leva para a composição — onde o número vira gráfico', async () => {
    await abrirTela();
    digitar(/peso em kg/i, '78');

    fireEvent.click(screen.getByLabelText(/salvar medidas/i));

    await waitFor(() => expect(navegacao.replace).toHaveBeenCalledWith('/composicao'));
  });

  it('sem nenhum campo preenchido, o botão não promete o que não faz', async () => {
    await abrirTela();

    expect(screen.getByText('Preencha ao menos um campo')).toBeInTheDocument();
    expect(registrar).not.toHaveBeenCalled();
  });
});
