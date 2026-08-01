import { avaliacaoAdipometriaSchema, type AvaliacaoAdipometriaInput } from '@vivio/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Adipometria from '../app/(pro)/avaliacao/adipometria/page';

/**
 * Complemento de `lib/adipometria.spec.ts`: lá está a regra, aqui a fiação.
 * O que importa provar na tela é a recusa — que meio protocolo não produza
 * percentual nenhum, porque o número que apareceria seria plausível e errado.
 */

const meusAlunos = vi.fn();
const listar = vi.fn();
const registrar = vi.fn();

vi.mock('../lib/sdk', () => ({
  sdk: {
    vinculos: { meusAlunos: (...a: unknown[]) => meusAlunos(...a) },
    avaliacoes: {
      listar: (...a: unknown[]) => listar(...a),
      registrar: (...a: unknown[]) => registrar(...a),
    },
  },
}));

const ANA = 'cms4yfq200004uw88m1lv5ulf';

beforeEach(() => {
  meusAlunos.mockResolvedValue([{ contraparte: { id: ANA, nome: 'Ana Souza' } }]);
  listar.mockResolvedValue([]);
  registrar.mockResolvedValue({ resultado: { percentualGordura: 13.6 } });
});

const corpoEnviado = () => registrar.mock.calls[0]![1] as AvaliacaoAdipometriaInput;

/**
 * O paragrafo do resultado, inteiro. `getByText(/de gordura/)` sozinho casa com
 * o <span> da legenda, cujo texto é só " de gordura" — o número mora no nó
 * irmão, no pai.
 */
const resultado = () => screen.getByText(/de gordura/).parentElement!.textContent ?? '';

/** Preenche peso e as três dobras masculinas do Pollock 3. */
async function preencherTudo(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.type(screen.getByLabelText('Peso (kg)'), '80');
  await usuario.type(screen.getByLabelText('Peitoral (mm)'), '10');
  await usuario.type(screen.getByLabelText('Abdominal (mm)'), '20');
  await usuario.type(screen.getByLabelText('Coxa (mm)'), '15');
}

describe('Adipometria', () => {
  /** A regressão: a prévia calculava com o que houvesse. */
  it('não mostra percentual com o protocolo pela metade', async () => {
    const usuario = userEvent.setup();
    render(<Adipometria />);
    await screen.findByLabelText('Peitoral (mm)');

    await usuario.type(screen.getByLabelText('Peitoral (mm)'), '10');
    await usuario.type(screen.getByLabelText('Abdominal (mm)'), '20');

    expect(resultado()).toMatch(/^—/);
    expect(screen.getByText('Preencha as 3 dobras e a idade para ver o resultado.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar avaliação' })).toBeDisabled();
  });

  it('com as três dobras, mostra o percentual e libera o envio', async () => {
    const usuario = userEvent.setup();
    render(<Adipometria />);
    await screen.findByLabelText('Peitoral (mm)');

    await preencherTudo(usuario);

    // 1.10938 - 0.0008267(45) + 0.0000016(2025) - 0.0002574(30) -> Siri
    expect(resultado()).toMatch(/^13\.6%/);
    expect(screen.getByText('Faixa: Bom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar avaliação' })).toBeEnabled();
  });

  it('campo em branco não nasce vermelho, mas o que foi digitado errado sim', async () => {
    const usuario = userEvent.setup();
    render(<Adipometria />);
    await screen.findByLabelText('Peitoral (mm)');

    // Peso começa vazio e não deve estar gritando com ninguém.
    expect(screen.queryByText('preencha este campo')).toBeNull();

    await usuario.type(screen.getByLabelText('Peitoral (mm)'), '150');

    expect(screen.getByText('entre 1 e 100 mm')).toBeInTheDocument();
  });

  it('idade fora da faixa trava o envio e diz a faixa', async () => {
    const usuario = userEvent.setup();
    render(<Adipometria />);
    await screen.findByLabelText('Peitoral (mm)');
    await preencherTudo(usuario);

    const idade = screen.getByLabelText('Idade (anos)');
    await usuario.clear(idade);
    await usuario.type(idade, '150');

    expect(screen.getByText('Idade (anos): entre 7 e 100 anos.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar avaliação' })).toBeDisabled();
  });

  it('envia um corpo que o schema do servidor aceita', async () => {
    const usuario = userEvent.setup();
    render(<Adipometria />);
    await screen.findByLabelText('Peitoral (mm)');
    await preencherTudo(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Salvar avaliação' }));

    expect(registrar).toHaveBeenCalledTimes(1);
    expect(registrar.mock.calls[0]![0]).toBe(ANA);

    const corpo = corpoEnviado();
    expect(avaliacaoAdipometriaSchema.safeParse(corpo).success).toBe(true);
    expect(corpo).toMatchObject({
      metodo: 'ADIPOMETRIA',
      protocolo: 'POLLOCK_3',
      sexo: 'M',
      idade: 30,
      pesoKg: 80,
      dobras: { PEITORAL: 10, ABDOMINAL: 20, COXA: 15 },
    });
  });

  /** A altura fazia Number(texto) sem trocar a vírgula: ia como NaN. */
  it('vírgula na altura chega como número', async () => {
    const usuario = userEvent.setup();
    render(<Adipometria />);
    await screen.findByLabelText('Peitoral (mm)');
    await preencherTudo(usuario);
    await usuario.type(screen.getByLabelText('Altura (cm) — opcional'), '175,5');

    await usuario.click(screen.getByRole('button', { name: 'Salvar avaliação' }));

    expect(corpoEnviado().alturaCm).toBe(175.5);
    expect(avaliacaoAdipometriaSchema.safeParse(corpoEnviado()).success).toBe(true);
  });

  it('trocar o sexo troca os pontos anatômicos exigidos', async () => {
    const usuario = userEvent.setup();
    render(<Adipometria />);
    await screen.findByLabelText('Peitoral (mm)');

    await usuario.selectOptions(screen.getByLabelText('Sexo biológico'), 'F');

    expect(screen.getByLabelText('Tríceps (mm)')).toBeInTheDocument();
    expect(screen.getByLabelText('Supra-ilíaca (mm)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Peitoral (mm)')).toBeNull();
  });
});
