import type { PrescritivelResumo } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogoPrescritivel } from './CatalogoPrescritivel';

/**
 * O catálogo de suplementos, fitoterápicos e medicamentos — um componente, três
 * telas, e até agora nenhuma prova.
 *
 * É o que alimenta toda prescrição: o que não está aqui não pode ser prescrito.
 * Três coisas dele podem falhar em silêncio, e as três custam caro:
 *
 * 1. **A corrida entre buscas.** Cada tecla dispara uma consulta, e respostas de
 *    rede não voltam na ordem em que saíram. Se a resposta de "cre" chegar depois
 *    da de "creatina", a lista mostrada é a da pergunta ANTIGA — e quem clicar
 *    adiciona ao catálogo clínico o item que não escolheu.
 * 2. **Remover sem perguntar.** É um link discreto dentro do cartão, e apaga um
 *    item que pode estar em prescrição ativa.
 * 3. **"Nada aqui ainda" dito por falha de rede.** A frase manda cadastrar — e
 *    quem seguir o conselho duplica o que já existe.
 */
const listar = vi.fn();
const criar = vi.fn();
const remover = vi.fn();

vi.mock('../lib/sdk', () => ({
  sdk: {
    prescritiveis: {
      listar: (...a: unknown[]) => listar(...a),
      criar: (...a: unknown[]) => criar(...a),
      remover: (...a: unknown[]) => remover(...a),
    },
  },
}));

const item = (extras: Partial<PrescritivelResumo> = {}): PrescritivelResumo =>
  ({
    id: 'p1',
    nome: 'Creatina monoidratada',
    tipo: 'SUPLEMENTO',
    escopo: 'PRIVADO',
    apresentacao: 'Pó, 300 g',
    principioAtivo: null,
    contraindicacoes: null,
    observacao: null,
    ...extras,
  }) as PrescritivelResumo;

const textoDaTela = () => document.body.textContent ?? '';

function abrir() {
  return render(
    <CatalogoPrescritivel
      tipo="SUPLEMENTO"
      titulo="Suplementos"
      subtitulo="O que você pode prescrever"
      exemploNome="Creatina"
    />,
  );
}

/** Digita na busca e deixa o atraso de 250 ms passar. */
async function buscar(texto: string) {
  fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: texto } });
  await act(async () => {
    vi.advanceTimersByTime(260);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  listar.mockResolvedValue([]);
  criar.mockResolvedValue(undefined);
  remover.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('catálogo: o que a tela afirma', () => {
  it('falha ao carregar NÃO manda cadastrar o que já existe', async () => {
    listar.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'fetch failed', 0));
    abrir();

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível carregar o catálogo/i));
    expect(textoDaTela()).not.toMatch(/nada aqui ainda/i);
    expect(textoDaTela()).not.toMatch(/fetch failed/i);
  });

  it('catálogo vazio de verdade explica o próximo passo', async () => {
    abrir();

    await waitFor(() => expect(textoDaTela()).toMatch(/nada aqui ainda/i));
  });

  it('item padrão do sistema não oferece remover — não é dele para apagar', async () => {
    // `GLOBAL` é o acervo que vem com o app. Oferecer "Remover" ali seria um
    // botão que o banco recusa, e a recusa chegaria como erro sem explicação.
    listar.mockResolvedValue([item({ escopo: 'GLOBAL', nome: 'Vitamina D3' })]);
    abrir();

    await waitFor(() => expect(screen.getByText('Vitamina D3')).toBeInTheDocument());
    expect(screen.getByText('Padrão')).toBeInTheDocument();
    expect(screen.queryByText('Remover')).not.toBeInTheDocument();
  });
});

describe('catálogo: a busca', () => {
  it('uma consulta por palavra digitada, não uma por tecla', async () => {
    abrir();
    await waitFor(() => expect(listar).toHaveBeenCalledTimes(1));

    for (const parcial of ['c', 'cr', 'cre', 'crea']) {
      fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: parcial } });
    }
    await act(async () => {
      vi.advanceTimersByTime(260);
    });

    // A primeira carga mais UMA busca — não quatro.
    expect(listar).toHaveBeenCalledTimes(2);
    expect(listar.mock.calls[1]![0]).toMatchObject({ q: 'crea' });
  });

  it('espera o dedo parar: nada sai antes dos 250 ms', async () => {
    /*
      A versão anterior desta prova media só o NÚMERO de consultas, e passava
      mesmo com o atraso zerado — porque a limpeza do efeito já descarta o
      timeout anterior a cada tecla. Medir o número não mede o atraso. O que
      importa aqui é que, com o dedo ainda digitando, nenhuma consulta saiu.
    */
    abrir();
    await waitFor(() => expect(listar).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'creatina' } });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(listar).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(listar).toHaveBeenCalledTimes(2);
  });

  it('a primeira carga NÃO espera — a tela não fica vazia de graça', async () => {
    // O atraso existe para o que é digitado. Aplicá-lo na abertura só adiciona
    // um quarto de segundo de lista vazia a quem ainda não digitou nada.
    abrir();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(listar).toHaveBeenCalledTimes(1);
  });

  it('resposta de pergunta ANTIGA não substitui a lista da nova', async () => {
    /*
      O defeito que esta prova fixa, e o único invisível dos três: a resposta de
      "cre" chega DEPOIS da de "creatina" e sobrescreve a lista. O profissional
      clica no que está vendo e adiciona ao catálogo clínico o item que não
      escolheu.
    */
    let responderAntiga: ((v: PrescritivelResumo[]) => void) | undefined;
    listar
      .mockImplementationOnce(() => Promise.resolve([]))
      .mockImplementationOnce(
        () =>
          new Promise<PrescritivelResumo[]>((resolve) => {
            responderAntiga = resolve;
          }),
      )
      .mockImplementationOnce(() => Promise.resolve([item({ id: 'p2', nome: 'Creatina Growth' })]));

    abrir();
    await waitFor(() => expect(listar).toHaveBeenCalledTimes(1));

    await buscar('cre');
    await buscar('creatina');
    await waitFor(() => expect(screen.getByText('Creatina Growth')).toBeInTheDocument());

    // A antiga chega agora, atrasada, com outro resultado.
    await act(async () => {
      responderAntiga?.([item({ id: 'p9', nome: 'Cremes diversos' })]);
    });

    expect(screen.getByText('Creatina Growth')).toBeInTheDocument();
    expect(screen.queryByText('Cremes diversos')).not.toBeInTheDocument();
  });
});

describe('catálogo: remover', () => {
  it('PERGUNTA antes, e não remove nada sem resposta', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    listar.mockResolvedValue([item()]);
    abrir();
    await waitFor(() => expect(screen.getByText('Remover')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Remover'));

    expect(confirmar).toHaveBeenCalled();
    expect(confirmar.mock.calls[0]![0]).toMatch(/creatina monoidratada/i);
    expect(remover).not.toHaveBeenCalled();
    confirmar.mockRestore();
  });

  it('confirmando, remove o item certo e relê o catálogo', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    listar.mockResolvedValue([item()]);
    abrir();
    await waitFor(() => expect(screen.getByText('Remover')).toBeInTheDocument());
    const leiturasAntes = listar.mock.calls.length;

    fireEvent.click(screen.getByText('Remover'));

    await waitFor(() => expect(remover).toHaveBeenCalledWith('p1'));
    // Sem reler, o item apagado continuaria na tela e alguém tentaria de novo.
    await waitFor(() => expect(listar.mock.calls.length).toBeGreaterThan(leiturasAntes));
    confirmar.mockRestore();
  });

  it('se a remoção falhar, a tela diz — em vez de parecer que removeu', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    listar.mockResolvedValue([item()]);
    remover.mockRejectedValue(new ErroApi('CONFLITO', 'Este item está em uma prescrição ativa.', 409));
    abrir();
    await waitFor(() => expect(screen.getByText('Remover')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Remover'));

    // A frase do servidor passa: ela diz o que fazer, e a genérica não diria.
    await waitFor(() => expect(textoDaTela()).toMatch(/em uma prescrição ativa/i));
    confirmar.mockRestore();
  });
});
