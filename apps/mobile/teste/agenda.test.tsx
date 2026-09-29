import { obterTema } from '@vivio/ui-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { alertas, responderAlerta } from './preparo';

/**
 * A agenda do aluno.
 *
 * Ela mostra consultas e avaliações, e deixa fazer exatamente duas coisas:
 * confirmar presença e avisar que não vai. Parecem simétricas e não são —
 * confirmar por engano se desfaz com outro toque, avisar que não vai libera o
 * horário, e o profissional pode entregá-lo a outra pessoa antes de alguém
 * perceber. Os dois botões ficam lado a lado.
 *
 * O resto é leitura de data e hora, que numa agenda é o conteúdo inteiro: um
 * dia deslocado por causa de fuso marca a consulta no dia errado.
 */
const meusCompromissos = vi.fn();
const mudarStatus = vi.fn();

vi.mock('../src/sdk', () => ({
  sdk: {
    agenda: {
      meus: (...a: unknown[]) => meusCompromissos(...a),
      mudarStatus: (...a: unknown[]) => mudarStatus(...a),
    },
  },
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children?: unknown }) => children,
}));

const usuario = { id: 'aluna-1', nome: 'Ana Souza', email: 'ana@exemplo.com', papel: 'ALUNO' };
const sessao = { tema: obterTema('claro'), nomeDoTema: 'claro', usuario, carregando: false };
vi.mock('../src/sessao', () => ({ useSessao: () => sessao }));

const compromisso = (id: string, extras: Record<string, unknown> = {}) => ({
  id,
  tipo: 'CONSULTA',
  status: 'AGENDADO',
  // Meio-dia em Brasília: a hora exibida é lida do instante, e este não vira o dia.
  inicioEm: '2026-10-05T15:00:00.000Z',
  duracaoMin: 50,
  local: 'Consultório 2',
  profissional: { id: 'prof-1', nome: 'Eduarda Nutricionista', papel: 'NUTRICIONISTA' },
  ...extras,
});

const textoDaTela = () => document.body.textContent ?? '';

async function abrirTela() {
  const { default: Agenda } = await import('../app/(tabs)/agenda');
  return render(<Agenda />);
}

beforeEach(() => {
  alertas.length = 0;
  meusCompromissos.mockResolvedValue([compromisso('c1')]);
  mudarStatus.mockResolvedValue(undefined);
});

describe('agenda: o que ela mostra', () => {
  it('agrupa por dia, com o dia da semana por extenso', async () => {
    /*
      "segunda-feira, 05 de outubro" responde sozinho a pergunta que faz alguém
      abrir a agenda. A data é ancorada ao meio-dia justamente para não cair no
      dia anterior no fuso do Brasil.
    */
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toMatch(/segunda-feira, 05 de outubro/i));
    expect(textoDaTela()).toContain('Eduarda Nutricionista');
    expect(textoDaTela()).toContain('50 min');
  });

  it('falha ao carregar NÃO vira "nenhum atendimento marcado"', async () => {
    /*
      O defeito que esta prova fixa: as duas frases apareciam juntas, e a que
      fica é a do cartão. Quem tem consulta amanhã lia que não tem — e consulta
      perdida por isso não se remarca no mesmo dia.
    */
    meusCompromissos.mockRejectedValue(new Error('rede'));
    await abrirTela();

    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar sua agenda.')).toBeInTheDocument(),
    );
    expect(textoDaTela()).not.toMatch(/nenhum atendimento marcado/i);
  });

  it('o vazio de verdade diz de onde vem o primeiro atendimento', async () => {
    meusCompromissos.mockResolvedValue([]);
    await abrirTela();

    await waitFor(() => expect(screen.getByText('Nenhum atendimento marcado')).toBeInTheDocument());
  });

  it('só o que ainda está agendado pede resposta', async () => {
    // Confirmar de novo o que já está confirmado é ruído; e um "não vou" num
    // atendimento já realizado não significa nada.
    meusCompromissos.mockResolvedValue([compromisso('c1', { status: 'CONFIRMADO' })]);
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toContain('Eduarda Nutricionista'));
    expect(screen.queryByLabelText(/confirmar presença/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/cancelar este atendimento/i)).not.toBeInTheDocument();
  });
});

describe('agenda: responder', () => {
  it('confirmar presença é um toque, sem pergunta', async () => {
    // Confirmar é reversível: a fricção aqui estaria no lugar errado.
    await abrirTela();
    await waitFor(() => expect(screen.getByLabelText(/confirmar presença/i)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/confirmar presença/i));

    await waitFor(() => expect(mudarStatus).toHaveBeenCalledWith('c1', { status: 'CONFIRMADO' }));
    expect(alertas).toHaveLength(0);
  });

  it('"Não vou" PERGUNTA antes — e não cancela nada sem resposta', async () => {
    /*
      A regra que este arquivo existe para defender. O botão fica encostado no
      de confirmar, e o que ele faz é liberar o horário para outra pessoa.
    */
    await abrirTela();
    await waitFor(() =>
      expect(screen.getByLabelText(/cancelar este atendimento/i)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByLabelText(/cancelar este atendimento/i));

    await waitFor(() => expect(alertas).toHaveLength(1));
    expect(alertas[0]!.titulo).toMatch(/avisar que não vai/i);
    // E a pergunta diz o que está em jogo, com nome e horário.
    expect(alertas[0]!.mensagem).toMatch(/eduarda nutricionista/i);
    expect(mudarStatus).not.toHaveBeenCalled();
  });

  it('confirmando, cancela o atendimento certo', async () => {
    meusCompromissos.mockResolvedValue([compromisso('c1'), compromisso('c2')]);
    await abrirTela();
    await waitFor(() =>
      expect(screen.getAllByLabelText(/cancelar este atendimento/i)).toHaveLength(2),
    );

    fireEvent.click(screen.getAllByLabelText(/cancelar este atendimento/i)[1]!);
    await waitFor(() => expect(alertas).toHaveLength(1));
    responderAlerta('não vou');

    await waitFor(() => expect(mudarStatus).toHaveBeenCalledWith('c2', { status: 'CANCELADO' }));
  });

  it('mantendo o horário, nada acontece', async () => {
    await abrirTela();
    await waitFor(() =>
      expect(screen.getByLabelText(/cancelar este atendimento/i)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByLabelText(/cancelar este atendimento/i));
    await waitFor(() => expect(alertas).toHaveLength(1));

    responderAlerta('manter o horário');

    await new Promise((r) => setTimeout(r, 80));
    expect(mudarStatus).not.toHaveBeenCalled();
  });

  it('se a resposta não for gravada, a tela diz — em vez de fingir que foi', async () => {
    /*
      Achar que confirmou presença e não ter confirmado é o pior dos dois
      mundos: a pessoa aparece num horário que o profissional deu como vago.
    */
    mudarStatus.mockRejectedValue(new Error('rede'));
    await abrirTela();
    await waitFor(() => expect(screen.getByLabelText(/confirmar presença/i)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/confirmar presença/i));

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível atualizar/i));
  });
});
