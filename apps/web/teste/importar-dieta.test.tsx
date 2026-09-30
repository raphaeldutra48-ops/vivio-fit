import { ErroApi } from '@vivio/sdk';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A importação de dieta a partir de um documento.
 *
 * É a única tela do sistema em que um modelo de linguagem lê algo e o resultado
 * vira prescrição. A regra que a sustenta está na primeira frase dela — "a
 * leitura vira um rascunho que você confere antes de salvar" — e a prova aqui é
 * dessa regra: **nada com item pendente pode ser salvo**.
 *
 * Um item pendente é um que não virou alimento do catálogo ou ficou sem
 * quantidade. Salvá-lo criaria uma dieta com buraco no lugar onde o papel dizia
 * "arroz integral, 4 colheres" — e o aluno abriria o aplicativo com uma refeição
 * incompleta, achando que é o que a nutricionista prescreveu.
 *
 * O que o modelo lê NÃO é testado aqui: ele muda, e a suíte do SDK cuida da
 * chamada. O que se prova é a fronteira entre a leitura e a prescrição.
 */
const enviarMidia = vi.fn();
const importarDieta = vi.fn();
const criarDieta = vi.fn();
const navegador = { push: vi.fn(), replace: vi.fn() };

vi.mock('../lib/sdk', () => ({
  sdk: {
    midia: { enviar: (...a: unknown[]) => enviarMidia(...a) },
    dietas: {
      importarDieta: (...a: unknown[]) => importarDieta(...a),
      criar: (...a: unknown[]) => criarDieta(...a),
    },
  },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ alunoId: 'aluna-1' }),
  useRouter: () => navegador,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

const item = (extras: Record<string, unknown> = {}) => ({
  textoOriginal: 'Arroz integral — 100 g',
  nomeLido: 'Arroz integral',
  quantidadeG: 100,
  medidaCaseiraLida: null,
  observacao: null,
  candidatos: [
    { id: 'alim-1', nome: 'Arroz integral cozido', medidaCaseira: '4 col. sopa' },
    { id: 'alim-2', nome: 'Arroz branco cozido', medidaCaseira: '4 col. sopa' },
  ],
  alimentoIdSugerido: 'alim-1',
  ...extras,
});

const leitura = (extras: Record<string, unknown> = {}) => ({
  nome: 'Plano de 1.800 kcal',
  observacao: null,
  kcalAlvo: 1800,
  proteinaAlvoG: 140,
  carboAlvoG: 180,
  gorduraAlvoG: 55,
  avisos: [],
  itensSemCandidato: 0,
  refeicoes: [
    { nome: 'Café da manhã', horarioSugerido: '07:00', itens: [item()] },
  ],
  ...extras,
});

const textoDaTela = () => document.body.textContent ?? '';

/*
  Pelo PAPEL, e não pelo texto: a frase que explica o que cada botão faz cita os
  dois pelo nome, então `getByText` encontra dois elementos — o botão e a
  explicação. A explicação existe justamente porque o nome do botão sozinho não
  diz que ativar troca o que o aluno vê hoje.
*/
const botao = (nome: string) => screen.getByRole('button', { name: nome });

async function abrirTela() {
  const { default: Importar } = await import('../app/(pro)/alunos/[alunoId]/dieta/importar/page');
  return render(<Importar />);
}

/** Simula a escolha do arquivo, que é o que dispara a leitura. */
async function enviarDocumento(tipo = 'application/pdf'): Promise<void> {
  const entrada = document.querySelector('input[type="file"]') as HTMLInputElement;
  const arquivo = new File(['conteudo'], 'dieta.pdf', { type: tipo });
  fireEvent.change(entrada, { target: { files: [arquivo] } });
}

beforeEach(() => {
  enviarMidia.mockResolvedValue('materiais/prof-1/dieta.pdf');
  importarDieta.mockResolvedValue(leitura());
  criarDieta.mockResolvedValue({ id: 'dieta-1' });
});

describe('importar dieta: a fronteira entre leitura e prescrição', () => {
  it('item sem alimento escolhido trava o salvamento, e a tela diz quantos faltam', async () => {
    /*
      A regra que esta tela existe para cumprir. Sem a trava, a dieta iria ao ar
      com um buraco onde o papel dizia um alimento — e o aluno leria isso como a
      prescrição da nutricionista.
    */
    importarDieta.mockResolvedValue(
      leitura({
        refeicoes: [
          {
            nome: 'Café da manhã',
            horarioSugerido: '07:00',
            itens: [item({ alimentoIdSugerido: null, candidatos: [] })],
          },
        ],
      }),
    );
    await abrirTela();
    await enviarDocumento();

    await waitFor(() => expect(textoDaTela()).toMatch(/falta 1 item sem alimento escolhido/i));
    expect(botao('Salvar e ativar')).toBeDisabled();
  });

  it('item sem quantidade também trava', async () => {
    // "1 xícara" não vira grama sozinho: converter medida caseira depende do
    // alimento, e chutar poria um número exato na tela sobre um palpite.
    importarDieta.mockResolvedValue(
      leitura({
        refeicoes: [
          {
            nome: 'Café da manhã',
            horarioSugerido: '07:00',
            itens: [item({ quantidadeG: null, medidaCaseiraLida: '1 xícara' })],
          },
        ],
      }),
    );
    await abrirTela();
    await enviarDocumento();

    await waitFor(() => expect(textoDaTela()).toMatch(/sem alimento escolhido ou sem quantidade/i));
    expect(botao('Salvar e ativar')).toBeDisabled();
  });

  it('tudo conferido libera — e a tela diz o que cada botão faz', async () => {
    /*
      "Salvar e ativar" troca o que o aluno vê HOJE no aplicativo. Quem clica sem
      saber disso descobre pela pergunta do aluno no dia seguinte.
    */
    await abrirTela();
    await enviarDocumento();

    await waitFor(() => expect(botao('Salvar e ativar')).toBeEnabled());
    expect(textoDaTela()).toMatch(/passa a valer hoje no aplicativo do aluno/i);
    expect(textoDaTela()).toMatch(/salvar como rascunho.*não muda nada para ele/is);
  });

  it('salva com o alimento do catálogo e a quantidade em gramas', async () => {
    await abrirTela();
    await enviarDocumento();
    await waitFor(() => expect(botao('Salvar e ativar')).toBeEnabled());

    fireEvent.click(botao('Salvar e ativar'));

    await waitFor(() => expect(criarDieta).toHaveBeenCalled());
    const [alunoId, corpo] = criarDieta.mock.calls[0] as [
      string,
      { ativar: boolean; nome: string; refeicoes: { itens: unknown[] }[] },
    ];
    expect(alunoId).toBe('aluna-1');
    expect(corpo).toMatchObject({ ativar: true, nome: 'Plano de 1.800 kcal' });
    expect(corpo.refeicoes[0].itens[0]).toEqual({ alimentoId: 'alim-1', quantidadeG: 100 });
    // As metas lidas do documento vão junto: são elas que o app compara com o dia.
    expect(corpo).toMatchObject({ kcalAlvo: 1800, proteinaAlvoG: 140 });
  });

  it('rascunho não ativa nada', async () => {
    await abrirTela();
    await enviarDocumento();
    await waitFor(() => expect(botao('Salvar como rascunho')).toBeEnabled());

    fireEvent.click(botao('Salvar como rascunho'));

    await waitFor(() => expect(criarDieta).toHaveBeenCalled());
    expect((criarDieta.mock.calls[0] as [string, { ativar: boolean }])[1].ativar).toBe(false);
  });

  it('trocar o alimento sugerido é o que vai — não a sugestão', async () => {
    /*
      A sugestão é do casamento automático; a decisão é de quem confere. Mandar a
      sugestão depois de a pessoa ter trocado transformaria a conferência em
      teatro.
    */
    await abrirTela();
    await enviarDocumento();
    await waitFor(() => expect(botao('Salvar e ativar')).toBeEnabled());

    const seletor = document.querySelector('select') as HTMLSelectElement;
    fireEvent.change(seletor, { target: { value: 'alim-2' } });
    fireEvent.click(botao('Salvar e ativar'));

    await waitFor(() => expect(criarDieta).toHaveBeenCalled());
    const corpo = (criarDieta.mock.calls[0] as [
      string,
      { refeicoes: { itens: { alimentoId: string }[] }[] },
    ])[1];
    expect(corpo.refeicoes[0].itens[0].alimentoId).toBe('alim-2');
  });
});

describe('importar dieta: o que a tela diz quando não dá', () => {
  it('arquivo de tipo errado é recusado antes de subir', async () => {
    // Subir para descobrir que não serve gasta tempo e banda de quem está com o
    // aluno na frente.
    await abrirTela();
    await enviarDocumento('text/plain');

    await waitFor(() => expect(textoDaTela()).toMatch(/envie o pdf da dieta ou uma foto/i));
    expect(enviarMidia).not.toHaveBeenCalled();
  });

  it('falta de autorização ensina o caminho, em vez de dizer "erro"', async () => {
    /*
      403 aqui não é falha do sistema: é o aluno não ter autorizado. Sem o
      caminho, o profissional sabe o que está errado e não sabe o que dizer a ele
      — e quem paga é o aluno, que recebe um "autoriza lá" sem saber onde é lá.
    */
    importarDieta.mockRejectedValue(
      new ErroApi('CONSENTIMENTO_AUSENTE', 'sem consentimento', 403),
    );
    await abrirTela();
    await enviarDocumento();

    await waitFor(() => expect(textoDaTela()).toMatch(/minha equipe/i));
    expect(textoDaTela()).toMatch(/leitura automática de documentos/i);
  });

  it('avisos da leitura aparecem como aviso, e não impedem conferir', async () => {
    // Rasura e número cortado exigem mais atenção naquele ponto; o documento
    // ainda serve.
    importarDieta.mockResolvedValue(
      leitura({ avisos: ['A quantidade do jantar está rasurada no documento.'] }),
    );
    await abrirTela();
    await enviarDocumento();

    await waitFor(() => expect(textoDaTela()).toMatch(/rasurada no documento/i));
    expect(botao('Salvar e ativar')).toBeEnabled();
  });
});
