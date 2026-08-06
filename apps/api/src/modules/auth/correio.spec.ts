import { afterEach, describe, expect, it, vi } from 'vitest';
import { enviarPelaApiDoResend, type Email } from './correio';

/**
 * O envio de produção passa por aqui. Antes ia por SMTP, e a troca para HTTP
 * veio de uma falha real: o Railway bloqueia a saída na porta 587, e a tentativa
 * morria em `Connection timeout` — que se parece com chave errada e não é.
 *
 * O que estes testes protegem é o **diagnóstico**. Quem configura precisa saber
 * qual dos dois problemas tem, porque os consertos são diferentes: chave errada
 * se resolve no Resend, domínio não verificado se resolve no DNS.
 */

const EMAIL: Email = {
  para: 'aluno@exemplo.com',
  assunto: 'Confirme seu e-mail',
  texto: 'Olá.',
  html: '<p>Olá.</p>',
};

const CHAVE = 're_chave_secreta_123';
const REMETENTE = 'Vívio Fit <nao-responda@viviofit.com.br>';

function responder(status: number, corpo: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => corpo,
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('envio pela API do Resend', () => {
  it('devolve o id quando o Resend aceita', async () => {
    responder(200, { id: 'abc-123' });

    const r = await enviarPelaApiDoResend(CHAVE, REMETENTE, EMAIL);

    expect(r).toEqual({ id: 'abc-123', erro: null });
  });

  it('manda a chave no cabeçalho e a mensagem no corpo', async () => {
    responder(200, { id: 'abc-123' });

    await enviarPelaApiDoResend(CHAVE, REMETENTE, EMAIL);

    const [url, opcoes] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect((opcoes as RequestInit).method).toBe('POST');
    expect((opcoes as { headers: Record<string, string> }).headers.Authorization).toBe(
      `Bearer ${CHAVE}`,
    );

    const corpo = JSON.parse((opcoes as { body: string }).body);
    expect(corpo).toEqual({
      from: REMETENTE,
      // Lista, e não string: é o formato que a API espera.
      to: ['aluno@exemplo.com'],
      subject: 'Confirme seu e-mail',
      text: 'Olá.',
      html: '<p>Olá.</p>',
    });
  });

  /*
    Os dois erros que de fato acontecem em produção. A mensagem do Resend é o
    que distingue um do outro — o status sozinho não diz nada útil.
  */
  it('repassa "domínio não verificado" com a mensagem do provedor', async () => {
    responder(403, { name: 'validation_error', message: 'The viviofit.com.br domain is not verified' });

    const { id, erro } = await enviarPelaApiDoResend(CHAVE, REMETENTE, EMAIL);

    expect(id).toBeNull();
    expect(erro).toContain('403');
    expect(erro).toContain('domain is not verified');
  });

  it('repassa "chave inválida"', async () => {
    responder(401, { name: 'validation_error', message: 'API key is invalid' });

    const { erro } = await enviarPelaApiDoResend(CHAVE, REMETENTE, EMAIL);

    expect(erro).toContain('API key is invalid');
  });

  it('resposta de erro sem corpo legível ainda diz o status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('não é JSON');
        },
      }),
    );

    const { erro } = await enviarPelaApiDoResend(CHAVE, REMETENTE, EMAIL);

    expect(erro).toContain('502');
  });

  it('rede fora do ar vira erro, não exceção', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND')));

    const { id, erro } = await enviarPelaApiDoResend(CHAVE, REMETENTE, EMAIL);

    expect(id).toBeNull();
    expect(erro).toContain('api.resend.com');
  });

  /*
    O erro vai para o log do contêiner, que várias pessoas leem. A chave nunca
    pode chegar lá — foi para isso que a ferramenta de teste imprime `resend:***`
    em vez da URL inteira, e o mesmo vale aqui.
  */
  it('a chave nunca aparece na mensagem de erro', async () => {
    responder(401, { message: 'API key is invalid' });
    const { erro } = await enviarPelaApiDoResend(CHAVE, REMETENTE, EMAIL);
    expect(erro).not.toContain(CHAVE);

    // O caso que motivou a censura: o texto da exceção vem de fora e pode
    // conter o cabeçalho inteiro. Não dá para controlar o que o provedor
    // escreve — dá para não repassar.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(`falhou usando ${CHAVE}`)));
    const rede = await enviarPelaApiDoResend(CHAVE, REMETENTE, EMAIL);
    expect(rede.erro).not.toContain(CHAVE);
    expect(rede.erro).toContain('***');
  });
});
