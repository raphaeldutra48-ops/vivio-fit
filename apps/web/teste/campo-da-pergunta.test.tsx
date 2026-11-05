import type { PerguntaResumo } from '@vivio/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CampoDaPergunta } from '../components/CampoDaPergunta';

/**
 * O campo de resposta da anamnese, por tipo de pergunta.
 *
 * Duas coisas que estavam erradas e que esta prova trava:
 *
 * - **o campo não tinha nome acessível**: a pergunta é um `<p>` acima dele, sem
 *   ligação. Com leitor de tela o profissional ouvia "caixa de texto" sem saber de
 *   qual pergunta. Aqui, cada campo é procurado PELO TEXTO DA PERGUNTA — se o
 *   rótulo sair, a prova não acha o campo;
 * - **a pergunta de número era `type="number"`**, em que "72,5" pode virar valor
 *   vazio conforme o navegador. A resposta é o texto que a pessoa escreveu.
 */
const pergunta = (extras: Partial<PerguntaResumo>): PerguntaResumo =>
  ({
    id: 'p1',
    texto: 'Qual é o seu peso hoje?',
    tipo: 'TEXTO',
    obrigatoria: false,
    ajuda: null,
    opcoes: [],
    ordem: 0,
    ...extras,
  }) as PerguntaResumo;

const vazia = { valor: '', valores: [] as string[] };

describe('campo da pergunta: nome acessível em todo tipo', () => {
  it.each(['TEXTO', 'TEXTO_LONGO', 'NUMERO', 'DATA'] as const)(
    '%s é achado pelo texto da pergunta',
    (tipo) => {
      render(<CampoDaPergunta pergunta={pergunta({ tipo })} resposta={vazia} aoResponder={vi.fn()} />);
      expect(screen.getByLabelText('Qual é o seu peso hoje?')).toBeInTheDocument();
    },
  );

  it.each([
    ['SIM_NAO', []],
    ['ESCOLHA_UNICA', ['Manhã', 'Noite']],
    ['ESCOLHA_MULTIPLA', ['Joelho', 'Ombro']],
  ] as const)('%s é um grupo com o nome da pergunta', (tipo, opcoes) => {
    // "Sim" e "Não" sozinhos não dizem a que respondem.
    render(
      <CampoDaPergunta
        pergunta={pergunta({ tipo, texto: 'Sente dor ao treinar?', opcoes: [...opcoes] })}
        resposta={vazia}
        aoResponder={vi.fn()}
      />,
    );
    expect(screen.getByRole('group', { name: 'Sente dor ao treinar?' })).toBeInTheDocument();
  });
});

describe('campo da pergunta: número com vírgula', () => {
  it('é texto com teclado decimal, e não type="number"', () => {
    render(<CampoDaPergunta pergunta={pergunta({ tipo: 'NUMERO' })} resposta={vazia} aoResponder={vi.fn()} />);
    const campo = screen.getByLabelText('Qual é o seu peso hoje?');
    expect(campo).toHaveAttribute('type', 'text');
    expect(campo).toHaveAttribute('inputMode', 'decimal');
  });

  it('"72,5" chega à resposta como foi escrito', () => {
    const aoResponder = vi.fn();
    render(<CampoDaPergunta pergunta={pergunta({ tipo: 'NUMERO' })} resposta={vazia} aoResponder={aoResponder} />);
    fireEvent.change(screen.getByLabelText('Qual é o seu peso hoje?'), { target: { value: '72,5' } });
    expect(aoResponder).toHaveBeenCalledWith({ valor: '72,5' });
  });
});
