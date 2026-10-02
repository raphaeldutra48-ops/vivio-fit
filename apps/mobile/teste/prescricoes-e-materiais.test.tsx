import { obterTema } from '@vivio/ui-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * As duas telas de "o que a equipe me passou": prescrições e materiais.
 *
 * A de prescrições tinha o defeito mais perigoso do aplicativo, e não por ser
 * complicada — por ser simples. Um `catch(() => undefined)` engolia a falha de
 * rede, a lista ficava vazia e a tela dizia "Nenhuma prescrição — quando seu
 * nutricionista ou médico prescrever algo, aparece aqui". Dito a quem está sem
 * sinal, isso afirma que NÃO EXISTE receita. A decisão tomada em cima dessa
 * frase é parar de tomar o que foi prescrito, ou cobrar do profissional algo
 * que ele já passou.
 *
 * O resto das provas é sobre separar o que vale HOJE do que existe só para
 * consulta — prescrição substituída na mão de quem não percebeu a diferença é
 * dose errada — e sobre o material novo continuar marcado como novo até ser
 * aberto de verdade.
 */
const listarPrescricoes = vi.fn();
const meusMateriais = vi.fn();
const abrirMaterial = vi.fn();
const abrirUrl = vi.fn();

vi.mock('../src/sdk', () => ({
  sdk: {
    prescricoes: { listar: (...a: unknown[]) => listarPrescricoes(...a) },
    materiais: {
      meus: (...a: unknown[]) => meusMateriais(...a),
      abrir: (...a: unknown[]) => abrirMaterial(...a),
    },
  },
}));

/*
  `Linking` é do sistema: abrir um PDF sai do app. O dublê mantém o `react-native`
  do `preparo` (com o `Alert` e o `AppState` dele) e só troca essa peça.
*/
vi.mock('react-native', async () => {
  const real = await import('./preparo').then(() => import('react-native-web'));
  const { alertas } = await import('./preparo');
  return {
    ...real,
    default: (real as { default?: unknown }).default,
    Alert: {
      alert: (titulo: string, mensagem?: string, botoes: unknown[] = []) => {
        alertas.push({ titulo, mensagem, botoes: botoes as never });
      },
    },
    Linking: { openURL: (...a: unknown[]) => abrirUrl(...a) },
  };
});

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children?: unknown }) => children,
}));

const usuario = { id: 'aluna-1', nome: 'Ana Souza', email: 'ana@exemplo.com', papel: 'ALUNO' };
const sessao = { tema: obterTema('claro'), nomeDoTema: 'claro', usuario, carregando: false };
vi.mock('../src/sessao', () => ({ useSessao: () => sessao }));

const prescricao = (id: string, extras: Record<string, unknown> = {}) => ({
  id,
  status: 'ATIVA',
  data: '2026-09-10',
  validaAte: '2026-12-10',
  orientacoes: null,
  prescritor: { id: 'prof-1', nome: 'Dra. Helena', papel: 'MEDICO' },
  itens: [
    {
      id: `${id}-i1`,
      nome: 'Vitamina D 2000UI',
      dose: '1',
      unidade: 'cápsula',
      frequencia: '1x ao dia',
      horarios: ['08:00'],
      duracaoDias: 90,
      via: 'ORAL',
      observacao: 'com a refeição',
    },
  ],
  ...extras,
});

const material = (id: string, extras: Record<string, unknown> = {}) => ({
  id,
  titulo: 'Guia de alongamento',
  descricao: 'Para fazer nos dias de descanso',
  tipo: 'ARQUIVO',
  url: null,
  mimeType: 'application/pdf',
  tamanhoBytes: 1_048_576,
  vistoEm: null,
  autor: { id: 'prof-1', nome: 'Diego Personal', papel: 'PERSONAL' },
  ...extras,
});

const textoDaTela = () => document.body.textContent ?? '';

async function abrirPrescricoes() {
  const { default: Prescricoes } = await import('../app/prescricoes');
  return render(<Prescricoes />);
}

async function abrirMateriais() {
  const { default: Materiais } = await import('../app/materiais');
  return render(<Materiais />);
}

beforeEach(() => {
  listarPrescricoes.mockResolvedValue([prescricao('p1')]);
  meusMateriais.mockResolvedValue([material('m1')]);
  abrirMaterial.mockResolvedValue({ url: 'https://exemplo/assinada.pdf' });
  abrirUrl.mockResolvedValue(undefined);
});

describe('prescrições', () => {
  it('falha ao carregar NÃO vira "nenhuma prescrição"', async () => {
    /*
      O defeito que esta prova fixa, e o de maior consequência do app: a frase
      afirma que não existe receita. Quem lê isso sem sinal para de tomar o que
      foi prescrito.
    */
    listarPrescricoes.mockRejectedValue(new Error('rede'));
    await abrirPrescricoes();

    await waitFor(() => expect(textoDaTela()).toMatch(/não deu para buscar suas prescrições/i));
    expect(textoDaTela()).not.toMatch(/nenhuma prescrição/i);
    // E diz o que NÃO fazer enquanto isso.
    expect(textoDaTela()).toMatch(/não mude nada por conta própria/i);
  });

  it('"tentar de novo" busca outra vez, e a receita aparece', async () => {
    listarPrescricoes.mockRejectedValueOnce(new Error('rede'));
    await abrirPrescricoes();
    await waitFor(() => expect(textoDaTela()).toMatch(/não deu para buscar suas prescrições/i));

    fireEvent.click(screen.getByText(/tentar de novo/i));

    await waitFor(() => expect(screen.getByText('Vitamina D 2000UI')).toBeInTheDocument());
  });

  it('o vazio de verdade diz de onde vem a primeira prescrição', async () => {
    listarPrescricoes.mockResolvedValue([]);
    await abrirPrescricoes();

    await waitFor(() => expect(screen.getByText('Nenhuma prescrição')).toBeInTheDocument());
  });

  it('mostra dose, quem prescreveu e até quando vale', async () => {
    // Os três dados que alguém confere antes de tomar algo.
    await abrirPrescricoes();

    await waitFor(() => expect(screen.getByText('Vitamina D 2000UI')).toBeInTheDocument());
    expect(textoDaTela()).toContain('Dra. Helena');
    expect(textoDaTela()).toMatch(/válida até 10\/12\/2026/);
    expect(textoDaTela()).toContain('com a refeição');
  });

  it('o que não vale mais fica no HISTÓRICO, separado do que vale hoje', async () => {
    /*
      Prescrição substituída lida como atual é dose errada. Apagá-la também não
      serve: é ela que explica o que mudou e por quê.
    */
    listarPrescricoes.mockResolvedValue([
      prescricao('p1'),
      prescricao('p2', {
        status: 'SUBSTITUIDA',
        itens: [
          {
            id: 'p2-i1',
            nome: 'Vitamina D 1000UI',
            dose: '1',
            unidade: 'cápsula',
            frequencia: '1x ao dia',
            horarios: [],
            duracaoDias: null,
            via: null,
            observacao: null,
          },
        ],
      }),
    ]);
    await abrirPrescricoes();

    await waitFor(() => expect(screen.getByText('HISTÓRICO')).toBeInTheDocument());
    const tela = textoDaTela();
    expect(tela.indexOf('Vitamina D 2000UI')).toBeLessThan(tela.indexOf('HISTÓRICO'));
    expect(tela.indexOf('HISTÓRICO')).toBeLessThan(tela.indexOf('Vitamina D 1000UI'));
  });

  it('a suspensa continua à vista, com o status dito', async () => {
    // Suspensa não é histórico: é uma instrução ativa de NÃO tomar, e precisa
    // ser lida junto das outras.
    listarPrescricoes.mockResolvedValue([prescricao('p1', { status: 'SUSPENSA' })]);
    await abrirPrescricoes();

    await waitFor(() => expect(screen.getByText('Vitamina D 2000UI')).toBeInTheDocument());
    expect(screen.queryByText('HISTÓRICO')).not.toBeInTheDocument();
  });

  it('avisa para falar com quem prescreveu antes de mudar algo', async () => {
    await abrirPrescricoes();

    await waitFor(() => expect(textoDaTela()).toMatch(/fale com quem prescreveu/i));
  });
});

describe('materiais', () => {
  it('falha ao carregar NÃO vira "nada por aqui ainda"', async () => {
    meusMateriais.mockRejectedValue(new Error('rede'));
    await abrirMateriais();

    await waitFor(() => expect(textoDaTela()).toMatch(/não deu para buscar seus materiais/i));
    expect(textoDaTela()).not.toMatch(/nada por aqui ainda/i);
    expect(textoDaTela()).toMatch(/continua lá/i);
  });

  it('a falha tem saída: um toque relê os materiais', async () => {
    meusMateriais.mockRejectedValue(new Error('rede'));
    await abrirMateriais();
    await waitFor(() => expect(screen.getByText('Tentar de novo')).toBeInTheDocument());

    meusMateriais.mockResolvedValue([]);
    fireEvent.click(screen.getByText('Tentar de novo'));

    await waitFor(() => expect(textoDaTela()).toMatch(/nada por aqui ainda/i));
  });

  it('material não aberto vem marcado como NOVO', async () => {
    // É o que faz alguém voltar para ler o que a equipe mandou.
    await abrirMateriais();

    await waitFor(() => expect(screen.getByText('NOVO')).toBeInTheDocument());
    expect(textoDaTela()).toContain('Diego Personal');
    expect(textoDaTela()).toContain('1,0 MB');
  });

  it('material já aberto não fica marcado como novo para sempre', async () => {
    meusMateriais.mockResolvedValue([material('m1', { vistoEm: '2026-09-28T10:00:00Z' })]);
    await abrirMateriais();

    await waitFor(() => expect(screen.getByText('Guia de alongamento')).toBeInTheDocument());
    expect(screen.queryByText('NOVO')).not.toBeInTheDocument();
  });

  it('abrir arquivo pede o link assinado na hora — e recarrega a lista', async () => {
    /*
      O link é assinado e expira; guardá-lo na lista deixaria um endereço morto.
      A recarga depois de abrir é o que apaga o selo "NOVO".
    */
    await abrirMateriais();
    await waitFor(() => expect(screen.getByLabelText(/abrir guia de alongamento/i)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/abrir guia de alongamento/i));

    await waitFor(() => expect(abrirMaterial).toHaveBeenCalledWith('m1'));
    expect(abrirUrl).toHaveBeenCalledWith('https://exemplo/assinada.pdf');
    await waitFor(() => expect(meusMateriais).toHaveBeenCalledTimes(2));
  });

  it('link não passa pelo servidor: abre o endereço que o profissional mandou', async () => {
    meusMateriais.mockResolvedValue([
      material('m2', { tipo: 'LINK', url: 'https://exemplo/video', mimeType: null }),
    ]);
    await abrirMateriais();
    await waitFor(() => expect(screen.getByLabelText(/abrir guia de alongamento/i)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/abrir guia de alongamento/i));

    await waitFor(() => expect(abrirUrl).toHaveBeenCalledWith('https://exemplo/video'));
    expect(abrirMaterial).not.toHaveBeenCalled();
  });

  it('se não der para abrir, a tela diz — em vez de parecer que o toque não fez nada', async () => {
    abrirMaterial.mockRejectedValue(new Error('rede'));
    await abrirMateriais();
    await waitFor(() => expect(screen.getByLabelText(/abrir guia de alongamento/i)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/abrir guia de alongamento/i));

    await waitFor(() =>
      expect(screen.getByText('Não foi possível abrir este material.')).toBeInTheDocument(),
    );
  });
});
