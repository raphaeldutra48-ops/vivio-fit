import { DIAS_PARA_ALERTA, type LinhaDoRelatorio, type RelatorioDaCarteira } from '@vivio/contracts';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Relatorios from '../app/(pro)/relatorios/page';

/**
 * O relatório da carteira — a tabela que o profissional olha para saber quem
 * está indo bem, e até agora sem prova nenhuma.
 *
 * O que ela tem de mais delicado não é número nenhum: é a diferença entre
 * **zero e "não posso ver"**. Cada linha mistura dado de três autorizações
 * diferentes, e o mesmo aluno pode ter liberado treino e não evolução. Escrever
 * "0 kg" onde a pessoa não autorizou é inventar um dado sobre o corpo dela; e
 * escrever "0 treinos" para quem não autorizou treino faz o profissional cobrar
 * alguém por um silêncio que ele mesmo não pode medir.
 *
 * As outras duas decisões que esta prova trava:
 *
 * 1. **A corrida entre janelas.** Trocar 30 → 90 dias rápido deixava a resposta
 *    lenta da janela anterior chegar por último: a tela mostrava os números de um
 *    período com o botão do outro marcado, e nada denunciava a troca.
 * 2. **Quem precisa de atenção aparece ANTES da tabela.** A tabela tem trinta
 *    linhas parecidas; o bloco de atenção é o que se lê.
 */
const carteira = vi.fn();

vi.mock('../lib/sdk', () => ({ sdk: { relatorios: { carteira: (...a: unknown[]) => carteira(...a) } } }));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const linha = (extras: Partial<LinhaDoRelatorio> = {}): LinhaDoRelatorio =>
  ({
    alunoId: 'aluna-1',
    nome: 'Ana Souza',
    autorizou: { treino: true, evolucao: true, nutricao: true },
    treinosNoPeriodo: 8,
    ultimoTreinoEm: new Date().toISOString(),
    diasSemTreinar: 2,
    pesoInicialKg: 82,
    pesoAtualKg: 80,
    variacaoPesoKg: -2,
    adesaoDietaPercentual: 75,
    diasSemCheckin: 1,
    ...extras,
  }) as LinhaDoRelatorio;

const relatorio = (extras: Partial<RelatorioDaCarteira> = {}): RelatorioDaCarteira => ({
  dias: 30,
  de: '2026-09-02',
  ate: '2026-10-02',
  totalAlunos: 1,
  alunosQueTreinaram: 1,
  treinosNoPeriodo: 8,
  mediaTreinosPorAluno: 8,
  linhas: [linha()],
  ...extras,
});

const textoDaTela = () => document.body.textContent ?? '';

beforeEach(() => {
  carteira.mockResolvedValue(relatorio());
});

describe('relatório: zero não é "não posso ver"', () => {
  it('sem autorização de evolução, o peso diz "não autorizado" — e não zero', async () => {
    /*
      A confusão mais caríssima da tabela. "0 kg" de variação é uma afirmação
      sobre o corpo de alguém; "não autorizado" é a verdade. O rodapé da tela
      existe para dizer isso em palavras, e a célula para dizer na linha.
    */
    carteira.mockResolvedValue(
      relatorio({
        linhas: [
          linha({
            autorizou: { treino: true, evolucao: false, nutricao: true },
            pesoInicialKg: null,
            pesoAtualKg: null,
            variacaoPesoKg: null,
          }),
        ],
      }),
    );
    render(<Relatorios />);

    const celula = await screen.findByText('Ana Souza');
    expect(within(celula.closest('tr')!).getByText(/não autorizado/i)).toBeInTheDocument();
    // E o rodapé explica o que a expressão significa, sem o profissional adivinhar.
    expect(textoDaTela()).toMatch(/não que o valor seja zero/i);
  });

  it('autorizado e sem dado ainda mostra travessão, não zero', async () => {
    /*
      Autorizou evolução mas nunca se pesou: ausência de medida é ausência, e
      "0 kg" sugeriria que ela se pesou e não mudou.

      A asserção olha DENTRO da linha, e não a tela inteira: a expressão "não
      autorizado" também aparece no rodapé, que explica o que ela significa.
      Minha primeira versão desta prova reprovou por causa do rodapé — medir a
      tela toda onde a pergunta é sobre uma célula.
    */
    carteira.mockResolvedValue(
      relatorio({
        linhas: [linha({ pesoInicialKg: null, pesoAtualKg: null, variacaoPesoKg: null })],
      }),
    );
    render(<Relatorios />);

    const celula = await screen.findByText('Ana Souza');
    const daLinha = within(celula.closest('tr')!);
    expect(daLinha.getByText('—')).toBeInTheDocument();
    expect(daLinha.queryByText(/não autorizado/i)).not.toBeInTheDocument();
  });

  it('variação positiva ganha sinal, para não se confundir com perda', async () => {
    carteira.mockResolvedValue(relatorio({ linhas: [linha({ variacaoPesoKg: 3 })] }));
    render(<Relatorios />);

    await waitFor(() => expect(textoDaTela()).toMatch(/\+3 kg/));
  });
});

describe('relatório: o que a tela afirma', () => {
  it('falha ao carregar NÃO vira "nenhum aluno ativo na carteira"', async () => {
    carteira.mockRejectedValue(new Error('Failed to fetch'));
    render(<Relatorios />);

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível carregar o relatório/i));
    expect(textoDaTela()).not.toMatch(/nenhum aluno ativo na carteira/i);
    expect(textoDaTela()).not.toMatch(/failed to fetch/i);
  });

  it('carteira vazia de verdade diz isso', async () => {
    carteira.mockResolvedValue(relatorio({ totalAlunos: 0, linhas: [] }));
    render(<Relatorios />);

    await waitFor(() => expect(textoDaTela()).toMatch(/nenhum aluno ativo na carteira/i));
  });
});

describe('relatório: quem precisa de atenção', () => {
  it('aparece ANTES da tabela, com o nome e há quanto tempo', async () => {
    /*
      A tabela tem trinta linhas parecidas e se lê de relance; o bloco de
      atenção é o que faz alguém agir hoje. Se ele descesse para o fim, seria
      lido depois da decisão que deveria mudar.
    */
    carteira.mockResolvedValue(
      relatorio({
        linhas: [
          linha({ alunoId: 'a1', nome: 'Ana Souza', diasSemTreinar: 2 }),
          linha({ alunoId: 'a2', nome: 'Bruno Lima', diasSemTreinar: DIAS_PARA_ALERTA + 6 }),
        ],
      }),
    );
    render(<Relatorios />);

    await waitFor(() => expect(textoDaTela()).toMatch(/1 aluno precisa de atenção/i));
    const texto = textoDaTela();
    expect(texto.indexOf('precisa de atenção')).toBeLessThan(texto.indexOf('Último treino'));
    expect(texto).toMatch(/há 20 d/);
  });

  it('quem nunca treinou é dito assim, e não com um número de dias', async () => {
    carteira.mockResolvedValue(
      relatorio({
        linhas: [linha({ treinosNoPeriodo: 0, ultimoTreinoEm: null, diasSemTreinar: null })],
      }),
    );
    render(<Relatorios />);

    await waitFor(() => expect(textoDaTela()).toMatch(/nunca treinou/i));
  });

  it('carteira em ordem não inventa bloco de atenção', async () => {
    render(<Relatorios />);

    await waitFor(() => expect(screen.getByText('Ana Souza')).toBeInTheDocument());
    expect(textoDaTela()).not.toMatch(/precisa de atenção|precisam de atenção/i);
  });
});

describe('relatório: a janela', () => {
  it('trocar de janela refaz a consulta com o número novo', async () => {
    render(<Relatorios />);
    await waitFor(() => expect(carteira).toHaveBeenCalledWith(30));

    fireEvent.click(screen.getByText('90 dias'));

    await waitFor(() => expect(carteira).toHaveBeenCalledWith(90));
  });

  it('resposta da janela ANTIGA não sobrescreve a da nova', async () => {
    /*
      O defeito que a guarda de cancelamento fecha: trocar 30 → 90 rápido
      deixava a resposta lenta da primeira chegar por último, e a tela mostrava
      os números de um período com o botão do outro marcado. Nada na tela
      denunciava a troca — e o relatório é o que o profissional usa para decidir
      a quem ligar.
    */
    let responderAntiga: ((v: RelatorioDaCarteira) => void) | undefined;
    carteira
      .mockImplementationOnce(
        () =>
          new Promise<RelatorioDaCarteira>((resolve) => {
            responderAntiga = resolve;
          }),
      )
      .mockImplementationOnce(() =>
        Promise.resolve(relatorio({ dias: 90, linhas: [linha({ nome: 'Bruno Lima' })] })),
      );

    render(<Relatorios />);
    await waitFor(() => expect(carteira).toHaveBeenCalledWith(30));

    fireEvent.click(screen.getByText('90 dias'));
    await waitFor(() => expect(screen.getByText('Bruno Lima')).toBeInTheDocument());

    // A de 30 dias chega agora, atrasada.
    responderAntiga?.(relatorio({ dias: 30, linhas: [linha({ nome: 'Ana Souza' })] }));
    await new Promise((r) => setTimeout(r, 20));

    expect(screen.getByText('Bruno Lima')).toBeInTheDocument();
    expect(screen.queryByText('Ana Souza')).not.toBeInTheDocument();
  });
});
