import type { FeedbackDoAluno, PainelDeFeedback } from '@vivio/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FeedbackPage from '../app/(pro)/feedback/page';

/**
 * O feedback pós-treino da carteira — a tela que responde "quem reclamou de
 * dor?", e até agora sem prova nenhuma.
 *
 * Três decisões dela são o produto, e as três se desfazem sem quebrar nada:
 *
 * 1. **A lista não é cronológica.** Vem por urgência, com dor primeiro. Ordenar
 *    por data enterraria a dor de seis dias atrás embaixo dos "foi tranquilo" de
 *    hoje — e é a dor que muda a conduta.
 * 2. **Lista vazia NÃO é boa notícia.** O feedback é opcional no fim do treino,
 *    e quem não respondeu não disse que está bem. A tela precisa dizer isso com
 *    palavras, senão o silêncio se lê como aprovação.
 * 3. **A sequência de dor só aparece do segundo em diante.** Dor isolada
 *    acontece com todo mundo; dor em três treinos seguidos é padrão de
 *    prescrição errada. Mostrar "1º treino seguido com dor" transformaria o
 *    número em ruído e ele deixaria de ser lido.
 */
const daCarteira = vi.fn();

vi.mock('../lib/sdk', () => ({ sdk: { feedback: { daCarteira: (...a: unknown[]) => daCarteira(...a) } } }));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const linha = (extras: Partial<FeedbackDoAluno> = {}): FeedbackDoAluno => ({
  execucaoId: 'e1',
  aluno: { id: 'aluna-1', nome: 'Ana Souza' },
  sessaoNome: 'Treino A — Superiores',
  treinoEm: new Date().toISOString(),
  dificuldade: 3,
  teveDor: false,
  localDor: null,
  sensacao: null,
  comentario: null,
  sequenciaDeDor: null,
  ...extras,
});

const painel = (extras: Partial<PainelDeFeedback> = {}): PainelDeFeedback => ({
  dias: 14,
  total: 0,
  precisamDeOlhar: 0,
  linhas: [],
  ...extras,
});

const textoDaTela = () => document.body.textContent ?? '';

beforeEach(() => {
  daCarteira.mockResolvedValue(painel());
});

describe('feedback: o que a tela afirma', () => {
  it('falha ao carregar NÃO vira "ninguém respondeu" nem "nada pede atenção"', async () => {
    /*
      A afirmação mais cara da tela. Qualquer das duas frases de vazio, dita por
      falta de rede, encerra a conversa: o profissional fecha o app achando que
      ninguém reclamou de dor.
    */
    daCarteira.mockRejectedValue(new Error('Failed to fetch'));
    render(<FeedbackPage />);

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível carregar o feedback/i));
    expect(textoDaTela()).not.toMatch(/nenhum aluno respondeu/i);
    expect(textoDaTela()).not.toMatch(/nenhum feedback pede atenção/i);
    expect(textoDaTela()).not.toMatch(/failed to fetch/i);
  });

  it('ninguém respondeu: a tela diz que isso NÃO quer dizer que está tudo bem', async () => {
    /*
      O feedback é opcional no fim do treino, e muita gente passa direto sem
      saber que ele chega ao profissional. Sem esta frase, o silêncio se lê como
      aprovação — e é o tipo de engano que ninguém investiga.
    */
    daCarteira.mockResolvedValue(painel({ total: 0, linhas: [] }));
    render(<FeedbackPage />);

    await waitFor(() => expect(textoDaTela()).toMatch(/nenhum aluno respondeu/i));
    expect(textoDaTela()).toMatch(/não quer dizer que está tudo bem/i);
  });

  it('responderam e está tudo em ordem: diz quantos, e não finge que ninguém falou', async () => {
    // As duas situações dão lista vazia e significam coisas opostas: "ninguém
    // respondeu" e "doze responderam, todos bem".
    daCarteira.mockResolvedValue(painel({ total: 12, precisamDeOlhar: 0, linhas: [] }));
    render(<FeedbackPage />);

    await waitFor(() => expect(textoDaTela()).toMatch(/nenhum feedback pede atenção/i));
    expect(textoDaTela()).toMatch(/os 12 treinos vieram na medida/i);
    expect(textoDaTela()).not.toMatch(/nenhum aluno respondeu/i);
  });
});

describe('feedback: a dor', () => {
  it('dor isolada não mostra contador — ele só vale como padrão', async () => {
    daCarteira.mockResolvedValue(
      painel({
        total: 1,
        precisamDeOlhar: 1,
        linhas: [linha({ teveDor: true, localDor: 'ombro direito', sequenciaDeDor: 1 })],
      }),
    );
    render(<FeedbackPage />);

    await waitFor(() => expect(textoDaTela()).toMatch(/sentiu dor/i));
    expect(textoDaTela()).toMatch(/ombro direito/);
    expect(textoDaTela()).not.toMatch(/treino seguido com dor/i);
  });

  it('dor repetida mostra a sequência — é o que separa torção de prescrição errada', async () => {
    daCarteira.mockResolvedValue(
      painel({
        total: 1,
        precisamDeOlhar: 1,
        linhas: [linha({ teveDor: true, localDor: 'joelho', sequenciaDeDor: 3 })],
      }),
    );
    render(<FeedbackPage />);

    await waitFor(() => expect(textoDaTela()).toMatch(/3º treino seguido com dor/i));
  });

  it('a etiqueta de dor aparece, e não só o texto', async () => {
    // A etiqueta é o que faz a linha ser vista numa lista longa, antes de
    // alguém ler o parágrafo.
    daCarteira.mockResolvedValue(
      painel({ total: 1, precisamDeOlhar: 1, linhas: [linha({ teveDor: true })] }),
    );
    render(<FeedbackPage />);

    await waitFor(() => expect(screen.getByText('Dor')).toBeInTheDocument());
  });
});

describe('feedback: a ordem e a ação', () => {
  it('a tela mostra as linhas na ordem que o servidor mandou — por urgência, não por data', async () => {
    /*
      A ordenação é do servidor, de propósito (a regra mora em
      `@vivio/contracts`). O que esta prova trava é a tela não reordenar por
      conta: se alguém puser um `.sort()` por data aqui, a dor de seis dias atrás
      desce para o fim da lista.
    */
    const hoje = new Date().toISOString();
    const seisDiasAtras = new Date(Date.now() - 6 * 864e5).toISOString();
    daCarteira.mockResolvedValue(
      painel({
        total: 2,
        precisamDeOlhar: 1,
        linhas: [
          linha({ execucaoId: 'dor', aluno: { id: 'a1', nome: 'Ana Souza' }, teveDor: true, treinoEm: seisDiasAtras }),
          linha({ execucaoId: 'ok', aluno: { id: 'a2', nome: 'Bruno Lima' }, treinoEm: hoje }),
        ],
      }),
    );
    render(<FeedbackPage />);

    await waitFor(() => expect(screen.getByText('Ana Souza')).toBeInTheDocument());
    const texto = textoDaTela();
    expect(texto.indexOf('Ana Souza')).toBeLessThan(texto.indexOf('Bruno Lima'));
  });

  it('cada linha leva a responder no chat e a abrir a ficha', async () => {
    // Não existe "marcar como lido" de propósito: o que fecha o ciclo é
    // responder ao aluno, e os dois atalhos são a ação de hoje.
    daCarteira.mockResolvedValue(
      painel({ total: 1, precisamDeOlhar: 1, linhas: [linha({ teveDor: true })] }),
    );
    render(<FeedbackPage />);

    const chat = await screen.findByText('Responder no chat');
    expect(chat.closest('a')?.getAttribute('href')).toBe('/chat?com=aluna-1');
    expect(screen.getByText('Abrir ficha').closest('a')?.getAttribute('href')).toBe(
      '/alunos/aluna-1',
    );
  });

  it('trocar a janela de dias refaz a consulta com o número novo', async () => {
    render(<FeedbackPage />);
    await waitFor(() => expect(daCarteira).toHaveBeenCalledWith(14, false));

    fireEvent.click(screen.getByText('30 dias'));

    await waitFor(() => expect(daCarteira).toHaveBeenCalledWith(30, false));
  });

  it('"só o que pede atenção" é filtro do SERVIDOR, não da tela', async () => {
    /*
      Filtrar no cliente daria um número de "pedem atenção" que não corresponde à
      lista — e o contador é o que o profissional lê primeiro.
    */
    render(<FeedbackPage />);
    await waitFor(() => expect(daCarteira).toHaveBeenCalledWith(14, false));

    fireEvent.click(screen.getByLabelText(/só o que pede atenção/i));

    await waitFor(() => expect(daCarteira).toHaveBeenCalledWith(14, true));
  });
});
