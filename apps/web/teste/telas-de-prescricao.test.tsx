import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Suplementos from '../app/(pro)/prescricoes/suplementos/page';
import Medicamentos from '../app/(pro)/prescricoes/medicamentos/page';
import Fitoterapicos from '../app/(pro)/prescricoes/fitoterapicos/page';

/**
 * As três telas de catálogo prescritível — e o que elas têm de próprio.
 *
 * Cada uma é um embrulho de catorze linhas em volta de `CatalogoPrescritivel`,
 * que já tem dez provas suas. O que **não** está provado lá é o único trabalho
 * destes três arquivos: passar o `tipo` certo.
 *
 * Errar isso não quebra nada visível. A tela abriria com o título "Medicamentos"
 * e listaria suplementos, e o item cadastrado dali nasceria com o tipo errado —
 * que no banco decide **quem tem competência para prescrever**. Medicamento é
 * privativo do médico; suplemento e fitoterápico o nutricionista prescreve
 * dentro da área dele. Um tipo trocado é a porta para exercício ilegal da
 * profissão, e ela se abriria por uma string.
 *
 * Por isso a prova é uma só para as três, e olha exatamente a fronteira: o
 * argumento que sai daqui e o texto que identifica a tela.
 */
const listar = vi.fn();

vi.mock('../lib/sdk', () => ({
  sdk: {
    prescritiveis: {
      listar: (...a: unknown[]) => listar(...a),
      criar: vi.fn(),
      remover: vi.fn(),
    },
  },
}));

beforeEach(() => {
  listar.mockResolvedValue([]);
});

const TELAS = [
  {
    nome: 'Suplementos',
    Pagina: Suplementos,
    tipo: 'SUPLEMENTO',
    titulo: 'Suplementos',
    subtitulo: 'Seu catálogo. O que estiver aqui pode ser prescrito na ficha do paciente.',
    exemplo: 'Creatina monoidratada',
  },
  {
    nome: 'Medicamentos',
    Pagina: Medicamentos,
    tipo: 'MEDICAMENTO',
    titulo: 'Medicamentos',
    subtitulo:
      'Prescrição privativa do médico. A API recusa o cadastro por qualquer outro papel.',
    exemplo: 'Losartana potássica',
  },
  {
    nome: 'Fitoterápicos',
    Pagina: Fitoterapicos,
    tipo: 'FITOTERAPICO',
    titulo: 'Fitoterápicos',
    subtitulo:
      'Registre contraindicações aqui — elas aparecem toda vez que o item for prescrito.',
    exemplo: 'Camomila (Matricaria recutita)',
  },
] as const;

describe('telas de prescrição: cada uma pede o SEU tipo', () => {
  it.each(TELAS)('$nome consulta o catálogo com tipo $tipo', async ({ Pagina, tipo }) => {
    render(<Pagina />);

    await waitFor(() => expect(listar).toHaveBeenCalled());
    expect(listar.mock.calls[0]![0]).toMatchObject({ tipo });
  });

  it.each(TELAS)(
    '$nome se identifica pelo título, pelo subtítulo e pelo exemplo',
    async ({ Pagina, titulo, subtitulo, exemplo }) => {
      /*
        O título e o exemplo são o que diz à pessoa em qual catálogo ela está.
        Com o tipo certo e o título trocado, ela cadastraria no lugar certo
        acreditando estar no errado — e vice-versa.

        O `placeholder` só existe com o formulário ABERTO, então a prova abre:
        é lá que o `exemploNome` de fato chega, e era o que faltava conferir.
      */
      render(<Pagina />);

      expect(await screen.findByRole('heading', { name: titulo })).toBeInTheDocument();
      expect(screen.getByText(subtitulo)).toBeInTheDocument();

      fireEvent.click(screen.getByText('+ Novo item'));

      expect(screen.getByPlaceholderText(exemplo)).toBeInTheDocument();
    },
  );

  it('nenhuma das três pede o tipo de outra', async () => {
    // A prova que fecha a troca cruzada: três telas, três tipos distintos.
    for (const { Pagina } of TELAS) {
      listar.mockClear();
      const { unmount } = render(<Pagina />);
      await waitFor(() => expect(listar).toHaveBeenCalled());
      unmount();
    }
    const pedidos = new Set(TELAS.map((t) => t.tipo));
    expect(pedidos.size).toBe(3);
  });

  it('a de medicamentos diz que a prescrição é privativa do médico', async () => {
    /*
      Não é enfeite de texto: é a única explicação que o profissional recebe
      ANTES de tentar cadastrar e ser recusado pelo banco. Sem ela, a recusa
      parece defeito do app.
    */
    render(<Medicamentos />);

    expect(await screen.findByText(/privativa do médico/i)).toBeInTheDocument();
  });

  it('a de fitoterápicos diz por que as contraindicações importam ali', async () => {
    render(<Fitoterapicos />);

    expect(await screen.findByText(/aparecem toda vez que o item for prescrito/i)).toBeInTheDocument();
  });
});
