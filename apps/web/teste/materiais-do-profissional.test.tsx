import { formatarTamanho, type MaterialResumo } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Materiais from '../app/(pro)/materiais/page';

/**
 * Os materiais de apoio — e-books, planilhas e vídeos que o profissional
 * compartilha com quem ele escolher. Auditada à mão em 02/10, sem prova até
 * agora.
 *
 * O que ela tem de próprio é o **compartilhamento nominal**: nada aqui é
 * público, e cada material vai para alunos escolhidos um a um. Duas coisas
 * dependem disso e falham caladas:
 *
 * 1. **O seletor de alunos vem da carteira ativa**, e quando ele falha a tela
 *    tem de dizer — "Nenhum aluno ativo" para quem tem trinta faz o profissional
 *    achar que perdeu a carteira. Esse já estava corrigido; a prova o fixa.
 * 2. **Descompartilhar é o mesmo botão de compartilhar.** Clicar duas vezes no
 *    mesmo aluno tira o acesso dele, e a tela precisa mostrar em qual estado
 *    cada um está — senão o profissional tira sem querer.
 *
 * E a remoção diz o que se perde: quem já recebeu perde o acesso. É diferente de
 * "o arquivo sai da sua lista".
 */
const listar = vi.fn();
const criar = vi.fn();
const remover = vi.fn();
const compartilhar = vi.fn();
const descompartilhar = vi.fn();
const abrirMaterial = vi.fn();
const enviarMidia = vi.fn();
const meusAlunos = vi.fn();

vi.mock('../lib/sdk', () => ({
  sdk: {
    materiais: {
      listar: (...a: unknown[]) => listar(...a),
      criar: (...a: unknown[]) => criar(...a),
      remover: (...a: unknown[]) => remover(...a),
      compartilhar: (...a: unknown[]) => compartilhar(...a),
      descompartilhar: (...a: unknown[]) => descompartilhar(...a),
      abrir: (...a: unknown[]) => abrirMaterial(...a),
    },
    midia: { enviar: (...a: unknown[]) => enviarMidia(...a) },
    vinculos: { meusAlunos: (...a: unknown[]) => meusAlunos(...a) },
  },
}));

const aluna = {
  id: 'vinculo-1',
  status: 'ATIVO',
  aguardandoMinhaResposta: false,
  tipo: 'PERSONAL',
  contraparte: { id: 'aluna-1', nome: 'Ana Souza', papel: 'ALUNO', avatarUrl: null },
};

const material = (extras: Partial<MaterialResumo> = {}): MaterialResumo =>
  ({
    id: 'mat-1',
    titulo: 'Guia de hipertrofia',
    descricao: null,
    tipo: 'ARQUIVO',
    nomeArquivo: 'guia.pdf',
    mimeType: 'application/pdf',
    tamanhoBytes: 2 * 1024 * 1024,
    url: null,
    etiquetas: ['hipertrofia'],
    criadoEm: '2026-09-30T12:00:00.000Z',
    compartilhadoCom: [],
    ...extras,
  }) as MaterialResumo;

const textoDaTela = () => document.body.textContent ?? '';

/**
 * Abre o painel de quem recebe.
 *
 * A lista de alunos NÃO está no cartão: ela aparece atrás de "Escolher quem
 * recebe", um por material. É uma escolha da tela — trinta nomes em cada cartão
 * tornariam a lista de materiais ilegível —, e minha primeira versão desta prova
 * procurava os botões direto, sem abrir.
 */
async function escolherQuemRecebe(): Promise<void> {
  fireEvent.click(await screen.findByText('Escolher quem recebe'));
}

const espiarConfirm = () => vi.spyOn(window, 'confirm');
let confirmar: ReturnType<typeof espiarConfirm>;

beforeEach(() => {
  listar.mockResolvedValue([]);
  criar.mockResolvedValue(undefined);
  remover.mockResolvedValue(undefined);
  compartilhar.mockResolvedValue(undefined);
  descompartilhar.mockResolvedValue(undefined);
  abrirMaterial.mockResolvedValue({ url: 'https://exemplo/assinada' });
  enviarMidia.mockResolvedValue('materiais/prof-1/guia.pdf');
  meusAlunos.mockResolvedValue([aluna]);
  confirmar = espiarConfirm().mockReturnValue(true);
});

afterEach(() => {
  confirmar.mockRestore();
});

describe('materiais: o que a tela afirma', () => {
  it('falha ao listar NÃO vira "nenhum material ainda"', async () => {
    listar.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'fetch failed', 0));
    render(<Materiais />);

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível carregar os materiais/i));
    expect(textoDaTela()).not.toMatch(/nenhum material ainda/i);
    expect(textoDaTela()).not.toMatch(/fetch failed/i);
  });

  it('sem material de verdade, explica o que fazer', async () => {
    render(<Materiais />);

    await waitFor(() => expect(textoDaTela()).toMatch(/nenhum material ainda/i));
  });

  it('carteira que falhou NÃO vira "nenhum aluno ativo"', async () => {
    /*
      O seletor decide para QUEM o material vai. "Nenhum aluno ativo" dito a quem
      tem trinta alunos faz o profissional achar que perdeu a carteira — e o
      material fica sem ser compartilhado.
    */
    listar.mockResolvedValue([material()]);
    meusAlunos.mockRejectedValue(new Error('rede'));
    render(<Materiais />);
    await escolherQuemRecebe();

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível carregar seus alunos/i));
    expect(textoDaTela()).not.toMatch(/nenhum aluno ativo/i);
  });

  it('o tamanho do arquivo sai legível, com vírgula', async () => {
    // "2.0 MB" é formato americano; o app escreve em português em todo lugar.
    listar.mockResolvedValue([material()]);
    render(<Materiais />);

    await waitFor(() => expect(textoDaTela()).toContain(formatarTamanho(2 * 1024 * 1024)));
    expect(textoDaTela()).toMatch(/2 MB|2,0 MB/);
  });
});

describe('materiais: compartilhar é nominal', () => {
  it('o mesmo botão compartilha e descompartilha, e a tela mostra o estado', async () => {
    /*
      Clicar duas vezes no mesmo aluno TIRA o acesso dele. Sem o estado visível,
      o profissional não sabe em qual direção o próximo clique vai — e tirar sem
      querer é silencioso: o material só desaparece do app do aluno.
    */
    listar.mockResolvedValue([material()]);
    render(<Materiais />);
    await escolherQuemRecebe();

    // Antes de abrir, o cartão já diz o estado em uma linha.
    expect(textoDaTela()).toMatch(/ainda não compartilhado/i);
    fireEvent.click(screen.getByRole('button', { name: /ana souza/i }));

    await waitFor(() => expect(compartilhar).toHaveBeenCalledWith('mat-1', { alunoIds: ['aluna-1'] }));
  });

  it('quem já recebeu aparece marcado, e o clique RETIRA', async () => {
    listar.mockResolvedValue([
      material({ compartilhadoCom: [{ alunoId: 'aluna-1', nome: 'Ana Souza', vistoEm: null }] }),
    ]);
    render(<Materiais />);
    await escolherQuemRecebe();

    const botao = screen.getByRole('button', { name: /ana souza/i });
    // O visto é o sinal de que ela já tem: sem ele, o clique seguinte é às cegas.
    expect(botao.textContent).toMatch(/✓/);
    expect(botao).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(botao);

    await waitFor(() => expect(descompartilhar).toHaveBeenCalledWith('mat-1', 'aluna-1'));
    expect(compartilhar).not.toHaveBeenCalled();
  });

  it('quem já abriu o material é distinguido de quem só recebeu', async () => {
    // A diferença decide a conversa: "mandei e você viu?" não é a mesma pergunta
    // que "mandei, dá uma olhada".
    listar.mockResolvedValue([
      material({
        compartilhadoCom: [
          { alunoId: 'aluna-1', nome: 'Ana Souza', vistoEm: '2026-10-01T12:00:00.000Z' },
        ],
      }),
    ]);
    render(<Materiais />);
    await escolherQuemRecebe();

    expect(textoDaTela()).toMatch(/· viu/i);
    // E o cartão resume sem abrir: quantos receberam e quantos já abriram.
    expect(textoDaTela()).toMatch(/1 já abriram/i);
  });

  it('se o compartilhamento falhar, a tela diz — em vez de parecer que foi', async () => {
    compartilhar.mockRejectedValue(
      new ErroApi('ACESSO_NEGADO', 'Este aluno não é mais seu.', 403),
    );
    listar.mockResolvedValue([material()]);
    render(<Materiais />);
    await escolherQuemRecebe();

    fireEvent.click(screen.getByRole('button', { name: /ana souza/i }));

    await waitFor(() => expect(textoDaTela()).toMatch(/este aluno não é mais seu/i));
  });
});

describe('materiais: remover', () => {
  it('PERGUNTA antes e diz que quem já recebeu PERDE o acesso', async () => {
    /*
      "Remover da sua lista" e "quem já recebeu perde o acesso" são consequências
      diferentes. A segunda é a verdade, e é a que faz alguém pensar duas vezes
      antes de apagar o e-book que metade da carteira está usando.
    */
    confirmar.mockReturnValue(false);
    listar.mockResolvedValue([material()]);
    render(<Materiais />);
    await waitFor(() => expect(screen.getByText('Remover')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Remover'));

    const pergunta = String(confirmar.mock.calls[0]![0]);
    expect(pergunta).toMatch(/guia de hipertrofia/i);
    expect(pergunta).toMatch(/perde o acesso/i);
    expect(remover).not.toHaveBeenCalled();
  });

  it('se a remoção falhar, o aviso aparece DEPOIS da recarga', async () => {
    remover.mockRejectedValue(new ErroApi('CONFLITO', 'Em uso.', 409));
    listar.mockResolvedValue([material()]);
    render(<Materiais />);
    await waitFor(() => expect(screen.getByText('Remover')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Remover'));

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível remover/i));
  });
});

describe('materiais: abrir', () => {
  it('arquivo abre por link ASSINADO, nunca por URL pública', async () => {
    /*
      O material é privado: só quem recebeu pode abrir. Um link público
      sobreviveria ao descompartilhamento e circularia por fora.
    */
    const abrirJanela = vi.spyOn(window, 'open').mockImplementation(() => null);
    listar.mockResolvedValue([material()]);
    render(<Materiais />);

    fireEvent.click(await screen.findByText('Abrir'));

    await waitFor(() => expect(abrirMaterial).toHaveBeenCalledWith('mat-1'));
    expect(abrirJanela).toHaveBeenCalledWith(
      'https://exemplo/assinada',
      '_blank',
      'noopener,noreferrer',
    );
    abrirJanela.mockRestore();
  });

  it('link não pede assinatura — ele já é externo', async () => {
    const abrirJanela = vi.spyOn(window, 'open').mockImplementation(() => null);
    listar.mockResolvedValue([
      material({ tipo: 'LINK', url: 'https://youtu.be/abc', nomeArquivo: null, tamanhoBytes: null }),
    ]);
    render(<Materiais />);

    fireEvent.click(await screen.findByText('Abrir'));

    expect(abrirMaterial).not.toHaveBeenCalled();
    expect(abrirJanela).toHaveBeenCalledWith('https://youtu.be/abc', '_blank', 'noopener,noreferrer');
    abrirJanela.mockRestore();
  });
});
