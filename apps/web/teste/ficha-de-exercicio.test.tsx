import type { ExercicioResumo } from '@vivio/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FichaDeExercicio } from '../components/FichaDeExercicio';

/**
 * A demonstração na ficha do exercício.
 *
 * Três coisas se protegem aqui. O player do acervo do Prime aparece **na
 * tela**, sem sair do app. Ele nunca fica por cima de um vídeo nosso — a
 * gravação do personal mostra o aparelho da academia dele. E um endereço que
 * não é o do player aceito nunca vira iframe.
 */

const PLAYER = 'https://iframe.mediadelivery.net/embed/693551/cfbfd8aa-ad9c-4d86-a7a8-62b4c06420b1';

function exercicio(parcial: Partial<ExercicioResumo> = {}): ExercicioResumo {
  return {
    id: 'ex1',
    nome: 'Abdominal bicicleta',
    grupoMuscular: 'ABDOMEN',
    equipamento: 'Peso do corpo',
    instrucoes: 'Gire o tronco, não o pescoço.',
    escopo: 'GLOBAL',
    temVideo: false,
    temDemonstracao: null,
    criadoPorId: null,
    passos: [],
    imagemUrl: null,
    imagemCredito: null,
    videoCredito: null,
    videoExternoUrl: null,
    ...parcial,
  };
}

const iframe = () => document.querySelector('iframe');

describe('demonstração na ficha do exercício', () => {
  it('só com o vídeo do Prime, o player já aparece na tela, como demonstração', () => {
    render(
      <FichaDeExercicio
        exercicio={exercicio({
          videoExternoUrl: PLAYER,
          videoCredito: 'Prime Coaching — uso autorizado',
        })}
        aoFechar={() => undefined}
      />,
    );

    const src = new URL(iframe()!.getAttribute('src')!);
    expect(src.hostname).toBe('iframe.mediadelivery.net');
    // Tocando sozinho, mudo e em loop: se comporta como a imagem que substitui.
    expect(src.searchParams.get('loop')).toBe('true');
    expect(src.searchParams.get('muted')).toBe('true');
    expect(screen.getByText('com vídeo')).toBeTruthy();
    // O crédito aparece onde o vídeo aparece.
    expect(screen.getByText(/Prime Coaching — uso autorizado/)).toBeTruthy();
    // Nada de botão: não há arquivo nosso para buscar.
    expect(screen.queryByRole('button', { name: 'Ver vídeo' })).toBeNull();
  });

  it('o player roda isolado: não navega a nossa página nem abre janela', () => {
    render(<FichaDeExercicio exercicio={exercicio({ videoExternoUrl: PLAYER })} aoFechar={() => undefined} />);

    const sandbox = iframe()!.getAttribute('sandbox')!.split(' ');
    expect(sandbox).toContain('allow-scripts');
    expect(sandbox).not.toContain('allow-top-navigation');
    expect(sandbox).not.toContain('allow-popups');
  });

  it('com vídeo nosso, o do Prime não aparece — nem antes do clique', () => {
    /*
      O link do arquivo só é buscado quando alguém aperta "Ver vídeo". Até lá,
      mostrar o player de fora seria pôr a demonstração genérica por cima da
      gravação que existe.
    */
    render(
      <FichaDeExercicio
        exercicio={exercicio({ temVideo: true, videoExternoUrl: PLAYER })}
        aoFechar={() => undefined}
        aoPedirVideo={() => undefined}
      />,
    );

    expect(iframe()).toBeNull();
    expect(screen.getByRole('button', { name: 'Ver vídeo' })).toBeTruthy();
  });

  it('a gravação do personal também vence o Prime', () => {
    render(
      <FichaDeExercicio
        exercicio={exercicio({ temDemonstracao: true, videoExternoUrl: PLAYER })}
        aoFechar={() => undefined}
      />,
    );
    expect(iframe()).toBeNull();
  });

  it('endereço fora da lista de players nunca vira iframe', () => {
    render(
      <FichaDeExercicio
        exercicio={exercicio({ videoExternoUrl: 'https://golpe.com/embed/x' })}
        aoFechar={() => undefined}
      />,
    );
    expect(iframe()).toBeNull();
    expect(screen.getByText('Sem vídeo demonstrativo')).toBeTruthy();
  });
});
