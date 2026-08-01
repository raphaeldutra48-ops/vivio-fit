import { avaliacaoBioimpedanciaSchema, type AvaliacaoBioimpedanciaInput } from '@vivio/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Bioimpedancia from '../app/(pro)/avaliacao/bioimpedancia/page';

/**
 * Complemento de `lib/bioimpedancia.spec.ts`. O que importa provar na tela é
 * que a prévia passou a concordar com a legenda logo abaixo dela — e com o
 * servidor — sobre qual massa magra vale.
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
  registrar.mockResolvedValue({ resultado: { percentualGordura: 25, massaMagraKg: 52.5 } });
});

const corpoEnviado = () => registrar.mock.calls[0]![1] as AvaliacaoBioimpedanciaInput;

/**
 * O parágrafo do resultado, inteiro.
 *
 * Mira o <span> da legenda e sobe para o pai. O `getNodeText` da testing-library
 * junta só os nós de texto DIRETOS de cada elemento: o <p> do resultado casa
 * como "25%" (o resto está dentro do span), e "de gordura" solto acharia
 * também o parágrafo de abertura da tela, que diz "percentual de gordura".
 * `selector: 'span'` desempata.
 */
const composicao = () =>
  screen.getByText(/de gordura/, { selector: 'span' }).parentElement!.textContent ?? '';

const linha = (rotulo: string) =>
  screen.getByText(rotulo).parentElement!.textContent?.replace(rotulo, '').trim() ?? '';

async function transcrever(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.type(screen.getByLabelText('Peso (kg)'), '70');
  await usuario.type(screen.getByLabelText('Gordura (%)'), '25');
}

describe('Bioimpedância', () => {
  it('sem peso e gordura não mostra composição e trava o envio', async () => {
    render(<Bioimpedancia />);
    await screen.findByLabelText('Peso (kg)');

    expect(composicao()).toMatch(/^—/);
    expect(screen.getByRole('button', { name: 'Salvar avaliação' })).toBeDisabled();
    expect(screen.getByText('Peso (kg): preencha este campo.')).toBeInTheDocument();
  });

  it('com peso e gordura, deriva a composição e libera o envio', async () => {
    const usuario = userEvent.setup();
    render(<Bioimpedancia />);
    await screen.findByLabelText('Peso (kg)');

    await transcrever(usuario);

    expect(composicao()).toMatch(/^25%/);
    expect(linha('Massa gorda')).toBe('17.5 kg');
    expect(linha('Massa magra')).toBe('52.5 kg');
    expect(screen.getByRole('button', { name: 'Salvar avaliação' })).toBeEnabled();
  });

  /** A divergência: a legenda prometia, o servidor cumpria, a prévia não. */
  it('a massa magra informada prevalece na prévia, como diz a legenda', async () => {
    const usuario = userEvent.setup();
    render(<Bioimpedancia />);
    await screen.findByLabelText('Peso (kg)');
    await transcrever(usuario);

    await usuario.type(screen.getByLabelText('Massa magra (kg) — opcional'), '51,2');

    expect(linha('Massa magra')).toBe('51.2 kg');
    expect(
      screen.getByText(/Massa magra informada pela balança/),
    ).toBeInTheDocument();
  });

  it('campo opcional fora da faixa trava o envio e diz qual é', async () => {
    const usuario = userEvent.setup();
    render(<Bioimpedancia />);
    await screen.findByLabelText('Peso (kg)');
    await transcrever(usuario);

    await usuario.type(screen.getByLabelText('Massa óssea (kg) — opcional'), '50');

    expect(screen.getByText('Massa óssea (kg): entre 0.5 e 10 kg.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar avaliação' })).toBeDisabled();
  });

  it('campo em branco não nasce vermelho; o digitado errado sim', async () => {
    const usuario = userEvent.setup();
    render(<Bioimpedancia />);
    await screen.findByLabelText('Peso (kg)');

    expect(screen.queryByText('entre 20 e 400 kg')).toBeNull();

    await usuario.type(screen.getByLabelText('Peso (kg)'), '5');

    expect(screen.getByText('entre 20 e 400 kg')).toBeInTheDocument();
  });

  it('envia um corpo que o schema do servidor aceita', async () => {
    const usuario = userEvent.setup();
    render(<Bioimpedancia />);
    await screen.findByLabelText('Peso (kg)');
    await transcrever(usuario);
    await usuario.type(screen.getByLabelText('Taxa metabólica basal (kcal) — opcional'), '1450');

    await usuario.click(screen.getByRole('button', { name: 'Salvar avaliação' }));

    expect(registrar).toHaveBeenCalledTimes(1);
    expect(registrar.mock.calls[0]![0]).toBe(ANA);

    const corpo = corpoEnviado();
    expect(avaliacaoBioimpedanciaSchema.safeParse(corpo).success).toBe(true);
    expect(corpo).toMatchObject({
      metodo: 'BIOIMPEDANCIA',
      pesoKg: 70,
      percentualGordura: 25,
      taxaMetabolicaBasal: 1450,
    });
    // Os que ficaram em branco não viram zero.
    expect(corpo.massaOsseaKg).toBeUndefined();
    expect(corpo.alturaCm).toBeUndefined();
  });
});
