import type { ModeloPrescricaoResumo } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ModelosDePrescricao from '../app/(pro)/prescricoes/modelos/page';

/**
 * Os modelos de prescrição — o atalho que evita redigitar posologia, e até agora
 * sem prova nenhuma.
 *
 * O valor do modelo é justamente não redigitar: **é redigitando que se troca "1
 * comprimido" por "1 mL"**. Por isso o que esta prova trava é o que torna o
 * atalho confiável:
 *
 * 1. **A posologia aparece escrita em cada item.** Um cartão que mostra só o
 *    nome do item obriga a abrir o modelo para saber a dose — e quem não abre
 *    aplica o modelo errado.
 * 2. **Item sem posologia é dito assim.** Um modelo pode ter sido salvo com a
 *    dose em branco; mostrar o nome sozinho faria parecer completo.
 * 3. **Remover PERGUNTA antes.** É um link discreto no canto do cartão, e apaga
 *    um molde que pode estar em uso há meses.
 * 4. **Falha ao listar não vira "nenhum modelo ainda".** A frase manda montar o
 *    primeiro — e quem seguir o conselho monta de novo o que já existe.
 */
const listar = vi.fn();
const criar = vi.fn();
const remover = vi.fn();
const listarPrescritiveis = vi.fn();

vi.mock('../lib/sdk', () => ({
  sdk: {
    modelosPrescricao: {
      listar: (...a: unknown[]) => listar(...a),
      criar: (...a: unknown[]) => criar(...a),
      remover: (...a: unknown[]) => remover(...a),
    },
    // O editor de itens busca o catálogo do profissional; sem o dublê, abrir o
    // formulário derruba o render por um motivo que não é o da prova.
    prescritiveis: { listar: (...a: unknown[]) => listarPrescritiveis(...a) },
  },
}));

const modelo = (extras: Partial<ModeloPrescricaoResumo> = {}): ModeloPrescricaoResumo =>
  ({
    id: 'm1',
    nome: 'Pós-treino padrão',
    descricao: null,
    orientacoes: 'Tomar junto da refeição seguinte.',
    totalItens: 1,
    itens: [
      {
        id: 'i1',
        prescritivelId: 'p1',
        dose: 5,
        unidade: 'g',
        frequencia: '1x ao dia',
        horarios: ['08:00'],
        duracaoDias: 30,
        via: 'Oral',
        observacao: null,
        prescritivel: { id: 'p1', nome: 'Creatina monoidratada', tipo: 'SUPLEMENTO' },
      },
    ],
    ...extras,
  }) as ModeloPrescricaoResumo;

const textoDaTela = () => document.body.textContent ?? '';

/*
  O tipo vem do próprio espião, e não de `ReturnType<typeof vi.spyOn>`: o
  genérico sem argumento não casa com a assinatura de `window.confirm`, e o
  typecheck reprova com uma mensagem que não aponta para cá.
*/
const espiarConfirm = () => vi.spyOn(window, 'confirm');
let confirmar: ReturnType<typeof espiarConfirm>;

beforeEach(() => {
  listar.mockResolvedValue([]);
  criar.mockResolvedValue(undefined);
  remover.mockResolvedValue(undefined);
  listarPrescritiveis.mockResolvedValue([]);
  confirmar = espiarConfirm().mockReturnValue(true);
});

afterEach(() => {
  confirmar.mockRestore();
});

describe('modelos: o que o cartão mostra', () => {
  it('a posologia vem escrita, para ninguém precisar abrir o modelo', async () => {
    /*
      O modelo existe para não redigitar — e é redigitando que se troca "1
      comprimido" por "1 mL". Um cartão com só o nome do item obriga a abrir para
      conferir a dose, e quem não abre aplica o que não leu.
    */
    listar.mockResolvedValue([modelo()]);
    render(<ModelosDePrescricao />);

    await waitFor(() => expect(screen.getByText('Creatina monoidratada')).toBeInTheDocument());
    const texto = textoDaTela();
    expect(texto).toMatch(/5\s*g/);
    expect(texto).toMatch(/1x ao dia/);
    expect(texto).toMatch(/30 dias/);
  });

  it('item sem posologia diz isso, em vez de parecer completo', async () => {
    listar.mockResolvedValue([
      modelo({
        itens: [
          {
            id: 'i1',
            prescritivelId: 'p1',
            horarios: [],
            prescritivel: { id: 'p1', nome: 'Vitamina D3', tipo: 'SUPLEMENTO' },
          },
        ] as unknown as ModeloPrescricaoResumo['itens'],
      }),
    ]);
    render(<ModelosDePrescricao />);

    await waitFor(() => expect(textoDaTela()).toMatch(/sem posologia definida/i));
  });

  it('a contagem de itens concorda em singular e plural', async () => {
    // "1 itens" num documento clínico é o tipo de desleixo que faz duvidar do
    // resto da tela.
    listar.mockResolvedValue([modelo({ totalItens: 1 }), modelo({ id: 'm2', nome: 'Outro', totalItens: 3 })]);
    render(<ModelosDePrescricao />);

    await waitFor(() => expect(textoDaTela()).toMatch(/1 item/));
    expect(textoDaTela()).toMatch(/3 itens/);
    expect(textoDaTela()).not.toMatch(/1 itens/);
  });

  it('as orientações do modelo aparecem — elas vão para a prescrição', async () => {
    listar.mockResolvedValue([modelo()]);
    render(<ModelosDePrescricao />);

    await waitFor(() => expect(textoDaTela()).toMatch(/tomar junto da refeição seguinte/i));
  });
});

describe('modelos: remover', () => {
  it('PERGUNTA antes, nomeando o modelo — e não remove sem resposta', async () => {
    confirmar.mockReturnValue(false);
    listar.mockResolvedValue([modelo()]);
    render(<ModelosDePrescricao />);
    await waitFor(() => expect(screen.getByText('Remover')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Remover'));

    expect(confirmar).toHaveBeenCalled();
    expect(String(confirmar.mock.calls[0]![0])).toMatch(/pós-treino padrão/i);
    expect(remover).not.toHaveBeenCalled();
  });

  it('confirmando, remove o modelo certo e relê a lista', async () => {
    listar.mockResolvedValue([modelo()]);
    render(<ModelosDePrescricao />);
    await waitFor(() => expect(screen.getByText('Remover')).toBeInTheDocument());
    const leiturasAntes = listar.mock.calls.length;

    fireEvent.click(screen.getByText('Remover'));

    await waitFor(() => expect(remover).toHaveBeenCalledWith('m1'));
    await waitFor(() => expect(listar.mock.calls.length).toBeGreaterThan(leiturasAntes));
  });

  it('se a remoção falhar, a tela avisa — DEPOIS da recarga, para o aviso não ser apagado', async () => {
    /*
      A ordem importa e já custou um defeito nesta família de telas: a recarga
      limpa o erro ao dar certo, então um `setErro` antes dela era apagado no
      mesmo instante — e a tela voltava a ficar idêntica ao que era antes do
      clique. Exclusão confirmada, nada aconteceu, nenhuma palavra.
    */
    remover.mockRejectedValue(new ErroApi('CONFLITO', 'Modelo em uso.', 409));
    listar.mockResolvedValue([modelo()]);
    render(<ModelosDePrescricao />);
    await waitFor(() => expect(screen.getByText('Remover')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Remover'));

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível remover/i));
  });
});

describe('modelos: o que a tela afirma', () => {
  it('falha ao listar NÃO manda montar o primeiro', async () => {
    listar.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'fetch failed', 0));
    render(<ModelosDePrescricao />);

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível carregar os modelos/i));
    expect(textoDaTela()).not.toMatch(/nenhum modelo ainda/i);
    expect(textoDaTela()).not.toMatch(/fetch failed/i);
  });

  it('sem modelo nenhum de verdade, explica o próximo passo', async () => {
    render(<ModelosDePrescricao />);

    await waitFor(() => expect(textoDaTela()).toMatch(/nenhum modelo ainda/i));
    expect(textoDaTela()).toMatch(/a partir do seu catálogo/i);
  });

  it('modelo sem nome ou sem item não pode ser salvo', async () => {
    // Modelo vazio não serve de atalho para nada, e um salvo por engano aparece
    // na lista de escolha no momento de prescrever.
    render(<ModelosDePrescricao />);

    fireEvent.click(await screen.findByText('+ Novo modelo'));

    expect(screen.getByText('Salvar modelo')).toBeDisabled();
    expect(criar).not.toHaveBeenCalled();
  });
});
