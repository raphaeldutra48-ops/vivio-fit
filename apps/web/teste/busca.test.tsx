import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useListaBuscada } from '../lib/busca';

/**
 * A corrida que esta regra existe para impedir.
 *
 * O caso que importa é o segundo teste: a busca antiga responde DEPOIS da nova.
 * Em tela de catálogo isso é esquisito; nas de montar treino e montar dieta é
 * clínico — a lista troca no instante do clique e entra no plano um item que
 * ninguém escolheu.
 */
function Tela({ termo, buscar }: { termo: string; buscar: (t: string) => Promise<string[]> }) {
  const { itens, carregando, falhou } = useListaBuscada(() => buscar(termo), [termo], 10);
  return (
    <div>
      <p data-testid="estado">{falhou ? 'falhou' : carregando ? 'carregando' : 'pronto'}</p>
      <ul>
        {itens.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

describe('useListaBuscada', () => {
  it('mostra o resultado da busca pedida', async () => {
    const buscar = vi.fn((t: string) => Promise.resolve([`item de ${t}`]));
    render(<Tela termo="frango" buscar={buscar} />);

    await waitFor(() => expect(screen.getByText('item de frango')).toBeInTheDocument());
    expect(screen.getByTestId('estado')).toHaveTextContent('pronto');
  });

  it('resposta ATRASADA de busca antiga não substitui a nova', async () => {
    /*
      "fran" demora 120 ms; "frango" responde em 5. A antiga chega por último — e
      é exatamente ela que não pode aparecer. Sem a sequência, a lista mostraria
      "resultado de fran" com o campo escrito "frango".
    */
    const buscar = (t: string) =>
      new Promise<string[]>((r) => setTimeout(() => r([`resultado de ${t}`]), t === 'fran' ? 120 : 5));

    const tela = render(<Tela termo="fran" buscar={buscar} />);
    tela.rerender(<Tela termo="frango" buscar={buscar} />);

    await waitFor(() => expect(screen.getByText('resultado de frango')).toBeInTheDocument());
    // Espera o suficiente para a resposta velha chegar e tentar entrar.
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.queryByText('resultado de fran')).not.toBeInTheDocument();
    expect(screen.getByText('resultado de frango')).toBeInTheDocument();
  });

  it('digitar depressa faz UMA busca, não uma por tecla', async () => {
    // Seis requisições para ler uma lista são cinco a mais na conta do Supabase
    // e na banda de quem está atendendo.
    const buscar = vi.fn((t: string) => Promise.resolve([`item de ${t}`]));
    const tela = render(<Tela termo="f" buscar={buscar} />);
    for (const t of ['fr', 'fra', 'fran', 'frang', 'frango']) {
      tela.rerender(<Tela termo={t} buscar={buscar} />);
    }

    await waitFor(() => expect(screen.getByText('item de frango')).toBeInTheDocument());
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(buscar).toHaveBeenCalledWith('frango');
  });

  it('a PRIMEIRA carga não espera o atraso', async () => {
    /*
      O atraso é para o que é digitado. Na abertura da tela ninguém digitou nada,
      e esperar só adiciona lista vazia. Foi a suíte de receitas que apontou isso:
      ela conferia a primeira consulta logo depois de a tela montar, e passou a
      falhar quando o atraso valia para todas.
    */
    const buscar = vi.fn(() => Promise.resolve(['primeiro item']));
    render(<Tela termo="" buscar={buscar} />);

    // Sem `waitFor` longo: se o atraso valesse aqui, isto falharia.
    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(1), { timeout: 50 });
  });

  it('falha da busca mais recente é dita, e não deixa lista velha passando por nova', async () => {
    const buscar = (t: string) =>
      t === 'quebra' ? Promise.reject(new Error('rede')) : Promise.resolve([`item de ${t}`]);

    const tela = render(<Tela termo="frango" buscar={buscar} />);
    await waitFor(() => expect(screen.getByText('item de frango')).toBeInTheDocument());

    tela.rerender(<Tela termo="quebra" buscar={buscar} />);

    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('falhou'));
  });

  it('falha ANTIGA não apaga o resultado novo', async () => {
    /*
      O espelho do segundo caso: a busca que falhou é a velha. Sem a sequência, o
      `falhou` dela apareceria sobre uma lista perfeitamente boa.
    */
    const buscar = (t: string) =>
      t === 'velha'
        ? new Promise<string[]>((_, rejeitar) => setTimeout(() => rejeitar(new Error('rede')), 120))
        : Promise.resolve([`item de ${t}`]);

    const tela = render(<Tela termo="velha" buscar={buscar} />);
    tela.rerender(<Tela termo="nova" buscar={buscar} />);

    await waitFor(() => expect(screen.getByText('item de nova')).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.getByTestId('estado')).toHaveTextContent('pronto');
  });
});
