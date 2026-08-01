import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Anuncio } from './Anuncio';
import { PunhoDeArraste, estiloDeArraste, useArrasteParaReordenar } from './Reordenavel';
import { anuncioDeMovimento, reordenar } from '../lib/reordenar';

/**
 * Cobre a **fiação** entre arrastar, os botões ↑ ↓ e a lista (pendência 6).
 * A regra de mover em si é testada sem DOM em `lib/reordenar.spec.ts`.
 *
 * O que importa provar aqui: as duas formas de reordenar chegam à mesma
 * função, e a que existe para teclado e leitor de tela não foi perdida no
 * caminho.
 */

/** jsdom não implementa DataTransfer; o gesto precisa de um objeto qualquer. */
const transferencia = () => ({
  dataTransfer: {
    effectAllowed: '',
    dropEffect: '',
    setData: () => undefined,
    getData: () => '',
  },
});

function Lista({ iniciais }: { iniciais: string[] }) {
  const [itens, setItens] = useState(iniciais);
  const [anuncio, setAnuncio] = useState('');

  const mover = (de: number, para: number) => {
    const proximos = reordenar(itens, de, para);
    if (proximos === itens) return;
    const destino = Math.max(0, Math.min(proximos.length - 1, para));
    setAnuncio(anuncioDeMovimento(itens[de]!, destino + 1, proximos.length));
    setItens(proximos);
  };

  const arraste = useArrasteParaReordenar(mover);

  return (
    <>
      {itens.map((item, i) => (
        <div
          key={item}
          data-testid={`item-${i}`}
          {...arraste.propsDoItem(i)}
          style={estiloDeArraste(i, arraste.arrastando, arraste.alvo)}
        >
          <PunhoDeArraste titulo={`Arraste ${item}`} {...arraste.propsDoPunho(i)} />
          <span>{item}</span>
          <button onClick={() => mover(i, i - 1)} disabled={i === 0} aria-label={`Subir ${item}`}>
            ↑
          </button>
          <button
            onClick={() => mover(i, i + 1)}
            disabled={i === itens.length - 1}
            aria-label={`Descer ${item}`}
          >
            ↓
          </button>
        </div>
      ))}
      <Anuncio texto={anuncio} />
      {/* div e não <output>: <output> tem role="status" implícito e disputaria
          a consulta com a própria região viva que este arquivo testa. */}
      <div data-testid="ordem">{itens.join(',')}</div>
    </>
  );
}

const ordem = () => screen.getByTestId('ordem').textContent;
const punho = (indice: number) =>
  screen.getByTitle(`Arraste ${['Supino', 'Agachamento', 'Remada', 'Rosca'][indice]}`);

const arrastarDe = (de: number, para: number) => {
  fireEvent.dragStart(punho(de), transferencia());
  fireEvent.dragOver(screen.getByTestId(`item-${para}`), transferencia());
  fireEvent.drop(screen.getByTestId(`item-${para}`), transferencia());
};

describe('reordenar por arrasto', () => {
  it('soltar sobre outro item leva o arrastado para aquela posição', () => {
    render(<Lista iniciais={['Supino', 'Agachamento', 'Remada', 'Rosca']} />);

    arrastarDe(3, 0);

    expect(ordem()).toBe('Rosca,Supino,Agachamento,Remada');
  });

  /**
   * Regressão encontrada operando o navegador, não pelos testes acima.
   *
   * `fireEvent` reconcilia entre uma chamada e outra, então o manipulador do
   * `dragover` já enxergava o estado gravado no `dragstart`. No navegador de
   * verdade os três eventos podem cair no mesmo tique, e aí o estado ainda não
   * chegou — o gesto virava nada. Por isso a origem vive num ref.
   */
  it('funciona mesmo com os eventos no mesmo tique, sem render entre eles', () => {
    render(<Lista iniciais={['Supino', 'Agachamento', 'Remada', 'Rosca']} />);

    act(() => {
      fireEvent.dragStart(punho(3), transferencia());
      fireEvent.dragOver(screen.getByTestId('item-0'), transferencia());
      fireEvent.drop(screen.getByTestId('item-0'), transferencia());
    });

    expect(ordem()).toBe('Rosca,Supino,Agachamento,Remada');
  });

  it('soltar no mesmo lugar não muda nada', () => {
    render(<Lista iniciais={['Supino', 'Agachamento', 'Remada', 'Rosca']} />);

    arrastarDe(1, 1);

    expect(ordem()).toBe('Supino,Agachamento,Remada,Rosca');
  });

  it('o item sob o cursor fica destacado durante o gesto', () => {
    render(<Lista iniciais={['Supino', 'Agachamento', 'Remada', 'Rosca']} />);

    fireEvent.dragStart(punho(0), transferencia());
    fireEvent.dragOver(screen.getByTestId('item-2'), transferencia());

    expect(screen.getByTestId('item-2')).toHaveStyle({ outlineOffset: '2px' });
    // O que está sendo arrastado fica apagado, para não parecer que duplicou.
    expect(screen.getByTestId('item-0')).toHaveStyle({ opacity: '0.4' });
  });

  it('largar fora de qualquer item encerra o gesto sem mexer na lista', () => {
    render(<Lista iniciais={['Supino', 'Agachamento', 'Remada', 'Rosca']} />);

    fireEvent.dragStart(punho(2), transferencia());
    fireEvent.dragEnd(punho(2), transferencia());

    expect(ordem()).toBe('Supino,Agachamento,Remada,Rosca');
    expect(screen.getByTestId('item-2')).not.toHaveStyle({ opacity: '0.4' });
  });

  /**
   * O ponto da pendência 6: o arrastar era para ser adição, não troca. Se
   * alguém remover os botões um dia, este teste cai.
   */
  it('os botões ↑ ↓ continuam funcionando', async () => {
    const usuario = userEvent.setup();
    render(<Lista iniciais={['Supino', 'Agachamento', 'Remada', 'Rosca']} />);

    await usuario.click(screen.getByRole('button', { name: 'Descer Supino' }));
    expect(ordem()).toBe('Agachamento,Supino,Remada,Rosca');

    await usuario.click(screen.getByRole('button', { name: 'Subir Rosca' }));
    expect(ordem()).toBe('Agachamento,Supino,Rosca,Remada');
  });

  it('as pontas desabilitam o botão que não leva a lugar nenhum', () => {
    render(<Lista iniciais={['Supino', 'Agachamento']} />);

    expect(screen.getByRole('button', { name: 'Subir Supino' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descer Agachamento' })).toBeDisabled();
  });

  /** Sem isto, quem usa leitor de tela clica no botão e nada é anunciado. */
  it('mover anuncia a nova posição em região viva', async () => {
    const usuario = userEvent.setup();
    render(<Lista iniciais={['Supino', 'Agachamento', 'Remada', 'Rosca']} />);

    await usuario.click(screen.getByRole('button', { name: 'Descer Supino' }));

    const regiao = screen.getByRole('status');
    expect(regiao).toHaveTextContent('Supino movido para a posição 2 de 4.');
    expect(regiao).toHaveAttribute('aria-live', 'polite');
  });

  it('arrastar também anuncia — o gesto e o botão contam a mesma coisa', () => {
    render(<Lista iniciais={['Supino', 'Agachamento', 'Remada', 'Rosca']} />);

    arrastarDe(0, 2);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Supino movido para a posição 3 de 4.',
    );
  });

  /**
   * O punho é decoração para quem não usa mouse: os botões ↑ ↓ é que movem.
   * Anunciá-lo daria uma parada de tabulação que não leva a nada.
   */
  it('o punho não vira controle para leitor de tela', () => {
    render(<Lista iniciais={['Supino', 'Agachamento']} />);

    expect(punho(0)).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('button', { name: /Arraste/ })).toBeNull();
  });
});
