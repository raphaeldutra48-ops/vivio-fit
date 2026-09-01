import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { deslocamentoParaCaber, EstadoVazio, Explicacao, MARGEM_DA_JANELA } from '../components/ui';
import { ProvedorDeModoDiscreto, Sensivel, useModoDiscreto } from '../lib/modo-discreto';

/**
 * Os três componentes que faltavam para o app parar de parecer inacabado:
 * a tela vazia que explica, o ⓘ que define o termo, e o modo discreto.
 *
 * O que estes testes protegem não é a aparência — é o comportamento em que
 * cada um deles falha silenciosamente: o balão que estoura a janela, o valor
 * sensível que continua no papel, e a preferência que não sobrevive.
 */

describe('EstadoVazio', () => {
  it('diz o que houve e o que fazer, com a ação junto', () => {
    render(
      <EstadoVazio
        icone="👥"
        titulo="Nenhum aluno ainda"
        descricao="Convide seu primeiro aluno para começar a prescrever."
        acao={<button>Convidar aluno</button>}
      />,
    );
    expect(screen.getByText('Nenhum aluno ainda')).toBeInTheDocument();
    expect(screen.getByText(/Convide seu primeiro aluno/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Convidar aluno' })).toBeInTheDocument();
  });

  /*
    Vazio sem saída pelas mãos do profissional existe — "o aluno ainda não
    autorizou" é recado, não botão. Forçar uma ação ali inventaria um caminho
    que não leva a lugar nenhum.
  */
  it('funciona sem ação', () => {
    render(<EstadoVazio icone="🔒" titulo="Sem autorização" descricao="O aluno decide." />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  /* O ícone é decoração: lido em voz alta, "cara de pessoas" não informa nada. */
  it('o ícone não é anunciado pelo leitor de tela', () => {
    const { container } = render(
      <EstadoVazio icone="👥" titulo="Vazio" descricao="Nada aqui." />,
    );
    expect(container.querySelector('[aria-hidden]')).toHaveTextContent('👥');
  });
});

/**
 * Onde o balão vai parar.
 *
 * A primeira versão virava o balão para a direita quando estourava — e no
 * celular ele passava a estourar do outro lado. Num aparelho de 375 px, três
 * dos quatro ⓘ da tela de resumo saíam começando em coordenada negativa, com o
 * texto cortado. Só apareceu porque foi medido no navegador, e só aparecia em
 * tela estreita, que é onde ninguém olha.
 *
 * A conta está aqui, fora do componente, porque `getBoundingClientRect` devolve
 * zeros no jsdom: montar a tela não provaria nada.
 */
describe('deslocamentoParaCaber', () => {
  const LARGURA = 260;

  it('cabendo folgado, não desloca', () => {
    expect(deslocamentoParaCaber(100, 100 + LARGURA, 800)).toBe(0);
  });

  it('estourando à direita, puxa só o necessário', () => {
    // Direita em 794 numa janela de 800 com margem 8: sobra -2, desloca -2.
    expect(deslocamentoParaCaber(534, 794, 800)).toBe(-2);
    // E o limite exato: encostar na margem não é estourar.
    expect(deslocamentoParaCaber(532, 792, 800)).toBe(0);
  });

  /* O caso que quebrou de verdade, com os números medidos no aparelho. */
  it('em tela estreita, não empurra para fora pela esquerda', () => {
    const desloc = deslocamentoParaCaber(116, 116 + LARGURA, 375);
    expect(116 + desloc).toBeGreaterThanOrEqual(MARGEM_DA_JANELA);
  });

  /*
    Balão mais largo que a janela inteira: deslocar não resolve, e a resposta
    certa é encostar na esquerda — quem cuida do resto é o `maxWidth`. O que
    não pode é o resultado deixar o começo do texto fora da tela.
  */
  it('balão maior que a janela encosta na esquerda', () => {
    expect(deslocamentoParaCaber(50, 50 + 400, 300)).toBe(MARGEM_DA_JANELA - 50);
  });

  it('já colado na borda esquerda, empurra para dentro', () => {
    expect(deslocamentoParaCaber(0, 200, 800)).toBe(MARGEM_DA_JANELA);
  });

  /* A ordem das correções: a esquerda decide por último, senão um balão apertado
     sai cortado no começo em vez de no fim. */
  it('quando os dois lados apertam, a esquerda vence', () => {
    const desloc = deslocamentoParaCaber(4, 500, 400);
    expect(4 + desloc).toBe(MARGEM_DA_JANELA);
  });
});

describe('Explicacao', () => {
  it('começa fechada e abre no clique', async () => {
    const usuario = userEvent.setup();
    render(<Explicacao termo="1RM estimado">Conta pela fórmula de Epley.</Explicacao>);

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: /O que significa 1RM estimado/ }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Conta pela fórmula de Epley.');
  });

  it('Esc fecha', async () => {
    const usuario = userEvent.setup();
    render(<Explicacao termo="aderência">Treinos feitos sobre treinos prescritos.</Explicacao>);

    await usuario.click(screen.getByRole('button'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    await usuario.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('clicar fora fecha', async () => {
    const usuario = userEvent.setup();
    render(
      <div>
        <Explicacao termo="gasto basal">Energia em repouso absoluto.</Explicacao>
        <p>outro lugar da tela</p>
      </div>,
    );

    await usuario.click(screen.getByRole('button'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    await usuario.click(screen.getByText('outro lugar da tela'));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  /*
    `aria-controls` apontando para um id que não existe no documento é pior que
    não ter atributo nenhum: o leitor de tela promete um destino e não entrega.
  */
  it('só aponta aria-controls quando o balão existe', async () => {
    const usuario = userEvent.setup();
    render(<Explicacao termo="TMB">Taxa metabólica basal.</Explicacao>);

    const gatilho = screen.getByRole('button');
    expect(gatilho).not.toHaveAttribute('aria-controls');

    await usuario.click(gatilho);
    const alvo = gatilho.getAttribute('aria-controls');
    expect(alvo).toBeTruthy();
    expect(document.getElementById(alvo!)).toBe(screen.getByRole('tooltip'));
  });
});

function Interruptor() {
  const { discreto, alternar } = useModoDiscreto();
  return (
    <button onClick={alternar} aria-pressed={discreto}>
      alternar
    </button>
  );
}

describe('Modo discreto', () => {
  beforeEach(() => localStorage.clear());

  it('começa desligado e mostra o valor', () => {
    render(
      <ProvedorDeModoDiscreto>
        <Sensivel>78,4 kg</Sensivel>
      </ProvedorDeModoDiscreto>,
    );
    expect(screen.getByText('78,4 kg')).toBeInTheDocument();
    expect(screen.queryByText('•••')).not.toBeInTheDocument();
  });

  it('ligado, troca o valor por marcador na tela', async () => {
    const usuario = userEvent.setup();
    render(
      <ProvedorDeModoDiscreto>
        <Interruptor />
        <Sensivel>78,4 kg</Sensivel>
      </ProvedorDeModoDiscreto>,
    );

    await usuario.click(screen.getByRole('button', { name: 'alternar' }));
    expect(screen.getByLabelText('Valor oculto pelo modo discreto')).toBeInTheDocument();
  });

  /*
    A regra que mais importa deste arquivo. Imprimir é ato deliberado para um
    destinatário conhecido: a ficha que o profissional entrega ao aluno não pode
    sair com `•••` no lugar do peso. O valor continua no documento, marcado
    para aparecer só no papel.
  */
  it('ligado, o valor real continua no documento marcado só para impressão', async () => {
    const usuario = userEvent.setup();
    const { container } = render(
      <ProvedorDeModoDiscreto>
        <Interruptor />
        <Sensivel>78,4 kg</Sensivel>
      </ProvedorDeModoDiscreto>,
    );

    await usuario.click(screen.getByRole('button', { name: 'alternar' }));
    const noPapel = container.querySelector('[data-so-imprime]');
    expect(noPapel).toHaveTextContent('78,4 kg');
    // E o marcador `•••` é o que some no papel, para não sobrar os dois.
    expect(container.querySelector('[data-nao-imprime]')).toHaveTextContent('•••');
  });

  it('a preferência sobrevive a uma nova montagem', async () => {
    const usuario = userEvent.setup();
    const { unmount } = render(
      <ProvedorDeModoDiscreto>
        <Interruptor />
        <Sensivel>78,4 kg</Sensivel>
      </ProvedorDeModoDiscreto>,
    );

    await usuario.click(screen.getByRole('button', { name: 'alternar' }));
    unmount();

    render(
      <ProvedorDeModoDiscreto>
        <Sensivel>78,4 kg</Sensivel>
      </ProvedorDeModoDiscreto>,
    );
    expect(await screen.findByLabelText('Valor oculto pelo modo discreto')).toBeInTheDocument();
  });

  /*
    Um `•••` sem rótulo é lido como "ponto ponto ponto" — o usuário de leitor de
    tela ficaria sem saber que existe um valor ali e que ele pode revelá-lo.
  */
  it('o marcador é anunciado como valor oculto, não como pontos', async () => {
    const usuario = userEvent.setup();
    render(
      <ProvedorDeModoDiscreto>
        <Interruptor />
        <Sensivel>32,1 %</Sensivel>
      </ProvedorDeModoDiscreto>,
    );

    await usuario.click(screen.getByRole('button', { name: 'alternar' }));
    expect(screen.getByLabelText('Valor oculto pelo modo discreto')).toHaveTextContent('•••');
  });
});
