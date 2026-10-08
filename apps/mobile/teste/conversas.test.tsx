import { obterTema } from '@vivio/ui-native';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderizar, tocar } from './preparo';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O chat do aluno com a equipe.
 *
 * É o canal por onde vem resposta de médico, e isso muda o peso de cada
 * decisão daqui. Duas em particular:
 *
 * - **Falha ao carregar não pode virar "ninguém falou com você".** A leitura
 *   natural de uma lista vazia é que o profissional não respondeu — e a reação
 *   a isso é esperar em silêncio uma resposta que já chegou.
 * - **O que a pessoa escreveu não se perde.** Falha de rede no envio devolve o
 *   texto ao campo: reescrever um relato de dor porque o sinal caiu é o tipo de
 *   atrito que faz alguém desistir de contar.
 *
 * A ordem das mensagens também é prova: a API entrega da mais nova para a mais
 * antiga, e a tela lê ao contrário. Inverter errado embaralha uma conversa
 * inteira sem quebrar nada.
 */
const listarConversas = vi.fn();
const mensagensDaConversa = vi.fn();
const marcarVista = vi.fn();
const enviar = vi.fn();

vi.mock('../src/sdk', () => ({
  sdk: {
    chat: {
      listarConversas: (...a: unknown[]) => listarConversas(...a),
      mensagens: (...a: unknown[]) => mensagensDaConversa(...a),
      marcarVista: (...a: unknown[]) => marcarVista(...a),
      enviar: (...a: unknown[]) => enviar(...a),
    },
  },
}));

// A sondagem de 15 s não tem o que provar aqui e só deixaria temporizador solto.
vi.mock('../src/sondagem', () => ({ useSondagem: () => undefined }));

const usuario = { id: 'aluna-1', nome: 'Ana Souza', email: 'ana@exemplo.com', papel: 'ALUNO' };
const sessao = { tema: obterTema('claro'), nomeDoTema: 'claro', usuario, carregando: false };
vi.mock('../src/sessao', () => ({ useSessao: () => sessao }));

const conversa = (id: string, nome: string, extras: Record<string, unknown> = {}) => ({
  id,
  naoLidas: 0,
  contraparte: { id: `prof-${id}`, nome, papel: 'PERSONAL', avatarUrl: null },
  ultimaMensagem: { id: `m-${id}`, corpo: 'Bom treino hoje', enviadaEm: '2026-09-29T10:00:00Z' },
  ...extras,
});

const mensagem = (id: string, corpo: string, minha: boolean, enviadaEm: string) => ({
  id,
  corpo,
  minha,
  enviadaEm,
  lidaEm: null,
});

const textoDaTela = () => document.body.textContent ?? '';

async function abrirTela() {
  const { default: Chat } = await import('../app/chat');
  return renderizar(<Chat />);
}

beforeEach(() => {
  listarConversas.mockResolvedValue([conversa('c1', 'Diego Personal')]);
  mensagensDaConversa.mockResolvedValue({ dados: [] });
  marcarVista.mockResolvedValue(undefined);
  enviar.mockResolvedValue(mensagem('nova', 'oi', true, '2026-09-29T12:00:00Z'));
});

describe('conversas: o que a tela diz', () => {
  it('falha ao carregar NÃO vira "nenhuma conversa ainda"', async () => {
    /*
      O defeito que esta prova fixa. Quem estivesse sem sinal lia "Quando seu
      personal enviar uma mensagem, ela aparece aqui" — com três conversas
      gravadas no servidor, e uma delas possivelmente com a resposta que estava
      esperando.
    */
    listarConversas.mockRejectedValue(new Error('rede'));
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toMatch(/assim que a rede voltar, aparecem aqui/i));
    expect(textoDaTela()).not.toMatch(/nenhuma conversa ainda/i);
  });

  it('"tentar de novo" busca outra vez, e a tela se recupera', async () => {
    listarConversas.mockRejectedValueOnce(new Error('rede'));
    await abrirTela();
    await waitFor(() => expect(textoDaTela()).toMatch(/assim que a rede voltar/i));

    fireEvent.click(screen.getByText(/tentar de novo/i));

    // E entra direto na única conversa, como faria numa abertura normal.
    await waitFor(() => expect(screen.getByLabelText(/escreva sua mensagem/i)).toBeInTheDocument());
  });

  it('o vazio de verdade explica de onde vem a primeira conversa', async () => {
    // O aluno não inicia conversa: ela nasce quando o profissional escreve, e a
    // tela precisa dizer isso, senão ele procura um botão que não existe.
    listarConversas.mockResolvedValue([]);
    await abrirTela();

    await waitFor(() => expect(screen.getByText('Nenhuma conversa ainda')).toBeInTheDocument());
  });
});

describe('conversas: abrir', () => {
  it('com uma conversa só, entra direto — e marca como vista', async () => {
    // Escolher entre uma opção é passo perdido; e a marca de leitura é o que
    // apaga o aviso de mensagem nova na tela inicial.
    await abrirTela();

    await waitFor(() => expect(marcarVista).toHaveBeenCalledWith('c1'));
    expect(screen.getByLabelText(/escreva sua mensagem/i)).toBeInTheDocument();
  });

  it('com duas, escolhe — e abre exatamente a que foi tocada', async () => {
    listarConversas.mockResolvedValue([
      conversa('c1', 'Diego Personal'),
      conversa('c2', 'Eduarda Nutricionista', { naoLidas: 3 }),
    ]);
    await abrirTela();
    await waitFor(() => expect(screen.getByText('Eduarda Nutricionista')).toBeInTheDocument());
    // O contador de não lidas é o que faz a pessoa saber onde tocar.
    expect(textoDaTela()).toContain('3');

    fireEvent.click(screen.getByLabelText(/abrir conversa com eduarda/i));

    await waitFor(() => expect(mensagensDaConversa).toHaveBeenCalledWith('c2'));
    expect(marcarVista).toHaveBeenCalledWith('c2');
  });

  it('a conversa é lida de cima para baixo, da mais antiga à mais nova', async () => {
    /*
      A API entrega da mais nova para a mais antiga (é o que serve para paginar),
      e a tela inverte. Inverter errado embaralha a conversa inteira sem quebrar
      nada — e uma resposta lida antes da pergunta muda o sentido das duas.
    */
    mensagensDaConversa.mockResolvedValue({
      dados: [
        mensagem('m3', 'Pode aumentar a carga', false, '2026-09-29T12:00:00Z'),
        mensagem('m2', 'Senti o ombro puxar', true, '2026-09-29T11:00:00Z'),
        mensagem('m1', 'Como foi o treino?', false, '2026-09-29T10:00:00Z'),
      ],
    });
    await abrirTela();
    await waitFor(() => expect(textoDaTela()).toContain('Como foi o treino?'));

    const tela = textoDaTela();
    expect(tela.indexOf('Como foi o treino?')).toBeLessThan(tela.indexOf('Senti o ombro puxar'));
    expect(tela.indexOf('Senti o ombro puxar')).toBeLessThan(tela.indexOf('Pode aumentar a carga'));
  });

  it('conversa sem mensagem nenhuma diz isso, em vez de ficar em branco', async () => {
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toMatch(/ainda sem mensagens nesta conversa/i));
  });
});

describe('conversas: enviar', () => {
  it('manda o que foi escrito, e limpa o campo', async () => {
    await abrirTela();
    await waitFor(() => expect(screen.getByLabelText(/escreva sua mensagem/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/escreva sua mensagem/i), {
      target: { value: '  Ombro doeu na terceira série  ' },
    });
    fireEvent.click(screen.getByLabelText(/enviar mensagem/i));

    await waitFor(() =>
      expect(enviar).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ corpo: 'Ombro doeu na terceira série' }) as unknown,
      ),
    );
    await waitFor(() => expect(screen.getByLabelText(/escreva sua mensagem/i)).toHaveValue(''));
  });

  it('se o envio falhar, o texto VOLTA para o campo', async () => {
    /*
      Perder o que a pessoa escreveu por causa de rede é pior que o erro em si
      — e aqui o texto costuma ser um relato de dor, escrito uma vez com
      esforço. Quem reescreve, resume; quem resume, omite.
    */
    enviar.mockRejectedValue(new Error('rede'));
    await abrirTela();
    await waitFor(() => expect(screen.getByLabelText(/escreva sua mensagem/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/escreva sua mensagem/i), {
      target: { value: 'Senti uma fisgada no joelho' },
    });
    fireEvent.click(screen.getByLabelText(/enviar mensagem/i));

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível enviar/i));
    expect(screen.getByLabelText(/escreva sua mensagem/i)).toHaveValue('Senti uma fisgada no joelho');
  });

  it('espaço em branco não vira mensagem', async () => {
    await abrirTela();
    await waitFor(() => expect(screen.getByLabelText(/escreva sua mensagem/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/escreva sua mensagem/i), { target: { value: '   ' } });
    /*
      `tocar` descarrega as promessas pendentes dentro de `act`. Antes isto era
      `setTimeout(80)` — provar um negativo por soneca passa a depender de a
      máquina ser rápida o bastante, e 80 ms escolhidos a dedo são uma aposta
      que o CI perde num dia de carga. A descarga é determinística.
    */
    await tocar(screen.getByLabelText(/enviar mensagem/i));

    expect(enviar).not.toHaveBeenCalled();
  });
});
