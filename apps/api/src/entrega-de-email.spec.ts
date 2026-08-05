import { describe, expect, it } from 'vitest';
import { problemasDeEntregaDeEmail } from './entrega-de-email';

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

  it('produção sem SMTP_URL é erro', () => {
    const problemas = problemasDeEntregaDeEmail({ ...producao, SMTP_URL: undefined });
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain('SMTP_URL');
  });

  it('SMTP_URL só com espaço conta como ausente', () => {
    expect(problemasDeEntregaDeEmail({ ...producao, SMTP_URL: '   ' })).toHaveLength(1);
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
