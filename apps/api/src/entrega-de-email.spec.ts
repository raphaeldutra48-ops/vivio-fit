import { describe, expect, it } from 'vitest';
import { formaDeEnvio, problemasDeEntregaDeEmail } from './entrega-de-email';

describe('formaDeEnvio', () => {
  /*
    O Resend sai por HTTP e não por SMTP porque o Railway bloqueia a saída na
    porta 587 — a tentativa morre em `Connection timeout`, que se parece com
    chave errada e não é. Custou um deploy para descobrir.
  */
  it('com a chave do Resend, a saída é HTTP', () => {
    expect(formaDeEnvio({ RESEND_API_KEY: 're_abc123' })).toEqual({
      via: 'RESEND',
      chave: 're_abc123',
    });
  });

  it('SMTP_URL explícita ganha da chave — é a saída para outro provedor', () => {
    expect(formaDeEnvio({ SMTP_URL: 'smtp://u:p@outro.com:25', RESEND_API_KEY: 're_abc' })).toEqual({
      via: 'SMTP',
      url: 'smtp://u:p@outro.com:25',
    });
  });

  it('sem nenhuma das duas, não há para onde enviar', () => {
    expect(formaDeEnvio({})).toBeNull();
    expect(formaDeEnvio({ RESEND_API_KEY: '   ', SMTP_URL: '  ' })).toBeNull();
  });

  it('espaço em volta da chave não vai junto', () => {
    expect(formaDeEnvio({ RESEND_API_KEY: '  re_abc  ' })).toEqual({
      via: 'RESEND',
      chave: 're_abc',
    });
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
