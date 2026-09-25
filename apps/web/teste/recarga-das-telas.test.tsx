import { Papel } from '@vivio/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A recarga das telas, que era a pendência 25.
 *
 * Seis efeitos tinham a lista de dependências escrita à mão e **certa por
 * manutenção, não por construção**: funcionavam porque alguém as manteve
 * corretas. O risco era latente — quem editasse a função de recarga para usar um
 * estado novo e esquecesse de acrescentá-lo ganharia um closure velho: a tela
 * mostrando o resultado anterior, sem erro nenhum para investigar.
 *
 * A correção foi `useCallback`/`useMemo`, e ela só é segura se o comportamento
 * continuar o mesmo. É isso que este arquivo prova, e é o que faltava para a
 * pendência poder ser paga: que a tela recarrega quando o que ela observa muda,
 * e **não recarrega em laço**.
 *
 * O caso do menu é o mais afiado. Lá a dependência correta (`blocos`) só pode
 * entrar na lista porque o valor passou a ser memorizado: sem isso, cada render
 * criaria um array novo, o efeito rodaria de novo, chamaria `setAbertas` com um
 * objeto novo, e o render seguinte repetiria tudo — laço infinito. Um teste que
 * renderiza e termina é a prova de que não há laço; se houvesse, ele travaria.
 */

const listarExercicios = vi.fn();
const listarMetas = vi.fn();
const criarMeta = vi.fn();

vi.mock('../lib/sdk', () => ({
  sdk: {
    exercicios: {
      listar: (...a: unknown[]) => listarExercicios(...a),
      planoDeGravacao: () => Promise.resolve([]),
      midia: () => Promise.resolve({ itens: [] }),
    },
    metas: {
      listar: (...a: unknown[]) => listarMetas(...a),
      criar: (...a: unknown[]) => criarMeta(...a),
      concluir: vi.fn(),
      remover: vi.fn(),
    },
  },
}));

const caminho = vi.fn(() => '/plano-alimentar/receitas');
vi.mock('next/navigation', () => ({ usePathname: () => caminho() }));

beforeEach(() => {
  vi.clearAllMocks();
  listarExercicios.mockResolvedValue([]);
  listarMetas.mockResolvedValue([]);
});

describe('biblioteca de exercícios: recarrega ao buscar', () => {
  it('a busca digitada chega ao servidor, e a tela não fica recarregando sozinha', async () => {
    const { default: Exercicios } = await import('../app/(pro)/exercicios/page');
    render(<Exercicios />);

    await waitFor(() => expect(listarExercicios).toHaveBeenCalled());
    const chamadasIniciais = listarExercicios.mock.calls.length;

    await userEvent.type(screen.getByLabelText(/buscar na biblioteca/i), 'agacha');

    await waitFor(() =>
      expect(listarExercicios).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'agacha' }) as unknown,
      ),
    );

    /*
      O par que importa: a tela recarrega porque a BUSCA mudou, e não a cada
      render. Sem esse limite, o closure novo a cada render viraria uma consulta
      por render — a tela pisca e a fila de rede enche.
    */
    const depois = listarExercicios.mock.calls.length;
    await new Promise((r) => setTimeout(r, 120));
    expect(listarExercicios.mock.calls.length).toBe(depois);
    expect(depois).toBeGreaterThan(chamadasIniciais);
  });
});

describe('metas do aluno: recarrega ao trocar de aluno', () => {
  it('trocar o aluno busca as metas do novo, e só uma vez por aluno', async () => {
    const { MetasDoAluno } = await import('../components/MetasDoAluno');
    const { rerender } = render(<MetasDoAluno alunoId="aluno-1" />);

    await waitFor(() => expect(listarMetas).toHaveBeenCalledWith('aluno-1'));

    rerender(<MetasDoAluno alunoId="aluno-2" />);
    await waitFor(() => expect(listarMetas).toHaveBeenCalledWith('aluno-2'));

    // Re-render sem troca de aluno não pede de novo.
    rerender(<MetasDoAluno alunoId="aluno-2" />);
    await new Promise((r) => setTimeout(r, 120));
    expect(listarMetas.mock.calls.filter(([id]) => id === 'aluno-2')).toHaveLength(1);
  });

  it('a biblioteca de exercícios só é buscada quando a meta precisa dela', async () => {
    /*
      São 156 itens, e nenhuma meta de peso precisa deles. O efeito que decide
      isso lê `exercicios.length` — que estava fora da lista de dependências e
      agora está.
    */
    const { MetasDoAluno } = await import('../components/MetasDoAluno');
    render(<MetasDoAluno alunoId="aluno-1" />);
    await waitFor(() => expect(listarMetas).toHaveBeenCalled());

    expect(listarExercicios).not.toHaveBeenCalled();
  });
});

describe('menu lateral: abre a seção da página atual', () => {
  it('abre onde a pessoa está, e termina de renderizar (não entra em laço)', async () => {
    const { MenuLateral } = await import('../components/MenuLateral');
    render(<MenuLateral papel={Papel.NUTRICIONISTA} />);

    // A seção que contém /plano-alimentar/receitas fica aberta sozinha: chegar
    // numa tela sem ver onde ela está na navegação é perder o mapa.
    expect(await screen.findByRole('link', { name: /receitas/i })).toBeInTheDocument();
  });

  it('mudar de página abre a seção nova', async () => {
    const { MenuLateral } = await import('../components/MenuLateral');
    const { rerender } = render(<MenuLateral papel={Papel.NUTRICIONISTA} />);
    expect(await screen.findByRole('link', { name: /receitas/i })).toBeInTheDocument();

    caminho.mockReturnValue('/prescricoes/suplementos');
    rerender(<MenuLateral papel={Papel.NUTRICIONISTA} />);

    expect(await screen.findByRole('link', { name: /suplementos/i })).toBeInTheDocument();
  });
});
