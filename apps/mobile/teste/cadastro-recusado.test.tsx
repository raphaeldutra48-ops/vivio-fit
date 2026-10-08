import { ErroApi } from '@vivio/sdk';
import { obterTema } from '@vivio/ui-native';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderizar, tocar } from './preparo';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O que a tela de cadastro do aplicativo diz quando o servidor recusa.
 *
 * É o primeiro teste do aplicativo, e o assunto não foi escolhido por
 * conveniência: em 28/09 o cadastro bateu no limite de envio de e-mail do
 * Supabase (429, `over_email_send_rate_limit`) e a tela respondeu **"Sem conexão.
 * Verifique a internet e tente de novo."** A pessoa tem internet; o servidor
 * respondeu "espere". Mandar mexer no wi-fi faz perder tempo no lugar errado e
 * esconde a causa de nós — quem "não conseguiu se cadastrar por causa da
 * internet" nunca abre um pedido de suporte que chegue ao limite de e-mail.
 *
 * A correção foi feita nas duas interfaces no mesmo dia; a da web nasceu com
 * quatro casos de teste e a do aplicativo com nenhum, porque ele não tinha suíte.
 * Este arquivo fecha essa assimetria: as duas telas provam a mesma regra.
 */
const registrarAluno = vi.fn();

vi.mock('../src/sdk', () => ({
  sdk: { auth: { registrarAluno: (...a: unknown[]) => registrarAluno(...a) } },
}));

vi.mock('../src/sessao', () => ({
  useSessao: () => ({ tema: obterTema('claro'), usuario: null, carregando: false }),
}));

/** Preenche o formulário com dados válidos e envia. */
async function preencherEEnviar(): Promise<void> {
  const { default: Cadastrar } = await import('../app/cadastrar');
  await renderizar(<Cadastrar />);

  const campos = document.querySelectorAll('input');
  // Nome, e-mail, senha e data de nascimento, na ordem em que a tela pede.
  fireEvent.change(campos[0]!, { target: { value: 'Fulana de Teste' } });
  fireEvent.change(campos[1]!, { target: { value: 'fulana@exemplo.com' } });
  fireEvent.change(campos[2]!, { target: { value: 'Senha@123' } });
  fireEvent.change(campos[3]!, { target: { value: '31/12/1990' } });

  await tocar(screen.getByText('Criar conta'));
}

beforeEach(() => {
  registrarAluno.mockReset();
});

describe('cadastro do aluno recusado pelo servidor', () => {
  it('limite de envio de e-mail: diz o que o servidor disse, e não "verifique a internet"', async () => {
    registrarAluno.mockRejectedValue(
      new ErroApi('LIMITE_EXCEDIDO', 'Muitas tentativas. Espere um pouco e tente de novo.', 429),
    );

    await preencherEEnviar();

    await waitFor(() => expect(screen.getByText(/muitas tentativas/i)).toBeInTheDocument());
    // O par que importa: a frase falsa não pode aparecer.
    expect(screen.queryByText(/verifique a internet/i)).not.toBeInTheDocument();
  });

  it('sem rede de verdade: aí sim a frase é sobre a internet', async () => {
    registrarAluno.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'Falha de rede.', 0));

    await preencherEEnviar();

    await waitFor(() => expect(screen.getByText(/verifique a internet/i)).toBeInTheDocument());
  });

  it('servidor com defeito (5xx) não vira acusação à internet de quem usa', async () => {
    registrarAluno.mockRejectedValue(new ErroApi('ERRO_INTERNO', 'Falhou.', 500));

    await preencherEEnviar();

    await waitFor(() =>
      expect(screen.getByText(/servidor não conseguiu responder/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/verifique a internet/i)).not.toBeInTheDocument();
  });

  it('e-mail já cadastrado manda entrar, em vez de pedir para tentar de novo', async () => {
    registrarAluno.mockRejectedValue(
      new ErroApi('EMAIL_JA_CADASTRADO', 'Este e-mail já está cadastrado.', 409),
    );

    await preencherEEnviar();

    await waitFor(() => expect(screen.getByText(/já tem conta/i)).toBeInTheDocument());
  });

  it('cadastro aceito troca a tela pelo aviso de confirmar o e-mail', async () => {
    /*
      O caso positivo, e ele importa: sem confirmação de e-mail não há login, e
      uma tela que só limpasse o formulário deixaria a pessoa esperando um
      aplicativo que nunca abre.
    */
    registrarAluno.mockResolvedValue(undefined);

    await preencherEEnviar();

    await waitFor(() => expect(registrarAluno).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Criar conta')).not.toBeInTheDocument();
  });
});
