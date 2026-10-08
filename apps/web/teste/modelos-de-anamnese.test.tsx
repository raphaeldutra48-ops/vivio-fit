import { PERGUNTAS_SUGERIDAS, type ModeloAnamneseResumo } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ModelosDeAnamnese from '../app/(pro)/cadastros/anamnese/page';

/**
 * Os modelos de anamnese — o questionário que o profissional monta uma vez e
 * aplica em cada paciente, até agora sem prova nenhuma.
 *
 * As regras de validação já têm prova em `apps/web/lib/anamnese.spec.ts`. O que
 * falta aqui é a fiação, e nela moram quatro coisas que se desfazem caladas:
 *
 * 1. **Criar e editar usam o MESMO formulário**, distinguidos por um detalhe
 *    fácil de apagar: `editando` vale `null` na listagem, `''` no formulário de
 *    criação e o id na edição — e o `if (editando)` conta com `''` ser falso.
 *    Trocar esse `''` por `null` mandaria toda criação para a rota de
 *    atualização, sem quebrar nenhum teste de unidade.
 * 2. **A ordem das perguntas é pensada.** Numa anamnese, a sequência conduz a
 *    conversa; reordenar errado muda o que o paciente responde.
 *    O movimento tem de anunciar para quem usa leitor de tela.
 * 3. **Remover PERGUNTA antes, e diz o que NÃO se perde:** anamnese já aplicada
 *    continua no histórico. Sem essa frase, ninguém apaga um modelo com medo de
 *    apagar o registro clínico junto.
 * 4. **Falha ao listar não vira "nenhum modelo ainda".** A frase convida a
 *    montar o primeiro — e quem seguir monta de novo o que já existe.
 */
const listar = vi.fn();
const criar = vi.fn();
const atualizar = vi.fn();
const remover = vi.fn();

vi.mock('../lib/sdk', () => ({
  sdk: {
    modelosAnamnese: {
      listar: (...a: unknown[]) => listar(...a),
      criar: (...a: unknown[]) => criar(...a),
      atualizar: (...a: unknown[]) => atualizar(...a),
      remover: (...a: unknown[]) => remover(...a),
    },
  },
}));

const modelo = (extras: Partial<ModeloAnamneseResumo> = {}): ModeloAnamneseResumo =>
  ({
    id: 'm1',
    nome: 'Anamnese nutricional — primeira consulta',
    descricao: null,
    totalPerguntas: 2,
    atualizadoEm: '2026-09-30T12:00:00.000Z',
    perguntas: [
      {
        id: 'p1',
        texto: 'Tem alguma alergia alimentar?',
        tipo: 'TEXTO_CURTO',
        opcoes: [],
        obrigatoria: true,
        ajuda: null,
        ordem: 0,
      },
      {
        id: 'p2',
        texto: 'Usa algum medicamento contínuo?',
        tipo: 'TEXTO_LONGO',
        opcoes: [],
        obrigatoria: false,
        ajuda: null,
        ordem: 1,
      },
    ],
    ...extras,
  }) as ModeloAnamneseResumo;

const textoDaTela = () => document.body.textContent ?? '';
const corpoDe = (espiao: typeof criar, indice: number) =>
  espiao.mock.calls[0]![indice] as Record<string, unknown>;

const espiarConfirm = () => vi.spyOn(window, 'confirm');
let confirmar: ReturnType<typeof espiarConfirm>;

beforeEach(() => {
  listar.mockResolvedValue([]);
  criar.mockResolvedValue(undefined);
  atualizar.mockResolvedValue(undefined);
  remover.mockResolvedValue(undefined);
  confirmar = espiarConfirm().mockReturnValue(true);
});

afterEach(() => {
  confirmar.mockRestore();
});

describe('anamnese: criar não é editar', () => {
  it('criar manda para a rota de CRIAÇÃO, não para a de atualização', async () => {
    /*
      O detalhe que o `editando: ''` protege. Com `null` no lugar, `if (editando)`
      ficaria falso na edição e verdadeiro em nenhum caso — ou o contrário —, e
      criar um modelo passaria a sobrescrever outro.
    */
    render(<ModelosDeAnamnese />);

    fireEvent.click(await screen.findByText('+ Usar perguntas sugeridas'));
    fireEvent.change(screen.getByLabelText('Nome do modelo'), {
      target: { value: 'Anamnese do personal' },
    });
    // O botão diz o que vai fazer: "Criar modelo" na criação, "Salvar
    // alterações" na edição. É o sinal visível de qual rota será chamada.
    fireEvent.click(screen.getByText('Criar modelo'));

    await waitFor(() => expect(criar).toHaveBeenCalledTimes(1));
    expect(atualizar).not.toHaveBeenCalled();
    expect(corpoDe(criar, 0)).toMatchObject({ nome: 'Anamnese do personal' });
  });

  it('editar manda para a rota de ATUALIZAÇÃO, com o id do modelo', async () => {
    listar.mockResolvedValue([modelo()]);
    render(<ModelosDeAnamnese />);

    fireEvent.click(await screen.findByText('Editar'));
    expect(screen.getByLabelText('Nome do modelo')).toHaveValue(
      'Anamnese nutricional — primeira consulta',
    );

    fireEvent.click(screen.getByText('Salvar alterações'));

    await waitFor(() => expect(atualizar).toHaveBeenCalledTimes(1));
    expect(criar).not.toHaveBeenCalled();
    expect(atualizar.mock.calls[0]![0]).toBe('m1');
  });

  it('abrir para editar traz as perguntas que estavam salvas', async () => {
    // Sem isso, salvar depois de abrir para corrigir o nome apagaria o
    // questionário inteiro.
    listar.mockResolvedValue([modelo()]);
    render(<ModelosDeAnamnese />);

    fireEvent.click(await screen.findByText('Editar'));

    expect(textoDaTela()).toMatch(/tem alguma alergia alimentar/i);
    expect(textoDaTela()).toMatch(/usa algum medicamento contínuo/i);
  });

  it('"começar do zero" abre com uma pergunta em branco; "sugeridas" abre com as sugestões', async () => {
    render(<ModelosDeAnamnese />);

    fireEvent.click(await screen.findByText('Começar do zero'));
    expect(textoDaTela()).not.toMatch(new RegExp(PERGUNTAS_SUGERIDAS[0]!.texto, 'i'));

    fireEvent.click(screen.getByText('Cancelar'));
    fireEvent.click(screen.getByText('+ Usar perguntas sugeridas'));

    expect(textoDaTela()).toMatch(new RegExp(PERGUNTAS_SUGERIDAS[0]!.texto, 'i'));
  });

  it('modelo sem nome não pode ser salvo', async () => {
    render(<ModelosDeAnamnese />);

    fireEvent.click(await screen.findByText('+ Usar perguntas sugeridas'));

    expect(screen.getByText('Criar modelo')).toBeDisabled();
    expect(criar).not.toHaveBeenCalled();
  });
});

describe('anamnese: a ordem das perguntas', () => {
  it('mover para baixo troca a ordem, e o envio sai na ordem nova', async () => {
    /*
      Numa anamnese a sequência conduz a conversa — "sente dor?" antes de "onde?"
      é outra pergunta que "onde?" antes de "sente dor?". A ordem que sai daqui é
      a que o paciente vai ver.
    */
    render(<ModelosDeAnamnese />);
    fireEvent.click(await screen.findByText('+ Usar perguntas sugeridas'));
    fireEvent.change(screen.getByLabelText('Nome do modelo'), { target: { value: 'Modelo' } });

    const primeira = PERGUNTAS_SUGERIDAS[0]!.texto;
    const segunda = PERGUNTAS_SUGERIDAS[1]!.texto;

    fireEvent.click(screen.getByLabelText('Mover pergunta 1 para baixo'));
    fireEvent.click(screen.getByText('Criar modelo'));

    await waitFor(() => expect(criar).toHaveBeenCalled());
    const perguntas = corpoDe(criar, 0).perguntas as { texto: string }[];
    expect(perguntas[0]!.texto).toBe(segunda);
    expect(perguntas[1]!.texto).toBe(primeira);
  });

  it('o movimento é ANUNCIADO — quem usa leitor de tela não vê a lista pular', async () => {
    render(<ModelosDeAnamnese />);
    fireEvent.click(await screen.findByText('+ Usar perguntas sugeridas'));

    fireEvent.click(screen.getByLabelText('Mover pergunta 1 para baixo'));

    // A região de anúncio existe para isso; sem ela o arrasto é mudo.
    await waitFor(() => expect(textoDaTela()).toMatch(/posição 2 de \d+/i));
  });
});

describe('anamnese: remover', () => {
  it('PERGUNTA antes e diz que o histórico NÃO se perde', async () => {
    /*
      A segunda frase é o que permite apagar sem medo. Sem ela, o profissional
      mantém modelos velhos na lista para não arriscar perder a anamnese que já
      aplicou — e a lista de escolha fica inutilizável.
    */
    confirmar.mockReturnValue(false);
    listar.mockResolvedValue([modelo()]);
    render(<ModelosDeAnamnese />);
    await waitFor(() => expect(screen.getByText('Remover')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Remover'));

    const pergunta = String(confirmar.mock.calls[0]![0]);
    expect(pergunta).toMatch(/anamnese nutricional/i);
    expect(pergunta).toMatch(/continuam no histórico/i);
    expect(remover).not.toHaveBeenCalled();
  });

  it('confirmando, remove o modelo certo e relê a lista', async () => {
    listar.mockResolvedValue([modelo()]);
    render(<ModelosDeAnamnese />);
    await waitFor(() => expect(screen.getByText('Remover')).toBeInTheDocument());
    const antes = listar.mock.calls.length;

    fireEvent.click(screen.getByText('Remover'));

    await waitFor(() => expect(remover).toHaveBeenCalledWith('m1'));
    await waitFor(() => expect(listar.mock.calls.length).toBeGreaterThan(antes));
  });

  it('se a remoção falhar, a tela avisa — DEPOIS da recarga', async () => {
    // A recarga limpa o erro ao dar certo; um aviso antes dela seria apagado no
    // mesmo instante, e a tela voltaria idêntica ao que era antes do clique.
    remover.mockRejectedValue(new ErroApi('CONFLITO', 'Em uso.', 409));
    listar.mockResolvedValue([modelo()]);
    render(<ModelosDeAnamnese />);
    await waitFor(() => expect(screen.getByText('Remover')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Remover'));

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível remover/i));
  });
});

describe('anamnese: o que a tela afirma', () => {
  it('falha ao listar NÃO convida a montar o primeiro', async () => {
    listar.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'fetch failed', 0));
    render(<ModelosDeAnamnese />);

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível carregar os modelos/i));
    expect(textoDaTela()).not.toMatch(/nenhum modelo ainda/i);
    expect(textoDaTela()).not.toMatch(/fetch failed/i);
  });

  it('sem modelo nenhum de verdade, sugere as perguntas prontas', async () => {
    render(<ModelosDeAnamnese />);

    await waitFor(() => expect(textoDaTela()).toMatch(/nenhum modelo ainda/i));
  });

  it('a contagem de perguntas concorda em singular e plural', async () => {
    listar.mockResolvedValue([
      modelo({ totalPerguntas: 1 }),
      modelo({ id: 'm2', nome: 'Outro modelo', totalPerguntas: 4 }),
    ]);
    render(<ModelosDeAnamnese />);

    const cartao = await screen.findByText('Outro modelo');
    expect(within(cartao.closest('div')!.parentElement!).getByText(/4 perguntas/)).toBeInTheDocument();
    expect(textoDaTela()).toMatch(/1 pergunta(?!s)/);
  });
});
