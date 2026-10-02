import { ErroApi } from '@vivio/sdk';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Agenda from '../app/(pro)/agenda/page';

/**
 * A agenda do profissional — uma tela de escrita que não tinha prova nenhuma.
 *
 * O que ela afirma é sobre o tempo de alguém, e o preço de afirmar errado é
 * alto nos dois sentidos: dizer "nenhum atendimento neste dia" a quem tem três
 * faz ele marcar outra coisa em cima; dizer "nenhum horário livre" a quem está
 * sem rede manda ele redefinir uma janela de atendimento que já existe.
 *
 * O resto é a sobreposição. Quem impede dois atendimentos no mesmo horário é a
 * restrição `EXCLUDE` do banco, e a frase que ela produz tem de chegar à tela
 * como ela é — "Você já tem um compromisso neste horário" diz o que fazer;
 * "não foi possível marcar" não diz nada.
 */
const listarAgenda = vi.fn();
const horariosLivres = vi.fn();
const marcar = vi.fn();
const mudarStatus = vi.fn();
const meusAlunos = vi.fn();

vi.mock('../lib/sdk', () => ({
  sdk: {
    agenda: {
      listar: (...a: unknown[]) => listarAgenda(...a),
      horariosLivres: (...a: unknown[]) => horariosLivres(...a),
      marcar: (...a: unknown[]) => marcar(...a),
      mudarStatus: (...a: unknown[]) => mudarStatus(...a),
    },
    vinculos: { meusAlunos: (...a: unknown[]) => meusAlunos(...a) },
  },
}));

const aluna = {
  id: 'vinculo-1',
  status: 'ATIVO',
  aguardandoMinhaResposta: false,
  tipo: 'NUTRICIONISTA',
  contraparte: { id: 'aluna-1', nome: 'Ana Souza', papel: 'ALUNO', avatarUrl: null },
};

const compromisso = (extras: Record<string, unknown> = {}) => ({
  id: 'c1',
  tipo: 'AVALIACAO_FISICA',
  status: 'AGENDADO',
  inicioEm: '2026-10-09T13:00:00.000Z',
  fimEm: '2026-10-09T14:00:00.000Z',
  local: 'Consultório',
  observacao: null,
  aluno: { id: 'aluna-1', nome: 'Ana Souza', avatarUrl: null },
  ...extras,
});

/** `vaga('13')` é 13h UTC — 10h em Brasília, que é o rótulo que a tela mostra. */
const vaga = (hora: string) => ({
  inicioEm: `2026-10-09T${hora}:00:00.000Z`,
  fimEm: `2026-10-09T${hora}:30:00.000Z`,
});

const textoDaTela = () => document.body.textContent ?? '';

beforeEach(() => {
  listarAgenda.mockResolvedValue([]);
  horariosLivres.mockResolvedValue([vaga('13'), vaga('14')]);
  marcar.mockResolvedValue(undefined);
  mudarStatus.mockResolvedValue(undefined);
  meusAlunos.mockResolvedValue([aluna]);
});

describe('agenda: o que a tela afirma', () => {
  it('dia realmente vazio diz que está vazio', async () => {
    render(<Agenda />);

    await waitFor(() => expect(textoDaTela()).toMatch(/nenhum atendimento neste dia/i));
  });

  it('dia com atendimento mostra o aluno e a hora, e não a frase de vazio', async () => {
    listarAgenda.mockResolvedValue([compromisso()]);
    render(<Agenda />);

    // O nome aparece duas vezes: no cartão do atendimento e na opção do
    // seletor de alunos. A hora é o que identifica o cartão.
    await waitFor(() => expect(textoDaTela()).toMatch(/10:00 – 11:00/));
    expect(textoDaTela()).toMatch(/1 atendimento/);
    expect(screen.getByText('Consultório', { exact: false })).toBeInTheDocument();
    expect(textoDaTela()).not.toMatch(/nenhum atendimento neste dia/i);
  });

  it('falha de rede NÃO vira "nenhum atendimento neste dia"', async () => {
    /*
      A afirmação mais cara desta tela. Quem lê "nenhum atendimento" marca outra
      coisa no horário — ou simplesmente não aparece para o aluno que esperava.
    */
    listarAgenda.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'fetch failed', 0));
    render(<Agenda />);

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível ler este dia/i));
    expect(textoDaTela()).not.toMatch(/nenhum atendimento neste dia/i);
    expect(textoDaTela()).not.toMatch(/fetch failed/i);
  });

  it('falha NÃO manda redefinir a janela de atendimento', async () => {
    /*
      O outro lado do mesmo defeito, e o mais enganoso: a frase antiga dizia
      "Defina sua janela de atendimento, ou escolha outro dia" — conselho sobre
      configuração para quem só está sem rede, com a janela já definida.
    */
    horariosLivres.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'fetch failed', 0));
    render(<Agenda />);

    await waitFor(() => expect(textoDaTela()).toMatch(/não deu para ler os horários deste dia/i));
    expect(textoDaTela()).toMatch(/antes de concluir que não há vaga/i);
    expect(textoDaTela()).not.toMatch(/defina sua janela de atendimento/i);
  });

  it('dia sem vaga de verdade continua explicando o que fazer', async () => {
    horariosLivres.mockResolvedValue([]);
    render(<Agenda />);

    await waitFor(() => expect(textoDaTela()).toMatch(/defina sua janela de atendimento/i));
  });
});

describe('agenda: marcar', () => {
  async function escolherAlunoEHorario() {
    render(<Agenda />);
    await waitFor(() =>
      expect([...document.querySelectorAll('option')].some((o) => o.value === 'aluna-1')).toBe(
        true,
      ),
    );
    const seletorDeAluno = document.querySelectorAll('select')[0] as HTMLSelectElement;
    fireEvent.change(seletorDeAluno, { target: { value: 'aluna-1' } });
    const horarios = [...document.querySelectorAll('button')].filter((b) =>
      /^\d{2}:\d{2}$/.test(b.textContent ?? ''),
    );
    fireEvent.click(horarios[0]!);
  }

  it('manda o aluno, o tipo e o início escolhido', async () => {
    await escolherAlunoEHorario();

    fireEvent.click(screen.getByText('Marcar'));

    await waitFor(() => expect(marcar).toHaveBeenCalled());
    const corpo = marcar.mock.calls[0]![0] as Record<string, unknown>;
    expect(corpo.alunoId).toBe('aluna-1');
    expect(corpo.tipo).toBe('AVALIACAO_FISICA');
    expect((corpo.inicioEm as Date).toISOString()).toBe('2026-10-09T13:00:00.000Z');
  });

  it('sem aluno ou sem horário, o botão não deixa marcar', async () => {
    render(<Agenda />);

    await waitFor(() => expect(screen.getByText('Marcar')).toBeInTheDocument());
    expect(screen.getByText('Marcar')).toBeDisabled();
    expect(marcar).not.toHaveBeenCalled();
  });

  it('horário ocupado chega à tela com a frase do banco, não com a genérica', async () => {
    /*
      Quem impede a sobreposição é a restrição `EXCLUDE`. A frase dela diz o que
      corrigir; trocá-la por "não foi possível marcar" faria o profissional
      tentar de novo o mesmo horário.
    */
    marcar.mockRejectedValue(
      new ErroApi('CONFLITO', 'Você já tem um compromisso neste horário.', 409),
    );
    await escolherAlunoEHorario();

    fireEvent.click(screen.getByText('Marcar'));

    await waitFor(() => expect(textoDaTela()).toMatch(/já tem um compromisso neste horário/i));
  });

  it('o segundo clique não marca duas vezes', async () => {
    let liberar: (() => void) | undefined;
    marcar.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          liberar = () => resolve();
        }),
    );
    await escolherAlunoEHorario();

    fireEvent.click(screen.getByText('Marcar'));
    await waitFor(() => expect(screen.getByText('Marcando…')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Marcando…'));

    expect(marcar).toHaveBeenCalledTimes(1);
    liberar?.();
  });

  it('marcado, a tela confirma e relê o dia', async () => {
    // Sem reler, o atendimento novo não apareceria na lista e o profissional
    // marcaria de novo achando que o primeiro não entrou.
    await escolherAlunoEHorario();
    const leiturasAntes = listarAgenda.mock.calls.length;

    fireEvent.click(screen.getByText('Marcar'));

    await waitFor(() => expect(textoDaTela()).toMatch(/atendimento marcado/i));
    expect(listarAgenda.mock.calls.length).toBeGreaterThan(leiturasAntes);
  });
});
