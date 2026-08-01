import {
  criarPlanoDietaSchema,
  type AlimentoResumo,
  type CriarPlanoDietaInput,
} from '@vivio/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MontarDieta from '../app/(pro)/alunos/[alunoId]/dieta/page';

/**
 * Complemento de `lib/dieta.spec.ts`: lá está a regra, aqui está a fiação —
 * que o campo certo mostre o erro certo, que o botão trave, e que o corpo que
 * sai do `sdk` seja o mesmo que a regra montou.
 *
 * Mora em `teste/` e não ao lado da página porque o caminho dela tem `(pro)` e
 * `[alunoId]`; parêntese e colchete são sintaxe de glob, e um arquivo de teste
 * ali dentro corre o risco de simplesmente nunca ser coletado.
 */

const listar = vi.fn();
const criar = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ alunoId: 'cln00000000000000000009' }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('../lib/sdk', () => ({
  sdk: {
    alimentos: { listar: (...a: unknown[]) => listar(...a) },
    dietas: { criar: (...a: unknown[]) => criar(...a) },
  },
}));

const frango: AlimentoResumo = {
  id: 'cln00000000000000000001',
  nome: 'Frango grelhado',
  grupo: 'Carnes',
  porcao100g: { kcal: 165, proteinaG: 31, carboidratoG: 0, gorduraG: 3.6, fibraG: 0 },
  medidaCaseira: 'filé médio',
  medidaGramas: 120,
};

beforeEach(() => {
  listar.mockResolvedValue([frango]);
  criar.mockResolvedValue({ id: 'cln00000000000000000010', nome: 'Cutting' });
});

/** Leva a tela até o estado mínimo que permite salvar. */
async function montarUmPlano(usuario: ReturnType<typeof userEvent.setup>) {
  render(<MontarDieta />);
  await usuario.click(await screen.findByRole('button', { name: 'Adicionar Frango grelhado à refeição' }));
  await usuario.type(screen.getByLabelText('Nome do plano'), 'Cutting');
}

/** O 2º argumento de `sdk.dietas.criar(alunoId, corpo)`. */
const corpoEnviado = () => criar.mock.calls[0]![1] as CriarPlanoDietaInput;

describe('Montar plano alimentar', () => {
  it('adiciona o alimento já na medida caseira e mostra os macros', async () => {
    const usuario = userEvent.setup();
    await montarUmPlano(usuario);

    // medidaGramas = 120, então 165 kcal/100 g dá 198.
    expect(screen.getByLabelText('Gramas')).toHaveValue('120');
    expect(screen.getAllByText('198 kcal').length).toBeGreaterThan(0);
  });

  it('recalcula os macros a cada tecla', async () => {
    const usuario = userEvent.setup();
    await montarUmPlano(usuario);

    const gramas = screen.getByLabelText('Gramas');
    await usuario.clear(gramas);
    await usuario.type(gramas, '200');

    expect(screen.getAllByText('330 kcal').length).toBeGreaterThan(0);
  });

  /** A regressão: campo apagado virava 0 e o servidor devolvia 400 genérico. */
  it('campo de gramas apagado mostra o erro no campo e trava o envio', async () => {
    const usuario = userEvent.setup();
    await montarUmPlano(usuario);

    const salvar = screen.getByRole('button', { name: 'Salvar e ativar' });
    expect(salvar).toBeEnabled();

    await usuario.clear(screen.getByLabelText('Gramas'));

    expect(screen.getByText('informe a quantidade em gramas')).toBeInTheDocument();
    expect(salvar).toBeDisabled();

    await usuario.click(salvar);
    expect(criar).not.toHaveBeenCalled();
  });

  it('quantidade acima do teto do schema também trava, com o número no campo', async () => {
    const usuario = userEvent.setup();
    await montarUmPlano(usuario);

    const gramas = screen.getByLabelText('Gramas');
    await usuario.clear(gramas);
    await usuario.type(gramas, '6000');

    expect(screen.getByText('no máximo 5000 g')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar e ativar' })).toBeDisabled();
  });

  it('diz o que falta em vez de só desabilitar o botão', async () => {
    render(<MontarDieta />);
    await screen.findByRole('button', { name: 'Adicionar Frango grelhado à refeição' });

    expect(screen.getByText('Dê um nome ao plano (ao menos 2 letras).')).toBeInTheDocument();
    expect(screen.getByText('"Café da manhã" está sem alimentos.')).toBeInTheDocument();
  });

  it('envia um corpo que o schema do servidor aceita', async () => {
    const usuario = userEvent.setup();
    await montarUmPlano(usuario);
    await usuario.type(screen.getByLabelText('Meta kcal'), '1800');

    await usuario.click(screen.getByRole('button', { name: 'Salvar e ativar' }));

    expect(criar).toHaveBeenCalledTimes(1);
    const corpo = corpoEnviado();
    expect(criarPlanoDietaSchema.safeParse(corpo).success).toBe(true);
    expect(corpo).toMatchObject({
      nome: 'Cutting',
      ativar: true,
      kcalAlvo: 1800,
      refeicoes: [
        {
          nome: 'Café da manhã',
          horarioSugerido: '07:00',
          itens: [{ alimentoId: frango.id, quantidadeG: 120 }],
        },
      ],
    });
  });

  it('vírgula decimal chega ao servidor como número', async () => {
    const usuario = userEvent.setup();
    await montarUmPlano(usuario);

    const gramas = screen.getByLabelText('Gramas');
    await usuario.clear(gramas);
    await usuario.type(gramas, '152,5');

    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    const corpo = corpoEnviado();
    expect(corpo.refeicoes[0]!.itens[0]!.quantidadeG).toBe(152.5);
    expect(corpo.ativar).toBe(false);
    expect(criarPlanoDietaSchema.safeParse(corpo).success).toBe(true);
  });

  it('apagar o nome da refeição é apontado — o schema exige min(1)', async () => {
    const usuario = userEvent.setup();
    await montarUmPlano(usuario);

    await usuario.clear(screen.getByLabelText('Nome da refeição'));

    expect(screen.getByText('dê um nome à refeição')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar e ativar' })).toBeDisabled();
  });

  it('falha ao carregar a tabela de alimentos não derruba a tela', async () => {
    listar.mockRejectedValue(new Error('sem rede'));
    render(<MontarDieta />);

    expect(
      await screen.findByText('Não foi possível carregar a tabela de alimentos.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Nome do plano')).toBeInTheDocument();
  });
});
