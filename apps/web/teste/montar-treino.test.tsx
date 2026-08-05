import {
  criarPlanoTreinoSchema,
  type CriarPlanoTreinoInput,
  type ExercicioResumo,
} from '@vivio/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MontarTreino from '../app/(pro)/alunos/[alunoId]/treino/novo/page';

/**
 * Complemento de `lib/treino.spec.ts`: lá está a regra, aqui a fiação.
 *
 * A regra já é bem coberta — faixas, corpo montado, o que o guarda barra. O que
 * ela não alcança é o que esta tela tem de próprio: **três sessões dividindo os
 * mesmos manipuladores**. `adicionarExercicio` e `alterarItem` fecham sobre
 * `sessaoAtiva`, e um erro de índice aí não quebra teste nenhum de unidade —
 * escreve o dado na sessão errada, calado.
 *
 * Mora em `teste/` pelo mesmo motivo de `montar-dieta.test.tsx`: o caminho da
 * página tem `(pro)` e `[alunoId]`, e parêntese e colchete são sintaxe de glob.
 */

const listar = vi.fn();
const criar = vi.fn();
const push = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ alunoId: 'cln00000000000000000009' }),
  useRouter: () => ({ push: (...a: unknown[]) => push(...a) }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('../lib/sdk', () => ({
  sdk: {
    exercicios: { listar: (...a: unknown[]) => listar(...a) },
    treinos: { criar: (...a: unknown[]) => criar(...a) },
  },
}));

function exercicio(id: string, nome: string): ExercicioResumo {
  return {
    id,
    nome,
    grupoMuscular: 'PEITO',
    equipamento: 'Barra',
    instrucoes: null,
    escopo: 'GLOBAL',
    temVideo: false,
    criadoPorId: null,
  };
}

const SUPINO = exercicio('cln00000000000000000001', 'Supino reto');
const REMADA = exercicio('cln00000000000000000002', 'Remada curvada');

beforeEach(() => {
  listar.mockResolvedValue([SUPINO, REMADA]);
  criar.mockResolvedValue({ id: 'cln00000000000000000010', nome: 'Hipertrofia' });
});

const corpoEnviado = () => criar.mock.calls[0]![1] as CriarPlanoTreinoInput;

const adicionar = (nome: string) =>
  screen.getByRole('button', { name: `Adicionar ${nome} à sessão` });

/** Os campos repetem em cada item; sem escopo, `getByLabelText` acha vários. */
const item = (i: number) => within(screen.getByTestId(`item-${i}`));

async function planoMinimo(usuario: ReturnType<typeof userEvent.setup>) {
  render(<MontarTreino />);
  await usuario.click(await screen.findByRole('button', { name: /Adicionar Supino reto/ }));
  await usuario.type(screen.getByLabelText('Nome do plano'), 'Hipertrofia');
}

describe('Montar treino', () => {
  it('o exercício escolhido entra na sessão que está aberta, não na primeira', async () => {
    const usuario = userEvent.setup();
    render(<MontarTreino />);
    await screen.findByRole('button', { name: /Adicionar Supino reto/ });

    await usuario.click(adicionar('Supino reto'));

    await usuario.click(screen.getByRole('button', { name: '+ Sessão' }));
    await usuario.click(adicionar('Remada curvada'));

    // A aba carrega a contagem: A ficou com o supino, B com a remada.
    expect(screen.getByRole('button', { name: 'Treino A (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Treino B (1)' })).toBeInTheDocument();

    /*
      E a lista visível é a da sessão B. Escopado ao cartão do item de
      propósito: o nome do exercício também aparece no botão da biblioteca, que
      nunca sai da tela — `getByText('Remada curvada')` solto acha os dois e a
      asserção passaria a não significar nada.
    */
    expect(item(0).getByText('Remada curvada')).toBeInTheDocument();
    expect(item(0).queryByText('Supino reto')).toBeNull();
    expect(screen.queryByTestId('item-1')).toBeNull();
  });

  it('editar um item não escreve no item vizinho', async () => {
    const usuario = userEvent.setup();
    render(<MontarTreino />);
    await screen.findByRole('button', { name: /Adicionar Supino reto/ });

    await usuario.click(adicionar('Supino reto'));
    await usuario.click(adicionar('Remada curvada'));

    const series = item(1).getByLabelText('Séries');
    await usuario.clear(series);
    await usuario.type(series, '5');

    expect(item(1).getByLabelText('Séries')).toHaveValue('5');
    expect(item(0).getByLabelText('Séries')).toHaveValue('3');
  });

  /*
    O mesmo risco de índice, agora atravessando sessões: o item editado em B não
    pode reaparecer alterado em A. É o defeito que nenhum teste de unidade vê,
    porque a regra recebe a sessão já escolhida.
  */
  it('editar na sessão B não altera a sessão A', async () => {
    const usuario = userEvent.setup();
    render(<MontarTreino />);
    await screen.findByRole('button', { name: /Adicionar Supino reto/ });

    await usuario.click(adicionar('Supino reto'));
    await usuario.click(screen.getByRole('button', { name: '+ Sessão' }));
    await usuario.click(adicionar('Remada curvada'));

    const series = item(0).getByLabelText('Séries');
    await usuario.clear(series);
    await usuario.type(series, '4');

    await usuario.click(screen.getByRole('button', { name: 'Treino A (1)' }));
    expect(item(0).getByLabelText('Séries')).toHaveValue('3');
  });

  it('sessão sem exercício trava o envio e diz qual é', async () => {
    const usuario = userEvent.setup();
    render(<MontarTreino />);
    await screen.findByRole('button', { name: /Adicionar Supino reto/ });

    await usuario.click(adicionar('Supino reto'));
    await usuario.type(screen.getByLabelText('Nome do plano'), 'Hipertrofia');
    // Até aqui salvaria; a sessão nova é que passa a faltar.
    await usuario.click(screen.getByRole('button', { name: '+ Sessão' }));

    expect(screen.getByText('"Treino B" está sem exercícios.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar e ativar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeDisabled();
  });

  it('campo apagado trava o envio, e o erro aparece no item certo', async () => {
    const usuario = userEvent.setup();
    render(<MontarTreino />);
    await screen.findByRole('button', { name: /Adicionar Supino reto/ });

    await usuario.click(adicionar('Supino reto'));
    await usuario.click(adicionar('Remada curvada'));
    await usuario.type(screen.getByLabelText('Nome do plano'), 'Hipertrofia');

    await usuario.clear(item(1).getByLabelText('Repetições'));

    expect(
      screen.getByText('Remada curvada em "Treino A": informe as repetições.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar e ativar' })).toBeDisabled();
  });

  it('envia um corpo que o schema do servidor aceita', async () => {
    const usuario = userEvent.setup();
    await planoMinimo(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Salvar e ativar' }));

    expect(criar).toHaveBeenCalledTimes(1);
    expect(criar.mock.calls[0]![0]).toBe('cln00000000000000000009');

    const corpo = corpoEnviado();
    expect(criarPlanoTreinoSchema.safeParse(corpo).success).toBe(true);
    expect(corpo).toMatchObject({
      nome: 'Hipertrofia',
      ativar: true,
      sessoes: [
        {
          nome: 'Treino A',
          itens: [{ exercicioId: SUPINO.id, series: 3, repsAlvo: '10-12', descansoSeg: 60 }],
        },
      ],
    });
    // Carga em branco é ausência de sugestão, não zero — zero significaria
    // "sem peso", que é outra coisa.
    expect(corpo.sessoes[0]!.itens[0]!.cargaSugeridaKg).toBeUndefined();
  });

  it('"Salvar rascunho" manda o mesmo plano com ativar falso', async () => {
    const usuario = userEvent.setup();
    await planoMinimo(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    expect(corpoEnviado().ativar).toBe(false);
    expect(criarPlanoTreinoSchema.safeParse(corpoEnviado()).success).toBe(true);
  });

  it('o dia sugerido sai como número, não como o texto do <select>', async () => {
    const usuario = userEvent.setup();
    await planoMinimo(usuario);

    await usuario.selectOptions(screen.getByLabelText('Dia sugerido'), '3');
    await usuario.click(screen.getByRole('button', { name: 'Salvar e ativar' }));

    expect(corpoEnviado().sessoes[0]!.diaSugerido).toBe(3);
    expect(criarPlanoTreinoSchema.safeParse(corpoEnviado()).success).toBe(true);
  });

  it('as duas sessões chegam ao servidor, na ordem das abas', async () => {
    const usuario = userEvent.setup();
    render(<MontarTreino />);
    await screen.findByRole('button', { name: /Adicionar Supino reto/ });

    await usuario.click(adicionar('Supino reto'));
    await usuario.click(screen.getByRole('button', { name: '+ Sessão' }));
    await usuario.click(adicionar('Remada curvada'));
    await usuario.type(screen.getByLabelText('Nome do plano'), 'Hipertrofia');

    await usuario.click(screen.getByRole('button', { name: 'Salvar e ativar' }));

    const corpo = corpoEnviado();
    expect(criarPlanoTreinoSchema.safeParse(corpo).success).toBe(true);
    expect(corpo.sessoes.map((s) => s.itens[0]!.exercicioId)).toEqual([SUPINO.id, REMADA.id]);
  });

  it('remover o último exercício da sessão trava o envio de novo', async () => {
    const usuario = userEvent.setup();
    await planoMinimo(usuario);
    expect(screen.getByRole('button', { name: 'Salvar e ativar' })).toBeEnabled();

    await usuario.click(screen.getByRole('button', { name: 'Remover Supino reto' }));

    expect(screen.getByText('"Treino A" está sem exercícios.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar e ativar' })).toBeDisabled();
  });

  it('reordenar pelo botão troca a ordem que vai para o servidor', async () => {
    const usuario = userEvent.setup();
    render(<MontarTreino />);
    await screen.findByRole('button', { name: /Adicionar Supino reto/ });

    await usuario.click(adicionar('Supino reto'));
    await usuario.click(adicionar('Remada curvada'));
    await usuario.type(screen.getByLabelText('Nome do plano'), 'Hipertrofia');

    await usuario.click(screen.getByRole('button', { name: 'Mover Remada curvada para cima' }));
    await usuario.click(screen.getByRole('button', { name: 'Salvar e ativar' }));

    expect(corpoEnviado().sessoes[0]!.itens.map((i) => i.exercicioId)).toEqual([
      REMADA.id,
      SUPINO.id,
    ]);
  });
});
