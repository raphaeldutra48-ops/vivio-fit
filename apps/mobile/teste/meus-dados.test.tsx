import { obterTema } from '@vivio/ui-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Meus dados — altura e sexo biológico, os dois opcionais.
 *
 * Dois campos, e os dois delicados por motivos diferentes. O sexo biológico é
 * dado sensível pedido num app de treino: sem dizer para que serve, é o tipo de
 * pergunta que faz alguém desinstalar — então a tela explicar o porquê É a
 * funcionalidade, e não enfeite.
 *
 * A altura tinha um defeito silencioso e cruel: `Number('1,75')` — o que se
 * digita pensando em metros — dá `NaN`, que o JSON manda como `null`, e `null`
 * aqui significa LIMPAR. Quem tentava corrigir a altura APAGAVA a que estava
 * gravada, sem nada na tela dizendo isso. E a altura entra na conta da taxa
 * metabólica, que decide o alvo calórico do plano alimentar.
 */
const meuPerfil = vi.fn();
const atualizarPerfil = vi.fn();

vi.mock('../src/sdk', () => ({
  sdk: {
    me: {
      perfil: (...a: unknown[]) => meuPerfil(...a),
      atualizarPerfil: (...a: unknown[]) => atualizarPerfil(...a),
    },
  },
}));

const usuario = { id: 'aluna-1', nome: 'Ana Souza', email: 'ana@exemplo.com', papel: 'ALUNO' };
const sessao = { tema: obterTema('claro'), nomeDoTema: 'claro', usuario, carregando: false };
vi.mock('../src/sessao', () => ({ useSessao: () => sessao }));

const perfil = (extras: Record<string, unknown> = {}) => ({
  id: 'aluna-1',
  nome: 'Ana Souza',
  email: 'ana@exemplo.com',
  telefone: '11999990000',
  papel: 'ALUNO',
  aluno: { alturaCm: 168, sexoBiologico: 'F' },
  ...extras,
});

const textoDaTela = () => document.body.textContent ?? '';

async function abrirTela() {
  const { default: Perfil } = await import('../app/perfil');
  return render(<Perfil />);
}

const enviado = () => (atualizarPerfil.mock.calls[0] as [Record<string, unknown>])[0];

beforeEach(() => {
  meuPerfil.mockResolvedValue(perfil());
  atualizarPerfil.mockImplementation(() => Promise.resolve(perfil()));
});

describe('meus dados', () => {
  it('abre com o que já está gravado', async () => {
    await abrirTela();

    await waitFor(() => expect(screen.getByLabelText(/altura em centímetros/i)).toHaveValue('168'));
    expect(textoDaTela()).toContain('ana@exemplo.com');
  });

  it('diz PARA QUE serve o sexo biológico, antes de perguntar', async () => {
    /*
      Dado sensível pedido sem motivo num app de treino é razão legítima para
      alguém fechar o app. O texto não é gentileza: é o que torna a pergunta
      respondível.
    */
    await abrirTela();

    await waitFor(() =>
      expect(screen.getByText('Para calcular seu gasto calórico')).toBeInTheDocument(),
    );
  });

  it('"1,75" NÃO apaga a altura gravada — é recusado com a unidade na frase', async () => {
    /*
      O defeito que esta prova fixa. `Number('1,75')` é NaN, o JSON manda `null`,
      e `null` aqui LIMPA a altura. A pessoa mexia na altura e saía sem nenhuma —
      e a taxa metabólica passava a ser calculada sem ela, mudando o alvo
      calórico do plano alimentar.
    */
    await abrirTela();
    await waitFor(() => expect(screen.getByLabelText(/altura em centímetros/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/altura em centímetros/i), { target: { value: '1,75' } });
    fireEvent.click(screen.getByLabelText(/salvar meus dados/i));

    await waitFor(() => expect(textoDaTela()).toMatch(/175, e não 1,75/i));
    expect(atualizarPerfil).not.toHaveBeenCalled();
  });

  it('altura fora da faixa humana também é recusada', async () => {
    // Um dígito a mais (1750) passaria pelo `Number` e só o servidor barraria,
    // com uma frase que não diz qual campo.
    await abrirTela();
    await waitFor(() => expect(screen.getByLabelText(/altura em centímetros/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/altura em centímetros/i), { target: { value: '1750' } });
    fireEvent.click(screen.getByLabelText(/salvar meus dados/i));

    await waitFor(() => expect(textoDaTela()).toMatch(/de 80 a 260/i));
    expect(atualizarPerfil).not.toHaveBeenCalled();
  });

  it('altura válida vai como número inteiro de centímetros', async () => {
    await abrirTela();
    await waitFor(() => expect(screen.getByLabelText(/altura em centímetros/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/altura em centímetros/i), { target: { value: '172' } });
    fireEvent.click(screen.getByLabelText(/salvar meus dados/i));

    await waitFor(() => expect(atualizarPerfil).toHaveBeenCalled());
    expect(enviado().alturaCm).toBe(172);
  });

  it('campo vazio LIMPA a altura — isso é intencional', async () => {
    /*
      A diferença que o defeito apagava: vazio é "apaga o que eu preenchi por
      engano", e texto ilegível é "não entendi o que você escreveu". Os dois
      chegavam como `null`.
    */
    await abrirTela();
    await waitFor(() => expect(screen.getByLabelText(/altura em centímetros/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/altura em centímetros/i), { target: { value: '' } });
    fireEvent.click(screen.getByLabelText(/salvar meus dados/i));

    await waitFor(() => expect(atualizarPerfil).toHaveBeenCalled());
    expect(enviado().alturaCm).toBeNull();
  });

  it('trocar o sexo biológico vai junto, e só quando salvo', async () => {
    await abrirTela();
    await waitFor(() => expect(screen.getByLabelText('Masculino')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Masculino'));
    expect(atualizarPerfil).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(/salvar meus dados/i));

    await waitFor(() => expect(atualizarPerfil).toHaveBeenCalled());
    expect(enviado().sexoBiologico).toBe('M');
  });

  it('falha ao carregar não deixa a tela girando para sempre', async () => {
    // Sem a mensagem, a roda de carregamento fica eterna — e a pessoa fica
    // esperando algo que não vem.
    meuPerfil.mockRejectedValue(new Error('rede'));
    await abrirTela();

    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar seus dados.')).toBeInTheDocument(),
    );
  });

  it('se não salvar, a tela não diz que salvou', async () => {
    atualizarPerfil.mockRejectedValue(new Error('rede'));
    await abrirTela();
    await waitFor(() => expect(screen.getByLabelText(/altura em centímetros/i)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/salvar meus dados/i));

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível salvar/i));
  });
});
