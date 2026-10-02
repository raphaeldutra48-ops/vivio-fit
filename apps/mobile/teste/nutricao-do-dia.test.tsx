import { ErroApi } from '@vivio/sdk';
import { obterTema } from '@vivio/ui-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A tela de nutrição do dia — a que escreve sem pedir confirmação.
 *
 * Marcar refeição e registrar água são toques únicos, sem pergunta, e é assim
 * que tem de ser: são dezenas por semana. O preço disso é que a tela precisa
 * estar certa sobre três coisas que não aparecem quando dão errado:
 *
 * 1. **Não ter plano e não ter rede são coisas diferentes.** Já foram a mesma
 *    tela aqui: "Seu nutricionista ainda não montou ou ativou um plano" dito a
 *    quem está sem sinal é acusação falsa contra a profissional — e o aluno vai
 *    cobrá-la por um plano que existe.
 * 2. **A água aparece antes de o servidor responder.** Sem isso o toque parece
 *    ignorado e a pessoa toca de novo, registrando o dobro.
 * 3. **A cobrança tem de encolher na hora.** Se ela só mudasse na próxima
 *    abertura, quem registrou continuaria sendo cobrado — o jeito mais rápido de
 *    ensinar alguém a ignorar um aviso.
 *
 * As asserções de número leem o texto da tela inteira, e não um nó: tanto o
 * volume ("0,5 L" + " / 2,5 L") quanto a cobrança são montados em pedaços, e
 * procurar a frase completa num só elemento não encontraria nada.
 */
const obterAtiva = vi.fn();
const resumoDeAgua = vi.fn();
const registrosDoDia = vi.fn();
const registrarAgua = vi.fn();
const registrarRefeicao = vi.fn();

vi.mock('../src/sdk', () => ({
  sdk: {
    dietas: {
      obterAtiva: (...a: unknown[]) => obterAtiva(...a),
      registrosDoDia: (...a: unknown[]) => registrosDoDia(...a),
      registrarRefeicao: (...a: unknown[]) => registrarRefeicao(...a),
    },
    agua: {
      resumo: (...a: unknown[]) => resumoDeAgua(...a),
      registrar: (...a: unknown[]) => registrarAgua(...a),
    },
  },
}));

/*
  O `usuario` é uma CONSTANTE, e isso importa mais do que parece: a tela guarda a
  recarga num `useCallback` que depende dele. No app real ele é estado do
  provedor — identidade estável entre renders. Um dublê que devolvesse objeto novo
  a cada chamada trocaria a identidade, o efeito recarregaria a cada render e a
  tela entraria em laço, apagando a marcação local a cada volta. Foi exatamente o
  que aconteceu na primeira versão deste arquivo: 53 recargas num teste.
*/
const usuario = { id: 'aluna-1', nome: 'Ana Souza', email: 'ana@exemplo.com', papel: 'ALUNO' };
const sessao = { tema: obterTema('claro'), nomeDoTema: 'claro', usuario, carregando: false };

vi.mock('../src/sessao', () => ({ useSessao: () => sessao }));

const macros = { kcal: 300, proteinaG: 20, carboidratoG: 30, gorduraG: 10 };

const refeicao = (id: string, nome: string, horario: string) => ({
  id,
  nome,
  horarioSugerido: horario,
  ordem: 0,
  macros,
  itens: [
    {
      id: `${id}-item`,
      quantidadeG: 100,
      macros,
      alimento: { id: 'a1', nome: 'Ovo cozido', medidaCaseira: '2 unidades' },
    },
  ],
});

const dieta = {
  id: 'dieta-1',
  nome: 'Cutting 1.800 kcal',
  nutricionista: { id: 'nutri-1', nome: 'Eduarda Nutricionista', papel: 'NUTRICIONISTA' },
  kcalAlvo: 1800,
  proteinaAlvoG: 140,
  carboAlvoG: 180,
  gorduraAlvoG: 55,
  macrosTotais: { kcal: 1496, proteinaG: 128, carboidratoG: 164, gorduraG: 37 },
  refeicoes: [refeicao('r1', 'Café da manhã', '07:00'), refeicao('r2', 'Almoço', '12:30')],
};

const agua = { consumidoMl: 500, metaMlDia: 2500, percentual: 20, minutosDesdeUltimoRegistro: 30 };

/** O texto de toda a tela — os números vivem quebrados em vários nós. */
const textoDaTela = () => document.body.textContent ?? '';

async function abrirTela() {
  const { default: Nutricao } = await import('../app/(tabs)/nutricao');
  return render(<Nutricao />);
}

beforeEach(() => {
  /*
    Relogio fixo as 20h, e nao o da maquina.

    A cobranca e calculada pelo horario: refeicao so conta como pendente depois
    da tolerancia do horario sugerido. Rodando as 11h, o almoco das 12:30 ainda
    nao esta atrasado, e a prova de "1 de 2" ficaria verde de manha e vermelha
    de tarde -- suite que depende da hora em que roda nao serve de portao.
    Falsa so a `Date`; os temporizadores continuam reais, senao o `waitFor` do
    testing-library nao avanca.
  */
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-29T20:00:00') });
  obterAtiva.mockResolvedValue(dieta);
  resumoDeAgua.mockResolvedValue(agua);
  registrosDoDia.mockResolvedValue([]);
  registrarAgua.mockResolvedValue({ ...agua, consumidoMl: 700, percentual: 28 });
  registrarRefeicao.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('nutrição do dia', () => {
  it('sem plano (404): diz que não há plano, e não culpa a rede', async () => {
    obterAtiva.mockRejectedValue(new ErroApi('RECURSO_NAO_ENCONTRADO', 'Sem plano.', 404));

    await abrirTela();

    await waitFor(() => expect(screen.getByText('Sem plano alimentar')).toBeInTheDocument());
    expect(textoDaTela()).not.toMatch(/assim que a rede voltar/i);
  });

  it('sem rede: diz que o plano continua salvo, e NÃO acusa a nutricionista', async () => {
    /*
      O defeito que esta tela já teve. A frase errada não é só imprecisa: ela
      manda o aluno cobrar a profissional por um trabalho que ela fez.
    */
    obterAtiva.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'Sem rede.', 0));

    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toMatch(/assim que a rede voltar, aparece aqui/i));
    expect(textoDaTela()).not.toMatch(/ainda não montou ou ativou um plano/i);
  });

  it('a água aparece no toque, antes de o servidor responder', async () => {
    // Promessa que não resolve: é o instante entre o toque e a resposta.
    registrarAgua.mockReturnValue(new Promise(() => undefined));
    await abrirTela();
    await waitFor(() => expect(textoDaTela()).toContain('0,5 L'));

    fireEvent.click(screen.getByLabelText(/registrar 200 mililitros/i));

    // Sem esperar rede nenhuma: 500 + 200.
    await waitFor(() => expect(textoDaTela()).toContain('0,7 L'));
  });

  it('se o registro de água falhar, a tela volta ao que o servidor sabe', async () => {
    /*
      O contrário do otimismo é a mentira: um número que subiu e não foi gravado
      faria a pessoa achar que bebeu o que não registrou.
    */
    registrarAgua.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'Sem rede.', 0));
    await abrirTela();
    await waitFor(() => expect(resumoDeAgua).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByLabelText(/registrar 300 mililitros/i));

    // Recarrega: o valor da tela passa a ser o do servidor, não o otimista.
    await waitFor(() => expect(resumoDeAgua).toHaveBeenCalledTimes(2));
  });

  it('marcar "Fiz" registra a refeição certa, com o status certo', async () => {
    await abrirTela();
    await waitFor(() => expect(screen.getByText('Cutting 1.800 kcal')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/marcar café da manhã como feita/i));

    await waitFor(() =>
      expect(registrarRefeicao).toHaveBeenCalledWith(
        'aluna-1',
        expect.objectContaining({ refeicaoId: 'r1', status: 'FEITA' }) as unknown,
      ),
    );
  });

  it('tocar de novo na mesma opção desmarca, e não manda nada ao servidor', async () => {
    // Desmarcar é local por desenho: mandar o mesmo status de novo criaria
    // registro duplicado do mesmo ato.
    registrosDoDia.mockResolvedValue([{ refeicaoId: 'r1', status: 'FEITA' }]);
    await abrirTela();
    await waitFor(() => expect(screen.getByText('Cutting 1.800 kcal')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/marcar café da manhã como feita/i));

    await new Promise((r) => setTimeout(r, 120));
    expect(registrarRefeicao).not.toHaveBeenCalled();
  });

  it('a cobrança encolhe no mesmo toque, sem esperar a próxima abertura', async () => {
    await abrirTela();
    await waitFor(() => expect(textoDaTela()).toMatch(/0 de 2 refeições registradas hoje/i));

    fireEvent.click(screen.getByLabelText(/marcar café da manhã como feita/i));

    await waitFor(() => expect(textoDaTela()).toMatch(/1 de 2 refeições registradas hoje/i));
  });

  it('sem saber o que foi registrado hoje, a cobrança se CALA', async () => {
    /*
      A falha em `registrosDoDia` deixava o mapa vazio, e a cobrança concluía
      "0 de 2 refeições registradas hoje" para quem já havia registrado as duas.
      Cobrar alguém pelo que ele fez é o jeito mais rápido de ensinar a ignorar o
      aviso — e o aviso é a razão desta aba existir.
    */
    registrosDoDia.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'Sem rede.', 0));
    await abrirTela();
    await waitFor(() => expect(screen.getByText('Cutting 1.800 kcal')).toBeInTheDocument());

    expect(textoDaTela()).not.toMatch(/refeições registradas hoje/i);
  });

  it('falha na água não faz o cartão dela desaparecer sem explicação', async () => {
    /*
      O `.catch(() => undefined)` deixava `agua` em `null`, e o cartão todo é
      condicionado a ela: desaparecia — junto com o único jeito de registrar um
      copo. Sem uma palavra na tela, a leitura é que o recurso saiu do app.
    */
    resumoDeAgua.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'Sem rede.', 0));
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toMatch(/não deu para buscar sua água de hoje/i));
    // E diz o que importa para quem já bebeu: o registro não se perdeu.
    expect(textoDaTela()).toMatch(/continua salvo/i);
  });

  it('desmarcar devolve a refeição à cobrança', async () => {
    /*
      O outro lado do toque que desmarca, e onde estava o defeito: a tela
      guardava a refeição desmarcada como string vazia em vez de esquecê-la, e
      a cobrança contava CHAVES. Quem tocou por engano e desfez continuava
      contado como registrado, com a tela de refeição dizendo o contrário — e
      o dia fechava com uma refeição que ninguém respondeu e ninguém cobrou.
    */
    registrosDoDia.mockResolvedValue([{ refeicaoId: 'r1', status: 'FEITA' }]);
    await abrirTela();
    await waitFor(() => expect(textoDaTela()).toMatch(/1 de 2 refeições registradas hoje/i));

    fireEvent.click(screen.getByLabelText(/marcar café da manhã como feita/i));

    await waitFor(() => expect(textoDaTela()).toMatch(/0 de 2 refeições registradas hoje/i));
  });
});
