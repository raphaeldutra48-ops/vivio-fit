import { EscopoDado, type ResumoDoProfissional } from '@vivio/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Resumo from '../app/(pro)/resumo/page';

/**
 * A tela inicial do profissional — a primeira coisa que ele vê, e até agora sem
 * prova nenhuma.
 *
 * Ela existe para responder "quem precisa de mim hoje?". Todo bloco dela é uma
 * afirmação sobre pessoas: quem sumiu, quem tem alerta clínico pendente, quem
 * travou por falta de autorização, quem está na agenda. Afirmação errada aqui
 * não dá erro em lugar nenhum — ela simplesmente faz o profissional não ligar
 * para quem parou de treinar.
 *
 * Duas distinções que esta tela faz e que um teste precisa travar:
 *
 * 1. **Nunca ter treinado e ter parado de treinar pedem conversas diferentes.**
 *    Um não começou, o outro desistiu. Escrever "há 45 dias" nos dois casos faz
 *    o profissional cobrar o primeiro por um treino que ele nunca soube que
 *    existia.
 * 2. **"Ninguém sumido" é uma afirmação, não um estado vazio de tela.** Dita por
 *    falha de rede, é a pior frase possível nesta tela.
 */
const doProfissional = vi.fn();

vi.mock('../lib/sdk', () => ({ sdk: { resumo: { doProfissional: () => doProfissional() } } }));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('../lib/sessao', () => ({
  useSessao: () => ({
    usuario: { id: 'prof-1', nome: 'Diego Ramos', email: 'd@exemplo.com', papel: 'PERSONAL' },
    carregando: false,
  }),
}));

const vazio: ResumoDoProfissional = {
  alunosAtivos: 0,
  convitesPendentes: 0,
  sumidos: [],
  alertas: [],
  autorizacoesPendentes: [],
  agendaDeHoje: [],
};

const resumo = (extras: Partial<ResumoDoProfissional> = {}): ResumoDoProfissional => ({
  ...vazio,
  ...extras,
});

const textoDaTela = () => document.body.textContent ?? '';

beforeEach(() => {
  doProfissional.mockResolvedValue(resumo());
});

describe('resumo: o que a tela afirma', () => {
  it('falha ao carregar NÃO vira "ninguém sumido"', async () => {
    /*
      A afirmação mais cara da tela. "Todos registraram algo na última semana"
      dito por falta de rede faz o profissional fechar o app tranquilo — e quem
      parou de treinar é exatamente quem desaparece nesse silêncio.
    */
    doProfissional.mockRejectedValue(new Error('Failed to fetch'));
    render(<Resumo />);

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível carregar o resumo/i));
    expect(textoDaTela()).not.toMatch(/ninguém sumido/i);
    expect(textoDaTela()).not.toMatch(/nenhum compromisso hoje/i);
    expect(textoDaTela()).not.toMatch(/failed to fetch/i);
  });

  it('enquanto a resposta não vem, não afirma nada — nem zero', async () => {
    // Zero é uma afirmação: "0 sem treinar" dito antes da resposta é uma boa
    // notícia que ninguém apurou.
    doProfissional.mockReturnValue(new Promise(() => undefined));
    render(<Resumo />);

    expect(textoDaTela()).toMatch(/carregando seu resumo/i);
    expect(textoDaTela()).not.toMatch(/ninguém sumido/i);
    expect(textoDaTela()).not.toMatch(/alunos ativos/i);
  });

  it('com tudo em ordem de verdade, as frases de vazio aparecem', async () => {
    render(<Resumo />);

    await waitFor(() => expect(textoDaTela()).toMatch(/ninguém sumido/i));
    expect(textoDaTela()).toMatch(/nenhum compromisso hoje/i);
  });
});

describe('resumo: quem sumiu', () => {
  it('quem nunca registrou não é cobrado por um treino que não existiu', async () => {
    /*
      A distinção que a tela faz de propósito. Para quem nunca registrou, o que
      importa é há quanto tempo está no plano — não "há 45 dias sem treinar",
      que sugere que houve um treino antes.
    */
    doProfissional.mockResolvedValue(
      resumo({
        sumidos: [
          { alunoId: 'a1', nome: 'Ana Souza', diasSemTreinar: null, diasDeVinculo: 3 },
          { alunoId: 'a2', nome: 'Bruno Lima', diasSemTreinar: 45, diasDeVinculo: 200 },
        ],
      }),
    );
    render(<Resumo />);

    await waitFor(() => expect(screen.getByText('Ana Souza')).toBeInTheDocument());
    expect(textoDaTela()).toMatch(/nunca registrou/i);
    expect(textoDaTela()).toMatch(/no plano/i);
    expect(textoDaTela()).toMatch(/último treino/i);
    // E a frase de vazio não aparece junto de uma lista com gente dentro.
    expect(textoDaTela()).not.toMatch(/ninguém sumido/i);
  });

  it('o nome de quem sumiu leva à ficha dele, que é a ação de hoje', async () => {
    doProfissional.mockResolvedValue(
      resumo({ sumidos: [{ alunoId: 'a1', nome: 'Ana Souza', diasSemTreinar: 9, diasDeVinculo: 90 }] }),
    );
    render(<Resumo />);

    const link = await screen.findByText('Ana Souza');
    expect(link.closest('a')?.getAttribute('href')).toBe('/alunos/a1');
  });
});

describe('resumo: o que vem antes', () => {
  it('alerta clínico pendente aparece ANTES da rotina', async () => {
    /*
      A ordem não é estética: um alerta pendente muda a conduta do treino e da
      dieta que vêm abaixo. Se ele aparecesse no fim, seria lido depois da
      decisão que ele deveria mudar.
    */
    doProfissional.mockResolvedValue(
      resumo({
        alertas: [
          {
            alertaId: 'al1',
            alunoId: 'a1',
            alunoNome: 'Ana Souza',
            titulo: 'Lesão no ombro direito',
            severidade: 'ALTA',
            criadoEm: '2026-09-30T12:00:00.000Z',
          },
        ],
        sumidos: [{ alunoId: 'a2', nome: 'Bruno Lima', diasSemTreinar: 9, diasDeVinculo: 90 }],
      }),
    );
    render(<Resumo />);

    await waitFor(() => expect(textoDaTela()).toMatch(/lesão no ombro direito/i));
    const texto = textoDaTela();
    expect(texto.indexOf('Lesão no ombro direito')).toBeLessThan(texto.indexOf('Bruno Lima'));
  });

  it('autorização que falta é dita com o NOME do escopo, não com o enum', async () => {
    // "TREINO" em caixa alta não diz a ninguém o que está travado; "Treino"
    // diz — e é o que o profissional precisa pedir ao aluno.
    doProfissional.mockResolvedValue(
      resumo({
        autorizacoesPendentes: [
          { alunoId: 'a1', nome: 'Ana Souza', faltando: [EscopoDado.TREINO, EscopoDado.NUTRICAO] },
        ],
      }),
    );
    render(<Resumo />);

    await waitFor(() => expect(screen.getByText('Ana Souza')).toBeInTheDocument());
    expect(textoDaTela()).toMatch(/Treino/);
    expect(textoDaTela()).toMatch(/Nutrição/);
    expect(textoDaTela()).not.toMatch(/NUTRICAO/);
  });

  it('compromisso de hoje mostra a hora no relógio de quem lê', async () => {
    doProfissional.mockResolvedValue(
      resumo({
        agendaDeHoje: [
          {
            id: 'c1',
            alunoNome: 'Ana Souza',
            // 13h em UTC são 10h em Brasília, e é a hora local que a tela mostra.
            inicioEm: '2026-10-02T13:00:00.000Z',
            tipo: 'AVALIACAO_FISICA',
            status: 'AGENDADO',
          },
        ],
      }),
    );
    render(<Resumo />);

    await waitFor(() => expect(textoDaTela()).toMatch(/10:00/));
    expect(textoDaTela()).not.toMatch(/nenhum compromisso hoje/i);
  });
});
