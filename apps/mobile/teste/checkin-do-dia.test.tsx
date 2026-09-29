import { obterTema } from '@vivio/ui-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { navegacao } from './preparo';

/**
 * O check-in de hoje.
 *
 * É a única coisa que o aluno faz TODO dia, inclusive nos de descanso, e é dele
 * que sai o alerta de adesão que chega ao personal. Duas decisões da tela
 * importam mais que o resto:
 *
 * 1. **"Não treinei" tem o mesmo peso que "treinei".** Um check-in que só
 *    aceita boa notícia não mede adesão, mede vergonha — e o dado que o
 *    profissional precisa é justamente o outro.
 * 2. **Responder de novo CORRIGE, não acumula.** Por isso a tela abre com o
 *    que já foi dito: em branco, quem voltasse para corrigir só a dor apagaria
 *    a energia sem perceber.
 *
 * O peso é um enxerto: vai para as medidas, não para o check-in, e falhar nele
 * não pode desfazer nem esconder o que já foi salvo.
 */
const listarCheckins = vi.fn();
const registrarCheckin = vi.fn();
const listarMedidas = vi.fn();
const registrarMedida = vi.fn();

vi.mock('../src/sdk', () => ({
  sdk: {
    checkins: {
      listar: (...a: unknown[]) => listarCheckins(...a),
      registrar: (...a: unknown[]) => registrarCheckin(...a),
    },
    medidas: {
      listar: (...a: unknown[]) => listarMedidas(...a),
      registrar: (...a: unknown[]) => registrarMedida(...a),
    },
  },
}));

const usuario = { id: 'aluna-1', nome: 'Ana Souza', email: 'ana@exemplo.com', papel: 'ALUNO' };
const sessao = { tema: obterTema('claro'), nomeDoTema: 'claro', usuario, carregando: false };
vi.mock('../src/sessao', () => ({ useSessao: () => sessao }));

const hoje = new Date().toISOString().slice(0, 10);

const textoDaTela = () => document.body.textContent ?? '';

async function abrirTela() {
  const { default: Checkin } = await import('../app/checkin');
  return render(<Checkin />);
}

/** O enviado ao servidor no último registro de check-in. */
const enviado = () => (registrarCheckin.mock.calls[0] as [string, Record<string, unknown>])[1];

beforeEach(() => {
  listarCheckins.mockResolvedValue([]);
  registrarCheckin.mockResolvedValue(undefined);
  // Pesou ontem: o campo de peso não aparece por padrão.
  listarMedidas.mockResolvedValue([
    { id: 'm1', data: new Date(Date.now() - 864e5).toISOString(), pesoKg: 78 },
  ]);
  registrarMedida.mockResolvedValue(undefined);
});

describe('check-in do dia', () => {
  it('"não treinei" é resposta completa, e sai como tal', async () => {
    /*
      O campo mais importante da tela. Se ele fosse o caminho difícil, o app
      mediria só os dias bons — e o alerta de adesão do personal existe
      exatamente para os outros.
    */
    await abrirTela();
    await waitFor(() => expect(screen.getByLabelText('Não treinei')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Não treinei'));
    fireEvent.click(screen.getByLabelText(/cansado, 2 de 5/i));
    fireEvent.click(screen.getByLabelText(/salvar check-in de hoje/i));

    await waitFor(() => expect(registrarCheckin).toHaveBeenCalled());
    expect(enviado()).toMatchObject({ treinou: false, energia: 2, data: hoje });
  });

  it('sem responder o essencial, o botão diz o que falta', async () => {
    // "Salvar" desabilitado e mudo faria a pessoa tocar de novo sem entender.
    await abrirTela();
    await waitFor(() => expect(textoDaTela()).toContain('Responda se treinou hoje'));

    fireEvent.click(screen.getByLabelText('Treinei'));

    await waitFor(() => expect(textoDaTela()).toContain('Escolha como está sua energia'));
    expect(registrarCheckin).not.toHaveBeenCalled();
  });

  it('o check-in de hoje volta preenchido, para corrigir sem apagar o resto', async () => {
    /*
      Abrir em branco faria quem voltasse só para dizer que sentiu dor
      sobrescrever a energia do dia com outro valor — e o registro do dia é
      SUBSTITUÍDO, não somado.
    */
    listarCheckins.mockResolvedValue([
      {
        id: 'c1',
        data: `${hoje}T12:00:00.000Z`,
        treinou: true,
        energia: 4,
        teveDor: false,
        localDor: null,
        observacao: 'dormi mal',
      },
    ]);
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toMatch(/você já fez o check-in de hoje/i));
    expect(screen.getByLabelText('Observação do dia')).toHaveValue('dormi mal');
    expect(textoDaTela()).toContain('Atualizar check-in');

    fireEvent.click(screen.getByLabelText('Senti dor'));
    fireEvent.click(screen.getByLabelText(/salvar check-in de hoje/i));

    await waitFor(() => expect(registrarCheckin).toHaveBeenCalled());
    // A dor mudou; a energia e a observação seguiram como estavam.
    expect(enviado()).toMatchObject({ teveDor: true, energia: 4, observacao: 'dormi mal' });
  });

  it('o check-in de ONTEM não é carregado como se fosse o de hoje', async () => {
    // Senão a tela do dia novo abriria com as respostas do dia anterior, e
    // quem confirmasse sem ler registraria ontem como hoje.
    listarCheckins.mockResolvedValue([
      { id: 'c1', data: '2020-01-01T12:00:00.000Z', treinou: true, energia: 5, teveDor: false },
    ]);
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toContain('Responda se treinou hoje'));
    expect(textoDaTela()).not.toMatch(/você já fez o check-in de hoje/i);
  });

  it('local da dor em branco não vira texto vazio', async () => {
    /*
      A tela do profissional distingue "não informou" de "informou nada". Uma
      string vazia diz a segunda coisa quando a verdade é a primeira.
    */
    await abrirTela();
    await waitFor(() => expect(screen.getByLabelText('Treinei')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Treinei'));
    fireEvent.click(screen.getByLabelText(/normal, 3 de 5/i));
    fireEvent.click(screen.getByLabelText('Senti dor'));
    fireEvent.click(screen.getByLabelText(/salvar check-in de hoje/i));

    await waitFor(() => expect(registrarCheckin).toHaveBeenCalled());
    expect(enviado().localDor).toBeUndefined();
  });
});

describe('check-in: o peso pedido de vez em quando', () => {
  it('só aparece depois de uma semana sem pesar', async () => {
    // Pesar todo dia mede água, não progresso — e desanima com um número que
    // não significa nada.
    await abrirTela();
    await waitFor(() => expect(screen.getByLabelText('Treinei')).toBeInTheDocument());

    expect(screen.queryByLabelText(/peso em quilos/i)).not.toBeInTheDocument();
  });

  it('depois de 7 dias, pergunta — e diz há quanto tempo', async () => {
    listarMedidas.mockResolvedValue([
      { id: 'm1', data: new Date(Date.now() - 10 * 864e5).toISOString(), pesoKg: 78 },
    ]);
    await abrirTela();

    await waitFor(() => expect(screen.getByLabelText(/peso em quilos/i)).toBeInTheDocument());
    expect(textoDaTela()).toMatch(/faz 10 dias que você não registra/i);
  });

  it('o peso vai para as MEDIDAS, com vírgula lida certo', async () => {
    /*
      Guardá-lo no check-in criaria um segundo lugar com o mesmo dado — e os
      dois divergiriam na primeira vez que alguém corrigisse um só.
    */
    listarMedidas.mockResolvedValue([]);
    await abrirTela();
    await waitFor(() => expect(screen.getByLabelText(/peso em quilos/i)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Treinei'));
    fireEvent.click(screen.getByLabelText(/bem, 4 de 5/i));
    fireEvent.change(screen.getByLabelText(/peso em quilos/i), { target: { value: '77,4' } });
    fireEvent.click(screen.getByLabelText(/salvar check-in de hoje/i));

    await waitFor(() =>
      expect(registrarMedida).toHaveBeenCalledWith(
        'aluna-1',
        expect.objectContaining({ pesoKg: 77.4, fonte: 'MANUAL' }) as unknown,
      ),
    );
  });

  it('se o peso falhar, a tela NÃO fecha em cima do aviso', async () => {
    /*
      O defeito que esta prova fixa: a mensagem "check-in salvo, mas o peso
      não" era escrita e o `router.back()` fechava a tela no mesmo instante. A
      pessoa saía achando que registrou os dois, e a semana ficava sem ponto no
      gráfico — sem nada avisando.
    */
    listarMedidas.mockResolvedValue([]);
    registrarMedida.mockRejectedValue(new Error('rede'));
    await abrirTela();
    await waitFor(() => expect(screen.getByLabelText(/peso em quilos/i)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Treinei'));
    fireEvent.click(screen.getByLabelText(/bem, 4 de 5/i));
    fireEvent.change(screen.getByLabelText(/peso em quilos/i), { target: { value: '77' } });
    fireEvent.click(screen.getByLabelText(/salvar check-in de hoje/i));

    await waitFor(() => expect(textoDaTela()).toMatch(/o peso não foi — toque em salvar de novo/i));
    expect(navegacao.back).not.toHaveBeenCalled();
    // E o check-in, esse, foi salvo: é o que a frase promete.
    expect(registrarCheckin).toHaveBeenCalled();
  });

  it('check-in salvo com tudo certo fecha a tela', async () => {
    await abrirTela();
    await waitFor(() => expect(screen.getByLabelText('Treinei')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Treinei'));
    fireEvent.click(screen.getByLabelText(/ótimo, 5 de 5/i));
    fireEvent.click(screen.getByLabelText(/salvar check-in de hoje/i));

    await waitFor(() => expect(navegacao.back).toHaveBeenCalled());
  });

  it('se o check-in falhar, ninguém sai da tela achando que salvou', async () => {
    registrarCheckin.mockRejectedValue(new Error('rede'));
    await abrirTela();
    await waitFor(() => expect(screen.getByLabelText('Treinei')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Treinei'));
    fireEvent.click(screen.getByLabelText(/ótimo, 5 de 5/i));
    fireEvent.click(screen.getByLabelText(/salvar check-in de hoje/i));

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível salvar o check-in/i));
    expect(navegacao.back).not.toHaveBeenCalled();
  });
});
