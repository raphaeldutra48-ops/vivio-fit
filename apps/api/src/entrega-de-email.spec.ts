import { describe, expect, it } from 'vitest';
import { problemasDeEntregaDeEmail, urlDoSmtp } from './entrega-de-email';

describe('urlDoSmtp', () => {
  it('monta a URL a partir da chave do Resend', () => {
    expect(urlDoSmtp({ RESEND_API_KEY: 're_abc123' })).toBe(
      'smtp://resend:re_abc123@smtp.resend.com:587',
    );
  });

  /*
    A chave entra na parte de senha de uma URL. Um `@` ou `/` no meio dela
    quebraria a análise, e o erro sairia como host inválido — que não parece
    nada com "a chave tem um caractere especial".
  */
  it('escapa caractere especial na chave', () => {
    const url = urlDoSmtp({ RESEND_API_KEY: 're_a@b/c' })!;
    expect(url).toBe('smtp://resend:re_a%40b%2Fc@smtp.resend.com:587');
    // E o resultado continua sendo uma URL que dá para analisar.
    expect(new URL(url).hostname).toBe('smtp.resend.com');
  });

  it('SMTP_URL explícita ganha da chave — é a saída para trocar de provedor', () => {
    expect(urlDoSmtp({ SMTP_URL: 'smtp://u:p@outro.com:25', RESEND_API_KEY: 're_abc' })).toBe(
      'smtp://u:p@outro.com:25',
    );
  });

  it('sem nenhuma das duas, não há para onde enviar', () => {
    expect(urlDoSmtp({})).toBeNull();
    expect(urlDoSmtp({ RESEND_API_KEY: '   ', SMTP_URL: '  ' })).toBeNull();
  });
});

const producao = {
  NODE_ENV: 'production',
  SMTP_URL: 'smtp://resend:chave@smtp.resend.com:587',
  WEB_PUBLIC_URL: 'https://app.viviofit.com.br',
};

describe('conferência de entrega de e-mail no arranque', () => {
  it('produção configurada não tem problema', () => {
    expect(problemasDeEntregaDeEmail(producao)).toEqual([]);
  });

  it('desenvolvimento nunca reclama — o driver de log é o certo lá', () => {
    expect(problemasDeEntregaDeEmail({ NODE_ENV: 'development' })).toEqual([]);
    expect(problemasDeEntregaDeEmail({})).toEqual([]);
  });

  it('produção sem nenhuma forma de enviar é erro', () => {
    const problemas = problemasDeEntregaDeEmail({ ...producao, SMTP_URL: undefined });
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain('RESEND_API_KEY');
  });

  it('só com espaço conta como ausente', () => {
    expect(problemasDeEntregaDeEmail({ ...producao, SMTP_URL: '   ' })).toHaveLength(1);
  });

  it('a chave do Resend sozinha já satisfaz o arranque', () => {
    expect(
      problemasDeEntregaDeEmail({ ...producao, SMTP_URL: undefined, RESEND_API_KEY: 're_abc' }),
    ).toEqual([]);
  });

  it('produção sem WEB_PUBLIC_URL é erro — o link sairia para localhost', () => {
    const problemas = problemasDeEntregaDeEmail({ ...producao, WEB_PUBLIC_URL: undefined });
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain('localhost');
  });

  it('WEB_PUBLIC_URL sem protocolo é erro', () => {
    const problemas = problemasDeEntregaDeEmail({
      ...producao,
      WEB_PUBLIC_URL: 'app.viviofit.com.br',
    });
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain('http://');
  });

  it('acusa os dois de uma vez, para não descobrir um por deploy', () => {
    expect(
      problemasDeEntregaDeEmail({ NODE_ENV: 'production' }),
    ).toHaveLength(2);
  });

  /*
    A escapatória existe para o intervalo entre subir a API e contratar o
    provedor. Ela é explícita justamente para aparecer na lista de variáveis
    de quem for olhar — o contrário de uma falha silenciosa.
  */
  it('EMAIL_SEM_ENTREGA=true assume a escolha e deixa subir', () => {
    expect(
      problemasDeEntregaDeEmail({ NODE_ENV: 'production', EMAIL_SEM_ENTREGA: 'true' }),
    ).toEqual([]);
  });

  it('qualquer valor que não seja exatamente "true" não libera', () => {
    for (const valor of ['1', 'sim', 'TRUE', 'yes', '']) {
      expect(
        problemasDeEntregaDeEmail({ NODE_ENV: 'production', EMAIL_SEM_ENTREGA: valor }),
      ).toHaveLength(2);
    }
  });
});
