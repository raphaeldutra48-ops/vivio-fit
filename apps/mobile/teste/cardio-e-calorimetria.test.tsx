import { obterTema } from '@vivio/ui-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cardio e calorimetria — as duas telas onde um número digitado some em
 * silêncio.
 *
 * As duas tinham a mesma armadilha: `Number(texto)` cru. "1,5" ou "1.850"
 * viravam `NaN`, o `if (!valor)` devolvia sem fazer nada e **o toque em salvar
 * não produzia efeito nenhum** — sem mensagem, com o campo preenchido na frente
 * da pessoa. Pior no caso da calorimetria, onde o número vem de um laudo de
 * exame e é digitado uma vez só.
 *
 * As duas também transformavam falha de rede em "você não tem nada registrado".
 * Na calorimetria isso vinha acompanhado de uma afirmação ainda mais forte: que
 * o app está ESTIMANDO o metabolismo por não haver laudo.
 */
const listarCardio = vi.fn();
const caloriasDoCardio = vi.fn();
const registrarCardio = vi.fn();
const listarCalorimetrias = vi.fn();
const registrarCalorimetria = vi.fn();

vi.mock('../src/sdk', () => ({
  sdk: {
    cardio: {
      listar: (...a: unknown[]) => listarCardio(...a),
      calorias: (...a: unknown[]) => caloriasDoCardio(...a),
      registrar: (...a: unknown[]) => registrarCardio(...a),
    },
    calorimetrias: {
      listar: (...a: unknown[]) => listarCalorimetrias(...a),
      registrar: (...a: unknown[]) => registrarCalorimetria(...a),
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

const resumoDeCalorias = {
  dias: 30,
  pesoUsadoKg: 78,
  musculacao: { sessoes: 8, minutos: 480, kcal: 2400 },
  cardio: { sessoes: 4, minutos: 160, kcal: 1200 },
  totalKcal: 3600,
  /*
    O `GastoDiario` inteiro. Faltando um campo, a tela não perde o cartão: ela
    QUEBRA — e antes da barreira de erro isso deixava a tela branca. A fixture
    completa é o que prova a tela, não uma versão conveniente dela.
  */
  gastoDiario: {
    tmb: 1480,
    formula: 'MIFFLIN_ST_JEOR',
    cotidiano: 1776,
    exercicioPorDia: 120,
    totalPorDia: 1896,
    faltando: [],
    calorimetriaExpirada: null,
  },
};

const atividade = (id: string, extras: Record<string, unknown> = {}) => ({
  id,
  tipo: 'CAMINHADA',
  intensidade: 'MODERADA',
  duracaoMin: 40,
  distanciaKm: 4.2,
  caloriasEstimadas: 180,
  data: '2026-09-28',
  observacao: null,
  execucaoId: null,
  ...extras,
});

const exame = (id: string, extras: Record<string, unknown> = {}) => ({
  id,
  data: '2026-06-15',
  tmbMedidaKcal: 1620,
  pesoNoExameKg: 80,
  equipamento: 'Q-NRG',
  observacao: null,
  registradoPor: { id: 'prof-1', nome: 'Dra. Helena' },
  validade: { valida: true, motivo: null, mesesDesde: 3 },
  criadoEm: '2026-06-15T12:00:00.000Z',
  ...extras,
});

const textoDaTela = () => document.body.textContent ?? '';

async function abrirCardio() {
  const { default: Cardio } = await import('../app/cardio');
  return render(<Cardio />);
}

async function abrirCalorimetria() {
  const { default: Calorimetria } = await import('../app/calorimetria');
  return render(<Calorimetria />);
}

beforeEach(() => {
  listarCardio.mockResolvedValue([atividade('a1')]);
  caloriasDoCardio.mockResolvedValue(resumoDeCalorias);
  registrarCardio.mockResolvedValue(undefined);
  listarCalorimetrias.mockResolvedValue([exame('e1')]);
  registrarCalorimetria.mockResolvedValue(undefined);
});

describe('cardio', () => {
  it('registra a atividade com duração escrita com VÍRGULA', async () => {
    /*
      O defeito que esta prova fixa: com `Number('1,5')` a duração virava NaN, o
      salvar devolvia em silêncio e nada acontecia. "1,5" não é exótico — é o que
      alguém escreve depois de uma hora e meia de bicicleta.
    */
    await abrirCardio();
    await waitFor(() =>
      expect(screen.getByLabelText(/registrar atividade de cardio/i)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByLabelText(/registrar atividade de cardio/i));

    fireEvent.change(screen.getByLabelText(/duração em minutos/i), { target: { value: '42,5' } });
    fireEvent.click(screen.getByLabelText(/salvar atividade/i));

    /*
      42,5 chega como 43: o registro guarda minuto inteiro, e arredondar é melhor
      que recusar — meio minuto não é uma decisão de treino. Antes, "42,5" nem
      saía da tela: o botão ficava desabilitado.
    */
    await waitFor(() =>
      expect(registrarCardio).toHaveBeenCalledWith(
        'aluna-1',
        expect.objectContaining({ duracaoMin: 43, tipo: 'CAMINHADA' }) as unknown,
      ),
    );
  });

  it('duração ilegível é RECUSADA COM FRASE, e não em silêncio', async () => {
    /*
      O silêncio é o pior resultado possível: a pessoa toca, nada muda, e ela
      não tem como saber se o app travou, se salvou, ou se o problema é o que
      ela escreveu.
    */
    await abrirCardio();
    await waitFor(() =>
      expect(screen.getByLabelText(/registrar atividade de cardio/i)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByLabelText(/registrar atividade de cardio/i));

    fireEvent.change(screen.getByLabelText(/duração em minutos/i), { target: { value: '900' } });
    fireEvent.click(screen.getByLabelText(/salvar atividade/i));

    // Quinze horas de caminhada é erro de digitação, e a frase diz a faixa.
    await waitFor(() => expect(textoDaTela()).toMatch(/de 1 a 600/i));
    expect(registrarCardio).not.toHaveBeenCalled();
  });

  it('distância opcional ilegível não impede o registro', async () => {
    // Campo opcional com texto ruim virava `NaN` → `null` no JSON → registro
    // inteiro recusado por causa do que era dispensável.
    await abrirCardio();
    await waitFor(() =>
      expect(screen.getByLabelText(/registrar atividade de cardio/i)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByLabelText(/registrar atividade de cardio/i));

    fireEvent.change(screen.getByLabelText(/duração em minutos/i), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText(/distância em quilômetros/i), {
      target: { value: 'uns 3' },
    });
    fireEvent.click(screen.getByLabelText(/salvar atividade/i));

    await waitFor(() => expect(registrarCardio).toHaveBeenCalled());
    const [, corpo] = registrarCardio.mock.calls[0] as [string, { distanciaKm?: number }];
    expect(corpo.distanciaKm).toBeUndefined();
  });

  it('falha ao carregar NÃO vira "nenhuma atividade ainda"', async () => {
    listarCardio.mockRejectedValue(new Error('rede'));
    await abrirCardio();

    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar suas atividades.')).toBeInTheDocument(),
    );
    expect(textoDaTela()).not.toMatch(/nenhuma atividade ainda/i);
  });

  it('a lista mostra duração, intensidade e a caloria como ESTIMATIVA', async () => {
    // O "~" não é enfeite: é a diferença entre um número medido e um calculado,
    // e quem lê o segundo como o primeiro ajusta a dieta em cima de suposição.
    await abrirCardio();

    await waitFor(() => expect(textoDaTela()).toContain('40 min'));
    expect(textoDaTela()).toContain('~180 kcal');
    expect(textoDaTela()).toContain('4.2 km');
  });

  it('cardio feito dentro do treino vem marcado como tal', async () => {
    // Sem o selo, a mesma esteira apareceria duas vezes para quem confere — uma
    // no treino, outra aqui — e pareceria registro duplicado.
    listarCardio.mockResolvedValue([atividade('a1', { execucaoId: 'exec-1' })]);
    await abrirCardio();

    await waitFor(() => expect(textoDaTela()).toMatch(/no treino/i));
  });
});

describe('calorimetria', () => {
  it('aceita o valor do laudo escrito com separador de milhar', async () => {
    /*
      "1.850" é como o laudo imprime. `Number('1.850')` é 1.85 — não NaN, o que
      é ainda pior: um metabolismo de 1,85 kcal/dia seria aceito caladamente se
      o `if (!valor)` não o barrasse por acaso. `numeroDoCampo` recusa e a tela
      pede o número limpo.
    */
    await abrirCalorimetria();
    await waitFor(() =>
      expect(screen.getByLabelText(/registrar exame de calorimetria/i)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByLabelText(/registrar exame de calorimetria/i));

    fireEvent.change(screen.getByLabelText(/gasto em repouso/i), { target: { value: '1750' } });
    fireEvent.change(screen.getByLabelText(/peso no dia do exame/i), { target: { value: '79,5' } });
    fireEvent.click(screen.getByLabelText(/salvar exame/i));

    await waitFor(() =>
      expect(registrarCalorimetria).toHaveBeenCalledWith(
        'aluna-1',
        expect.objectContaining({ tmbMedidaKcal: 1750, pesoNoExameKg: 79.5 }) as unknown,
      ),
    );
  });

  it('"1.850" copiado do laudo NÃO vira 1,85 kcal por dia', async () => {
    /*
      O caso mais perigoso desta tela, e o menos visível: "1.850" é como o laudo
      imprime, e qualquer conversão numérica lê 1,85 — número válido, valor
      absurdo, aceito sem reclamação. Um metabolismo de 1,85 kcal/dia
      contaminaria o planejamento alimentar inteiro, e ninguém olharia para o
      campo de novo.
    */
    await abrirCalorimetria();
    await waitFor(() =>
      expect(screen.getByLabelText(/registrar exame de calorimetria/i)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByLabelText(/registrar exame de calorimetria/i));

    fireEvent.change(screen.getByLabelText(/gasto em repouso/i), { target: { value: '1.850' } });
    fireEvent.click(screen.getByLabelText(/salvar exame/i));

    await waitFor(() => expect(textoDaTela()).toMatch(/entre 800 e 4500 kcal por dia/i));
    expect(registrarCalorimetria).not.toHaveBeenCalled();
  });

  it('falha ao carregar NÃO afirma que o app está estimando por falta de laudo', async () => {
    /*
      A frase do vazio diz duas coisas: que não há exame E que o metabolismo
      está sendo estimado. Dita a quem tem laudo, as duas são falsas.
    */
    listarCalorimetrias.mockRejectedValue(new Error('rede'));
    await abrirCalorimetria();

    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar seus exames.')).toBeInTheDocument(),
    );
    expect(textoDaTela()).not.toMatch(/nenhum exame registrado/i);
  });

  it('mostra o exame com data por extenso e onde foi feito', async () => {
    await abrirCalorimetria();

    await waitFor(() => expect(textoDaTela()).toMatch(/15 de junho de 2026/i));
    expect(textoDaTela()).toContain('Q-NRG');
    expect(textoDaTela()).toContain('1.620');
  });

  it('o vazio de verdade explica o que o app faz sem o exame', async () => {
    listarCalorimetrias.mockResolvedValue([]);
    await abrirCalorimetria();

    await waitFor(() => expect(textoDaTela()).toMatch(/nenhum exame registrado/i));
    expect(textoDaTela()).toMatch(/estima seu metabolismo/i);
  });
});
