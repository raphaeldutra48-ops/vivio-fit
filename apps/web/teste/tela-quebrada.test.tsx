import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TelaQuebrada } from '../components/TelaQuebrada';

/**
 * A barreira de erro do painel — a diferença entre "algo quebrou" e uma página
 * em branco.
 *
 * Três suítes novas deste mês derrubaram a árvore inteira por causa de um campo
 * ausente na resposta, e o resultado foi sempre o mesmo: nada na tela. Em produção
 * a causa é idêntica (campo novo chegando `null`, resposta parcial, formato
 * mudado de um lado só), e quem vê é um profissional no meio de um atendimento.
 */
describe('tela quebrada', () => {
  it('diz o que aconteceu, e que não foi a pessoa', () => {
    render(<TelaQuebrada aoTentarDeNovo={vi.fn()} />);

    expect(screen.getByText('Algo quebrou nesta tela')).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/não foi você/i);
  });

  it('promete só o que pode cumprir', () => {
    /*
      "Nada foi perdido" seria mentira na hora em que a pessoa tem menos motivo
      para confiar no sistema — e ela descobriria sozinha, ao voltar e não
      encontrar o que digitou.
    */
    render(<TelaQuebrada aoTentarDeNovo={vi.fn()} />);

    expect(document.body.textContent).toMatch(/o que já estava salvo continua salvo/i);
    expect(document.body.textContent).toMatch(/o que você estava preenchendo aqui agora, não/i);
  });

  it('tem duas saídas: tentar de novo e ir para uma tela que sempre funciona', () => {
    const tentarDeNovo = vi.fn();
    render(<TelaQuebrada aoTentarDeNovo={tentarDeNovo} />);

    fireEvent.click(screen.getByText('Tentar de novo'));

    expect(tentarDeNovo).toHaveBeenCalled();
    // Link comum, e não navegação do Next: ela pode ser o que quebrou.
    const saida = screen.getByText('Ir para meus alunos') as HTMLAnchorElement;
    expect(saida.getAttribute('href')).toBe('/alunos');
  });

  it('mostra o código do erro quando existe — é o que o suporte pede', () => {
    render(<TelaQuebrada aoTentarDeNovo={vi.fn()} detalhe="a1b2c3" />);

    expect(document.body.textContent).toMatch(/código do erro: a1b2c3/i);
  });

  it('sem código, não inventa um campo vazio na tela', () => {
    render(<TelaQuebrada aoTentarDeNovo={vi.fn()} />);

    expect(document.body.textContent).not.toMatch(/código do erro/i);
  });
});
