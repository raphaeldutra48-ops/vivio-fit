import {
  Classificacao,
  EscopoMarcador,
  Papel,
  marcadoresDoEscopo,
  referenciaDe,
  type ExameResumo,
} from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * As duas telas de exame — lançar e ler. As mais clínicas do painel, e as duas
 * sem prova até agora.
 *
 * As 20 faixas e as 8 regras de alerta já têm prova exaustiva em
 * `packages/contracts` e `packages/banco/regras`, inclusive a invariante de
 * privacidade (nenhum texto de personal cita marcador). O que falta é a FIAÇÃO,
 * e nela moram três coisas que não dão erro em lugar nenhum:
 *
 * 1. **O nutricionista só vê os marcadores do escopo dele.** O servidor recusa o
 *    resto de qualquer forma — mostrar o campo e depois recusar seria pior que
 *    não mostrar, porque ele digita o valor antes de descobrir.
 * 2. **Vírgula é decimal.** Exame vem com "1,25" no laudo, e o teclado
 *    brasileiro oferece vírgula. `Number('1,25')` é `NaN`, e `NaN` vai como
 *    `null` — o marcador simplesmente não é gravado, em silêncio.
 * 3. **A data da coleta é a do laudo, não a de hoje**, e o padrão é hoje no
 *    relógio LOCAL. Em UTC, um exame lançado às 21h seria datado de amanhã.
 */
const registrar = vi.fn();
const obterExame = vi.fn();
const anexarLaudo = vi.fn();
const enviarMidia = vi.fn();
const empurrar = vi.fn();

vi.mock('../lib/sdk', () => ({
  sdk: {
    exames: {
      registrar: (...a: unknown[]) => registrar(...a),
      obter: (...a: unknown[]) => obterExame(...a),
      anexarLaudo: (...a: unknown[]) => anexarLaudo(...a),
    },
    midia: { enviar: (...a: unknown[]) => enviarMidia(...a) },
  },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ alunoId: 'aluna-1', exameId: 'ex-1' }),
  useRouter: () => ({ push: empurrar, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

let papel: Papel = Papel.MEDICO;
vi.mock('../lib/sessao', () => ({
  useSessao: () => ({
    usuario: { id: 'prof-1', nome: 'Dra. Helena', email: 'h@exemplo.com', papel },
    carregando: false,
  }),
}));

const textoDaTela = () => document.body.textContent ?? '';

async function abrirNovo() {
  const { default: Novo } = await import('../app/(pro)/alunos/[alunoId]/exames/novo/page');
  return render(<Novo />);
}

async function abrirDetalhe() {
  const { default: Detalhe } = await import('../app/(pro)/alunos/[alunoId]/exames/[exameId]/page');
  return render(<Detalhe />);
}

/** O rótulo com que a tela nomeia um marcador, incluindo a unidade. */
function rotuloDoCampo(marcador: string): RegExp {
  const ref = referenciaDe(marcador as never);
  return new RegExp(`^${ref.rotulo}`, 'i');
}

const exame = (extras: Partial<ExameResumo> = {}): ExameResumo =>
  ({
    id: 'ex-1',
    laboratorio: 'Laboratório Central',
    dataColeta: '2026-09-20',
    sexo: 'F',
    observacao: null,
    registradoPor: { id: 'prof-1', nome: 'Dra. Helena' },
    resultados: [],
    contagem: { OTIMO: 0, ATENCAO: 0, CRITICO: 0 },
    arquivoUrl: null,
    temArquivo: false,
    ...extras,
  }) as ExameResumo;

beforeEach(() => {
  papel = Papel.MEDICO;
  registrar.mockResolvedValue({ id: 'ex-novo' });
  obterExame.mockResolvedValue(exame());
  anexarLaudo.mockResolvedValue(undefined);
  enviarMidia.mockResolvedValue('exames/aluna-1/laudo.pdf');
});

describe('lançar exame: quem vê qual campo', () => {
  it('o nutricionista só recebe os campos do escopo dele', async () => {
    /*
      Mostrar um campo que o servidor vai recusar é pior que não mostrar: ele
      digita o valor, salva, e a recusa chega depois de o formulário inteiro
      estar preenchido — sem dizer qual campo sobrou.
    */
    papel = Papel.NUTRICIONISTA;
    await abrirNovo();

    const doNutricionista = marcadoresDoEscopo(EscopoMarcador.NUTRICIONAL);
    const soDoMedico = marcadoresDoEscopo('TODOS').filter((m) => !doNutricionista.includes(m));

    expect(screen.getByLabelText(rotuloDoCampo(doNutricionista[0]!))).toBeInTheDocument();
    expect(soDoMedico.length).toBeGreaterThan(0);
    for (const m of soDoMedico.slice(0, 3)) {
      expect(screen.queryByLabelText(rotuloDoCampo(m))).not.toBeInTheDocument();
    }
  });

  it('o médico recebe a tabela inteira', async () => {
    await abrirNovo();

    const todos = marcadoresDoEscopo('TODOS');
    expect(screen.getByLabelText(rotuloDoCampo(todos[0]!))).toBeInTheDocument();
    expect(screen.getByLabelText(rotuloDoCampo(todos[todos.length - 1]!))).toBeInTheDocument();
  });
});

describe('lançar exame: o que é digitado', () => {
  it('valor com VÍRGULA chega como número — 1,25 e não NaN', async () => {
    /*
      O laudo brasileiro escreve "1,25" e o teclado oferece vírgula.
      `Number('1,25')` é `NaN`, que o `JSON.stringify` manda como `null` — e o
      marcador não é gravado, sem erro nenhum na tela. Num exame, marcador que
      não grava é marcador que o alerta clínico nunca vê.
    */
    const marcador = marcadoresDoEscopo('TODOS')[0]!;
    await abrirNovo();

    fireEvent.change(screen.getByLabelText('Laboratório'), { target: { value: 'Central' } });
    fireEvent.change(screen.getByLabelText(rotuloDoCampo(marcador)), {
      target: { value: '1,25' },
    });
    fireEvent.click(screen.getByText('Salvar e analisar'));

    await waitFor(() => expect(registrar).toHaveBeenCalled());
    const corpo = registrar.mock.calls[0]![1] as { resultados: { marcador: string; valor: number }[] };
    expect(corpo.resultados).toEqual([{ marcador, valor: 1.25 }]);
  });

  it('texto que não é número trava o envio e diz qual marcador', async () => {
    const marcador = marcadoresDoEscopo('TODOS')[0]!;
    await abrirNovo();

    fireEvent.change(screen.getByLabelText('Laboratório'), { target: { value: 'Central' } });
    fireEvent.change(screen.getByLabelText(rotuloDoCampo(marcador)), {
      target: { value: 'doze' },
    });

    expect(textoDaTela()).toMatch(new RegExp(`${referenciaDe(marcador).rotulo}.*use só números`, 'i'));
    expect(screen.getByText('Salvar e analisar')).toBeDisabled();
    expect(registrar).not.toHaveBeenCalled();
  });

  it('exame sem nenhum marcador não pode ser salvo', async () => {
    // Exame vazio não gera alerta nenhum e polui o histórico clínico.
    await abrirNovo();

    fireEvent.change(screen.getByLabelText('Laboratório'), { target: { value: 'Central' } });

    expect(textoDaTela()).toMatch(/digite ao menos um marcador/i);
    expect(screen.getByText('Salvar e analisar')).toBeDisabled();
  });

  it('a data da coleta começa em HOJE pelo relógio local, inclusive às 22h', async () => {
    /*
      Com `toISOString()`, um exame lançado às 21h vinha pré-preenchido com
      amanhã — e ninguém confere um campo que já veio com algo plausível. Num
      exame, a data é o que ordena o histórico e decide qual resultado é o atual.

      O RELÓGIO É FIXADO, e isso não é detalhe. A primeira versão desta prova
      comparava com o `new Date()` do momento da execução, e por isso só
      reprovava entre 21h e meia-noite — nas outras dezenove horas do dia, UTC e
      hora local dão o mesmo dia e a prova passava com o defeito presente. Foi a
      mutação que mostrou: devolvi o `toISOString()` e nada ficou vermelho.

      Prova cujo resultado depende da hora em que alguém a roda não é prova.
    */
    vi.useFakeTimers();
    // 22h no horário de Brasília: em UTC já é o dia seguinte.
    vi.setSystemTime(new Date(2026, 9, 9, 22, 30));
    try {
      await abrirNovo();
      expect(screen.getByLabelText('Data da coleta')).toHaveValue('2026-10-09');
    } finally {
      vi.useRealTimers();
    }
  });

  it('salvo, vai direto para a análise do exame', async () => {
    // A tela de destino é o que o profissional abriu o exame para ver: a
    // classificação de cada marcador.
    const marcador = marcadoresDoEscopo('TODOS')[0]!;
    await abrirNovo();

    fireEvent.change(screen.getByLabelText('Laboratório'), { target: { value: 'Central' } });
    fireEvent.change(screen.getByLabelText(rotuloDoCampo(marcador)), { target: { value: '1' } });
    fireEvent.click(screen.getByText('Salvar e analisar'));

    await waitFor(() => expect(empurrar).toHaveBeenCalledWith('/alunos/aluna-1/exames/ex-novo'));
  });

  it('recusa do servidor chega com a frase dele, que diz o que corrigir', async () => {
    const marcador = marcadoresDoEscopo('TODOS')[0]!;
    registrar.mockRejectedValue(
      new ErroApi('DADOS_INVALIDOS', 'Valor fora da faixa possível para TFG.', 422),
    );
    await abrirNovo();

    fireEvent.change(screen.getByLabelText('Laboratório'), { target: { value: 'Central' } });
    fireEvent.change(screen.getByLabelText(rotuloDoCampo(marcador)), { target: { value: '1' } });
    fireEvent.click(screen.getByText('Salvar e analisar'));

    await waitFor(() => expect(textoDaTela()).toMatch(/fora da faixa possível para TFG/i));
  });
});

describe('ler exame: a classificação', () => {
  const comResultados = () =>
    exame({
      resultados: [
        {
          marcador: 'TFG_ESTIMADA',
          rotulo: 'TFG estimada',
          valor: 67,
          unidade: 'mL/min/1,73m²',
          classificacao: Classificacao.ATENCAO,
          sistema: 'RENAL',
          faixaLaboratorial: { min: 60, max: null },
          faixaFuncional: { min: 90, max: null },
          fonteLaboratorial: { texto: 'KDIGO', forca: 'DIRETRIZ' },
          fonteFuncional: { texto: 'Funcionalis', forca: 'CONSENSO' },
        },
      ] as unknown as ExameResumo['resultados'],
      contagem: { OTIMO: 0, ATENCAO: 1, CRITICO: 0 },
    });

  it('falha ao carregar NÃO vira exame vazio', async () => {
    obterExame.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'fetch failed', 0));
    await abrirDetalhe();

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível carregar este exame/i));
    expect(textoDaTela()).not.toMatch(/nenhum marcador nesta classificação/i);
    expect(textoDaTela()).not.toMatch(/fetch failed/i);
  });

  it('mostra o laboratório, a data da coleta e quem registrou', async () => {
    // Quem registrou é parte do registro clínico: a responsabilidade pelo
    // lançamento tem nome.
    obterExame.mockResolvedValue(comResultados());
    await abrirDetalhe();

    await waitFor(() => expect(textoDaTela()).toMatch(/laboratório central/i));
    expect(textoDaTela()).toMatch(/20\/09\/2026/);
    expect(textoDaTela()).toMatch(/dra\. helena/i);
  });

  it('o filtro conta o que ELE vê, e filtrar não esconde o total', async () => {
    /*
      A contagem vem do servidor e conta o que este papel pode ver: dizer "45
      marcadores" e listar 16 seria pior que não dizer nada.
    */
    obterExame.mockResolvedValue(comResultados());
    await abrirDetalhe();

    await waitFor(() => expect(screen.getByText(/Todos \(1\)/)).toBeInTheDocument());
    expect(screen.getByText(/Atenção \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Ótimo \(0\)/)).toBeInTheDocument();
  });

  it('filtro sem resultado diz isso, em vez de parecer exame vazio', async () => {
    obterExame.mockResolvedValue(comResultados());
    await abrirDetalhe();
    await waitFor(() => expect(screen.getByText(/Ótimo \(0\)/)).toBeInTheDocument());

    fireEvent.click(screen.getByText(/Ótimo \(0\)/));

    expect(textoDaTela()).toMatch(/nenhum marcador nesta classificação/i);
  });

  it('exame sem laudo anexado não oferece link para abrir nada', async () => {
    // Link para arquivo inexistente é botão que não faz nada — e aqui o "nada"
    // seria interpretado como laudo perdido.
    obterExame.mockResolvedValue(comResultados());
    await abrirDetalhe();

    await waitFor(() => expect(textoDaTela()).toMatch(/laboratório central/i));
    expect(screen.queryByText(/abrir laudo/i)).not.toBeInTheDocument();
  });
});
