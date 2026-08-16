import type { PlanoTreinoResumo } from '@vivio/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoricoDeTreinos } from '../components/HistoricoDeTreinos';

/**
 * O histórico de planos de treino.
 *
 * O que se protege: **um plano salvo precisa ser abrível e ativável pela tela**.
 * A versão anterior listava cartões inertes — quem salvava um plano sem ativar
 * ficava sem caminho nenhum para colocá-lo em uso, e quem queria conferir o que
 * tinha prescrito não conseguia abrir. Salvar e não conseguir ver o que salvou
 * se parece demais com não ter salvo.
 */

const obter = vi.fn();
const ativar = vi.fn();

vi.mock('../lib/sdk', () => ({
  sdk: {
    treinos: {
      obter: (...a: unknown[]) => obter(...a),
      ativar: (...a: unknown[]) => ativar(...a),
    },
  },
}));

function plano(over: Partial<PlanoTreinoResumo> = {}): PlanoTreinoResumo {
  return {
    id: 'p1',
    nome: 'Treino A',
    objetivo: 'HIPERTROFIA',
    versao: 1,
    status: 'RASCUNHO',
    criadoEm: '2026-08-10T12:00:00.000Z',
    inicioEm: null,
    fimEm: null,
    totalSessoes: 2,
    personal: { id: 'pro1', nome: 'Diego' },
    ...over,
  };
}

beforeEach(() => {
  obter.mockReset();
  ativar.mockReset();
});

describe('HistoricoDeTreinos', () => {
  const props = { alunoId: 'a1', aoMudar: vi.fn() };

  it('um rascunho pode ser ativado pela tela', async () => {
    ativar.mockResolvedValue({});
    render(<HistoricoDeTreinos {...props} planos={[plano()]} />);

    await userEvent.click(screen.getByRole('button', { name: /Ativar este plano/ }));
    expect(ativar).toHaveBeenCalledWith('a1', 'p1');
  });

  /* Ativar o que já está ativo devolveria 409 — o botão não deve existir. */
  it('o plano ativo não oferece ativar de novo', () => {
    render(
      <HistoricoDeTreinos
        {...props}
        planos={[plano({ status: 'ATIVO', inicioEm: '2026-08-11T12:00:00.000Z' })]}
      />,
    );
    expect(screen.queryByRole('button', { name: /Ativar este plano/ })).toBeNull();
  });

  it('abre o plano e mostra os exercícios prescritos', async () => {
    obter.mockResolvedValue({
      ...plano(),
      sessoes: [
        {
          id: 's1',
          nome: 'Peito e tríceps',
          ordem: 0,
          diaSugerido: 1,
          itens: [
            {
              id: 'i1',
              ordem: 0,
              series: 4,
              repsAlvo: '8-12',
              cargaSugeridaKg: 60,
              descansoSeg: 90,
              tecnica: null,
              observacao: null,
              supersetGrupo: null,
              exercicio: { id: 'e1', nome: 'Supino reto com barra' },
            },
          ],
        },
      ],
    });

    render(<HistoricoDeTreinos {...props} planos={[plano()]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Treino A' }));

    expect(await screen.findByText('Peito e tríceps')).toBeTruthy();
    expect(screen.getByText(/Supino reto com barra/)).toBeTruthy();
    expect(screen.getByText(/4 × 8-12/)).toBeTruthy();
    expect(screen.getByText(/60 kg/)).toBeTruthy();
  });

  /*
    Rascunho nunca ativado não tem `inicioEm`. Sem a data de criação ele
    apareceria sem data nenhuma — o item que ninguém situa no tempo.
  */
  it('rascunho mostra a data em que foi montado', () => {
    render(<HistoricoDeTreinos {...props} planos={[plano()]} />);
    expect(screen.getByText(/montado em/)).toBeTruthy();
  });

  it('arquivado mostra o período em que valeu', () => {
    render(
      <HistoricoDeTreinos
        {...props}
        planos={[
          plano({
            status: 'ARQUIVADO',
            inicioEm: '2026-05-01T12:00:00.000Z',
            fimEm: '2026-07-01T12:00:00.000Z',
          }),
        ]}
      />,
    );
    expect(screen.getByText(/mai\..*—.*jul\./)).toBeTruthy();
  });

  it('falha ao ativar é dita, e não engolida', async () => {
    ativar.mockRejectedValue(new Error('rede'));
    render(<HistoricoDeTreinos {...props} planos={[plano()]} />);

    await userEvent.click(screen.getByRole('button', { name: /Ativar este plano/ }));
    expect(await screen.findByText(/Não foi possível ativar/)).toBeTruthy();
  });

  it('sem planos, diz que não há', () => {
    render(<HistoricoDeTreinos {...props} planos={[]} />);
    expect(screen.getByText(/Nenhum plano montado ainda/)).toBeTruthy();
  });
});
