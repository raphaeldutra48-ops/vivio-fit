import { posologiaSchema, type PrescritivelResumo } from '@vivio/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorDeItensPrescritos, type ItemEmEdicao } from './EditorDeItensPrescritos';

/**
 * O risco que este arquivo cobre (pendência 14): o editor mandar `''` onde o
 * schema espera ausência. Zod recusa string vazia em campo opcional com
 * `.max()`, então o erro só aparece no envio — depois de o profissional ter
 * digitado a prescrição inteira.
 *
 * Por isso cada teste termina validando a saída contra `posologiaSchema`, que é
 * exatamente o que a API vai aplicar.
 */

const listar = vi.fn();
vi.mock('../lib/sdk', () => ({ sdk: { prescritiveis: { listar: () => listar() } } }));

const CATALOGO: PrescritivelResumo[] = [
  { id: 'cln00000000000000000001', nome: 'Creatina monoidratada', tipo: 'SUPLEMENTO' },
  { id: 'cln00000000000000000002', nome: 'Vitamina D3', tipo: 'SUPLEMENTO' },
  { id: 'cln00000000000000000003', nome: 'Camomila', tipo: 'FITOTERAPICO' },
] as PrescritivelResumo[];

/** Envolve o editor no estado que as páginas reais mantêm, e expõe o valor. */
function Palco({ iniciais = [] as ItemEmEdicao[] }) {
  const [itens, setItens] = useState<ItemEmEdicao[]>(iniciais);
  return (
    <>
      <EditorDeItensPrescritos itens={itens} aoMudar={setItens} />
      <output data-testid="saida">{JSON.stringify(itens)}</output>
    </>
  );
}

const saida = (): ItemEmEdicao[] =>
  JSON.parse(screen.getByTestId('saida').textContent || '[]') as ItemEmEdicao[];

/** Tira o `nome`, que é só de exibição, e valida o resto como a API validaria. */
const validar = (item: ItemEmEdicao) => {
  const { nome: _nome, ...envio } = item;
  return posologiaSchema.safeParse(envio);
};

const creatina: ItemEmEdicao = {
  prescritivelId: CATALOGO[0]!.id,
  nome: 'Creatina monoidratada',
  horarios: [],
};

beforeEach(() => {
  listar.mockResolvedValue(CATALOGO);
});

describe('EditorDeItensPrescritos', () => {
  it('mostra o catálogo e adiciona o item escolhido', async () => {
    const usuario = userEvent.setup();
    render(<Palco />);

    await usuario.click(await screen.findByRole('button', { name: /Creatina monoidratada/ }));

    expect(saida()).toEqual([
      { prescritivelId: CATALOGO[0]!.id, nome: 'Creatina monoidratada', horarios: [] },
    ]);
    expect(validar(saida()[0]!).success).toBe(true);
  });

  it('o que já foi adicionado sai do catálogo — não dá para prescrever duas vezes', async () => {
    const usuario = userEvent.setup();
    render(<Palco />);

    await usuario.click(await screen.findByRole('button', { name: /Creatina monoidratada/ }));

    expect(screen.queryByRole('button', { name: /Creatina.*SUPLEMENTO/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Vitamina D3/ })).toBeInTheDocument();
  });

  it('a busca filtra o catálogo', async () => {
    const usuario = userEvent.setup();
    render(<Palco />);
    await screen.findByRole('button', { name: /Camomila/ });

    await usuario.type(screen.getByPlaceholderText(/Buscar no catálogo/), 'vitam');

    expect(screen.getByRole('button', { name: /Vitamina D3/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Camomila/ })).toBeNull();
  });

  /** O caso que a pendência 14 nomeava. */
  it('campo de texto apagado vira ausência, não string vazia', async () => {
    const usuario = userEvent.setup();
    render(<Palco iniciais={[{ ...creatina, frequencia: '2x ao dia', observacao: 'Com água' }]} />);

    const frequencia = screen.getByLabelText('Frequência');
    await usuario.clear(frequencia);
    await usuario.clear(screen.getByPlaceholderText(/Observação para este item/));

    const item = saida()[0]!;
    expect(item.frequencia).toBeUndefined();
    expect(item.observacao).toBeUndefined();
    expect(validar(item).success).toBe(true);
  });

  it('dose e duração apagadas viram ausência, não NaN nem zero', async () => {
    const usuario = userEvent.setup();
    render(<Palco iniciais={[{ ...creatina, dose: 5, unidade: 'g', duracaoDias: 30 }]} />);

    await usuario.clear(screen.getByLabelText('Dose'));
    await usuario.clear(screen.getByLabelText('Duração (dias)'));

    const item = saida()[0]!;
    expect(item.dose).toBeUndefined();
    expect(item.duracaoDias).toBeUndefined();
    // `dose: 0` passaria despercebido na tela e o schema exige positivo.
    expect(validar(item).success).toBe(true);
  });

  /** "2,5 g de creatina" é o caso comum, não o exótico. */
  it('aceita dose decimal digitada dígito a dígito', async () => {
    const usuario = userEvent.setup();
    render(<Palco iniciais={[creatina]} />);

    await usuario.type(screen.getByLabelText('Dose'), '2.5');

    expect(saida()[0]!.dose).toBe(2.5);
  });

  it('a seleção "—" de unidade e via volta para ausência', async () => {
    const usuario = userEvent.setup();
    render(<Palco iniciais={[{ ...creatina, unidade: 'g', via: 'Oral' }]} />);

    await usuario.selectOptions(screen.getByLabelText('Unidade'), '');
    await usuario.selectOptions(screen.getByLabelText('Via'), '');

    const item = saida()[0]!;
    expect(item.unidade).toBeUndefined();
    expect(item.via).toBeUndefined();
    expect(validar(item).success).toBe(true);
  });

  it('horários viram lista limpa, sem vazios de vírgula sobrando', async () => {
    const usuario = userEvent.setup();
    render(<Palco iniciais={[creatina]} />);

    await usuario.type(screen.getByLabelText('Horários'), '08:00 ,, 20:00,');

    const item = saida()[0]!;
    expect(item.horarios).toEqual(['08:00', '20:00']);
    expect(validar(item).success).toBe(true);
  });

  /** O schema exige HH:MM; a tela não valida, então isto documenta a fronteira. */
  it('horário fora do formato chega ao schema e é recusado lá', async () => {
    const usuario = userEvent.setup();
    render(<Palco iniciais={[creatina]} />);

    await usuario.type(screen.getByLabelText('Horários'), '8h da manhã');

    expect(saida()[0]!.horarios).toEqual(['8h da manhã']);
    expect(validar(saida()[0]!).success).toBe(false);
  });

  it('remover tira o item certo quando há mais de um', async () => {
    const usuario = userEvent.setup();
    render(
      <Palco
        iniciais={[
          creatina,
          { prescritivelId: CATALOGO[1]!.id, nome: 'Vitamina D3', horarios: [] },
          { prescritivelId: CATALOGO[2]!.id, nome: 'Camomila', horarios: [] },
        ]}
      />,
    );

    await usuario.click(screen.getByRole('button', { name: 'Remover Vitamina D3' }));

    expect(saida().map((i) => i.nome)).toEqual(['Creatina monoidratada', 'Camomila']);
  });

  it('editar um item não contamina os outros', async () => {
    const usuario = userEvent.setup();
    render(
      <Palco
        iniciais={[creatina, { prescritivelId: CATALOGO[1]!.id, nome: 'Vitamina D3', horarios: [] }]}
      />,
    );

    await usuario.type(screen.getAllByLabelText('Dose')[1]!, '2000');

    expect(saida()[0]!.dose).toBeUndefined();
    expect(saida()[1]!.dose).toBe(2000);
  });

  it('catálogo vazio explica o que fazer em vez de só não mostrar nada', async () => {
    listar.mockResolvedValue([]);
    render(<Palco />);

    expect(await screen.findByText(/Seu catálogo está vazio/)).toBeInTheDocument();
  });

  /** Falha de rede não pode derrubar a tela inteira no meio de uma prescrição. */
  it('catálogo que falha ao carregar não quebra o editor', async () => {
    listar.mockRejectedValue(new Error('sem rede'));
    render(<Palco iniciais={[creatina]} />);

    await waitFor(() => expect(listar).toHaveBeenCalled());
    expect(screen.getByText('Creatina monoidratada')).toBeInTheDocument();
  });
});
