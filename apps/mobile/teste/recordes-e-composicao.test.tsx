import { obterTema } from '@vivio/ui-native';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderizar } from './preparo';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * As duas telas que respondem "estou melhorando?".
 *
 * Nenhuma das duas escreve nada, e as duas afirmam coisas sobre o corpo de quem
 * lê — o que faz do erro delas um tipo particular: não quebra, mente. Um número
 * que aparece quando não devia, uma data deslocada em um dia, um "sem medições"
 * dito a quem tem dez, e a pessoa toma decisão sobre treino e comida em cima
 * disso.
 *
 * Por isso as provas são sobre A VERDADE DO QUE ESTÁ ESCRITO: vazio é vazio e
 * falha é falha; a data da conquista é o dia em que ela aconteceu; o selo de
 * novidade tem prazo; e o número que ninguém levantou vem com a explicação de
 * que é estimativa.
 */
const meusRecordes = vi.fn();
const evolucaoCorporal = vi.fn();

vi.mock('../src/sdk', () => ({
  sdk: {
    recordes: { meus: (...a: unknown[]) => meusRecordes(...a) },
    medidas: { evolucao: (...a: unknown[]) => evolucaoCorporal(...a) },
  },
}));

const navegador = { push: vi.fn(), replace: vi.fn(), back: vi.fn() };
vi.mock('expo-router', () => ({
  useRouter: () => navegador,
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children?: unknown }) => children,
}));

const usuario = { id: 'aluna-1', nome: 'Ana Souza', email: 'ana@exemplo.com', papel: 'ALUNO' };
const sessao = { tema: obterTema('claro'), nomeDoTema: 'claro', usuario, carregando: false };
vi.mock('../src/sessao', () => ({ useSessao: () => sessao }));

const marca = (extras: Record<string, unknown> = {}) => ({
  exercicioId: 'ex-1',
  exercicioNome: 'Supino reto',
  cargaMaximaKg: 82.5,
  cargaMaximaEm: '2026-09-20',
  melhor1rmKg: 95.3,
  volumeMaximoSerieKg: 660,
  diasTreinados: 14,
  ultimaEm: '2026-09-27',
  ...extras,
});

const serie = (extras: Record<string, unknown> = {}) => ({
  metrica: 'PESO',
  rotulo: 'Peso',
  unidade: 'kg',
  pontos: [
    { data: '2026-09-01', valor: 80 },
    { data: '2026-09-20', valor: 77.5 },
  ],
  primeiro: 80,
  ultimo: 77.5,
  variacao: -2.5,
  variacaoPercentual: -3.1,
  evoluiuBem: true,
  ...extras,
});

const textoDaTela = () => document.body.textContent ?? '';

async function abrirRecordes() {
  const { default: Recordes } = await import('../app/recordes');
  return renderizar(<Recordes />);
}

async function abrirComposicao() {
  const { default: Composicao } = await import('../app/composicao');
  return renderizar(<Composicao />);
}

beforeEach(() => {
  /*
    O selo "NOVO" tem prazo de 30 dias contados de hoje, então a prova precisa
    de um hoje FIXO — senão ela envelhece junto com a data da fixture e passa a
    falhar sozinha algum tempo depois de escrita. Só a `Date` é falsa; os
    temporizadores seguem reais, senão o `waitFor` não avança.
  */
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-29T12:00:00') });
  meusRecordes.mockResolvedValue({ total: 1, marcas: [marca()] });
  evolucaoCorporal.mockResolvedValue({
    de: '2026-09-01',
    ate: '2026-09-20',
    totalMedicoes: 2,
    series: [serie()],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('meus recordes', () => {
  it('a marca mostra a carga e o DIA em que ela aconteceu', async () => {
    /*
      A data por extenso é construída campo a campo justamente para não
      deslocar: `new Date('2026-09-20')` puro cai em 19/09 às 21h no fuso do
      Brasil, e a conquista apareceria um dia antes de ter acontecido.
    */
    await abrirRecordes();

    await waitFor(() => expect(screen.getByText('Supino reto')).toBeInTheDocument());
    expect(textoDaTela()).toContain('82,5 kg');
    expect(textoDaTela()).toContain('20 de setembro de 2026');
  });

  it('o selo NOVO vale nos 30 dias, e some depois', async () => {
    // Chamar de novidade uma marca de seis meses diminui a próxima.
    await abrirRecordes();
    await waitFor(() => expect(screen.getByText('NOVO')).toBeInTheDocument());

    meusRecordes.mockResolvedValue({
      total: 1,
      marcas: [marca({ cargaMaximaEm: '2026-01-10' })],
    });
    const { default: Recordes } = await import('../app/recordes');
    const outra = await renderizar(<Recordes />);

    await waitFor(() => expect(outra.container.textContent).toContain('Supino reto'));
    expect(outra.container.textContent).not.toContain('NOVO');
  });

  it('o 1RM vem com a ressalva de que ninguém levantou aquilo', async () => {
    /*
      É um número calculado. Sem a ressalva, alguém tenta levantá-lo — e o
      cálculo de Epley não é promessa de que o corpo aguenta.
    */
    await abrirRecordes();

    await waitFor(() => expect(textoDaTela()).toContain('95,3 kg'));
    expect(textoDaTela()).toMatch(/não é um peso que você precisou levantar/i);
  });

  it('falha ao carregar NÃO se disfarça de "ainda não tem recordes"', async () => {
    /*
      As duas telas se leem igual e significam o oposto: uma diz "treine", a
      outra diz "tente de novo". Confundi-las faz quem tem marcas achar que as
      perdeu.
    */
    meusRecordes.mockRejectedValue(new Error('rede'));
    await abrirRecordes();

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível carregar/i));
    expect(textoDaTela()).not.toMatch(/seus recordes aparecem aqui/i);
    // E diz de onde as marcas vêm, para ninguém achar que precisa refazê-las.
    expect(textoDaTela()).toMatch(/nenhuma se perdeu/i);
  });

  it('a falha tem saída: um toque tenta de novo', async () => {
    meusRecordes.mockRejectedValue(new Error('rede'));
    await abrirRecordes();
    await waitFor(() => expect(screen.getByText('Tentar de novo')).toBeInTheDocument());

    meusRecordes.mockResolvedValue({ total: 0, marcas: [] });
    fireEvent.click(screen.getByText('Tentar de novo'));

    await waitFor(() => expect(textoDaTela()).not.toMatch(/não foi possível carregar/i));
  });

  it('o vazio de verdade explica o que falta fazer', async () => {
    meusRecordes.mockResolvedValue({ total: 0, marcas: [] });
    await abrirRecordes();

    await waitFor(() => expect(screen.getByText('Seus recordes aparecem aqui')).toBeInTheDocument());
    expect(textoDaTela()).toMatch(/assim que você registrar um treino/i);
  });
});

describe('composição corporal', () => {
  it('mostra o valor atual e a variação do período, com sinal', async () => {
    await abrirComposicao();

    // Vírgula, como se escreve aqui: era a única tela do app com ponto decimal.
    await waitFor(() => expect(textoDaTela()).toContain('77,5'));
    // Perder 2,5 kg é variação negativa — e o sinal é o que dá direção ao número.
    expect(textoDaTela()).toContain('-2,5 kg');
    expect(textoDaTela()).toContain('(-3,1%)');
  });

  it('com uma medição só, diz que falta a segunda em vez de inventar variação', async () => {
    /*
      Variação exige dois pontos. Mostrar "0" seria afirmar que o corpo não
      mudou, quando o que aconteceu é que ninguém mediu de novo.
    */
    evolucaoCorporal.mockResolvedValue({
      de: '2026-09-20',
      ate: '2026-09-20',
      totalMedicoes: 1,
      series: [
        serie({
          pontos: [{ data: '2026-09-20', valor: 80 }],
          primeiro: 80,
          ultimo: 80,
          variacao: null,
          variacaoPercentual: null,
          evoluiuBem: null,
        }),
      ],
    });
    await abrirComposicao();

    await waitFor(() => expect(textoDaTela()).toMatch(/precisa de 2 medições/i));
  });

  it('sem medição nenhuma, convida a medir — e o botão leva ao lugar certo', async () => {
    evolucaoCorporal.mockResolvedValue({
      de: '2026-09-29',
      ate: '2026-09-29',
      totalMedicoes: 0,
      series: [],
    });
    await abrirComposicao();
    await waitFor(() => expect(screen.getByText('Sem medições ainda')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/registrar medidas/i));

    expect(navegador.push).toHaveBeenCalledWith('/medidas');
  });

  it('falha NÃO se disfarça de "sem medições ainda"', async () => {
    evolucaoCorporal.mockRejectedValue(new Error('rede'));
    await abrirComposicao();

    await waitFor(() => expect(textoDaTela()).toMatch(/não deu para buscar sua evolução/i));
    expect(textoDaTela()).not.toMatch(/sem medições ainda/i);
    expect(textoDaTela()).toMatch(/continuam salvas/i);
    // E tem saída: a tela virava uma linha de texto e só.
    expect(screen.getByText('Tentar de novo')).toBeInTheDocument();
  });

  it('as circunferências ficam em bloco próprio, e não entre os destaques', async () => {
    // Peso e gordura respondem "estou melhorando?"; cintura e braço são
    // detalhe de quem já respondeu — misturar os dois esconde o que importa.
    evolucaoCorporal.mockResolvedValue({
      de: '2026-09-01',
      ate: '2026-09-20',
      totalMedicoes: 2,
      series: [
        serie(),
        serie({ metrica: 'CINTURA', rotulo: 'Cintura', unidade: 'cm', ultimo: 84, variacao: -1 }),
      ],
    });
    await abrirComposicao();

    await waitFor(() => expect(screen.getByText('Circunferências')).toBeInTheDocument());
    const bloco = screen.getByText('Circunferências').parentElement;
    expect(bloco?.textContent).toContain('Cintura');
    expect(bloco?.textContent).not.toContain('Peso');
  });

  it('o período mostra os dias medidos, sem deslocar a data', async () => {
    // Datas `AAAA-MM-DD` ancoradas ao meio-dia: sem isso, o fuso do Brasil
    // mostraria cada ponta um dia antes.
    await abrirComposicao();

    await waitFor(() => expect(textoDaTela()).toContain('2 medições'));
    expect(textoDaTela()).toContain('01/09/2026');
    expect(textoDaTela()).toContain('20/09/2026');
  });
});
