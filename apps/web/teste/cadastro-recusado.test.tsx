import { ErroApi } from '@vivio/sdk';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O que a tela de cadastro diz quando o servidor recusa.
 *
 * Achado operando o app em 28/09: o cadastro bateu no limite de envio de e-mail
 * do Supabase (429, `over_email_send_rate_limit`) e a tela respondeu **"Sem
 * conexão com o servidor. Verifique a internet e tente de novo."**
 *
 * A pessoa tem internet. O servidor respondeu, e o que ele disse foi "espere".
 * Mandar mexer no wi-fi é fazer perder tempo no lugar errado — e, pior, esconde
 * de nós a causa real: alguém que "não conseguiu se cadastrar por causa da
 * internet" nunca abre um pedido de suporte que chegue ao limite de e-mail.
 *
 * A tela de login já tratava isso certo. Este arquivo existe para que as duas
 * não voltem a divergir.
 */
const registrarProfissional = vi.fn();

vi.mock('../lib/sdk', () => ({
  sdk: { auth: { registrarProfissional: (...a: unknown[]) => registrarProfissional(...a) } },
}));

async function preencherEEnviar() {
  const { default: Cadastrar } = await import('../app/cadastrar/page');
  render(<Cadastrar />);

  await userEvent.type(screen.getByLabelText(/nome completo/i), 'Fulana de Teste');
  await userEvent.type(screen.getByLabelText(/e-mail/i), 'fulana@exemplo.com');
  await userEvent.type(screen.getByLabelText(/^senha$/i), 'Senha@123');
  await userEvent.type(screen.getByLabelText(/registro no/i), '012345');
  await userEvent.click(screen.getByRole('button', { name: /criar conta/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cadastro recusado pelo servidor', () => {
  it('limite de envio de e-mail: diz o que o servidor disse, e não "verifique a internet"', async () => {
    registrarProfissional.mockRejectedValue(
      new ErroApi('LIMITE_EXCEDIDO', 'Muitas tentativas. Espere um pouco e tente de novo.', 429),
    );

    await preencherEEnviar();

    await waitFor(() => expect(screen.getByText(/muitas tentativas/i)).toBeInTheDocument());
    // O par que importa: a frase falsa não pode aparecer.
    expect(screen.queryByText(/verifique a internet/i)).not.toBeInTheDocument();
  });

  it('sem rede de verdade: aí sim a frase é sobre a internet', async () => {
    registrarProfissional.mockRejectedValue(
      new ErroApi('ERRO_DE_REDE', 'Falha de rede.', 0),
    );

    await preencherEEnviar();

    await waitFor(() => expect(screen.getByText(/verifique a internet/i)).toBeInTheDocument());
  });

  it('servidor com defeito (5xx) não vira acusação à internet de quem usa', async () => {
    registrarProfissional.mockRejectedValue(new ErroApi('ERRO_INTERNO', 'Falhou.', 500));

    await preencherEEnviar();

    await waitFor(() => expect(screen.getByText(/servidor não conseguiu responder/i)).toBeInTheDocument());
    expect(screen.queryByText(/verifique a internet/i)).not.toBeInTheDocument();
  });

  it('e-mail já cadastrado continua mandando para a entrada', async () => {
    registrarProfissional.mockRejectedValue(
      new ErroApi('EMAIL_JA_CADASTRADO', 'Este e-mail já está cadastrado.', 409),
    );

    await preencherEEnviar();

    // Específico: o rodapé da tela também diz "Já tem conta? Entrar".
    await waitFor(() =>
      expect(screen.getByText(/Este e-mail já tem conta\. Tente entrar\./i)).toBeInTheDocument(),
    );
  });
});
