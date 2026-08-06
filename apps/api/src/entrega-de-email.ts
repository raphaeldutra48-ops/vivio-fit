/**
 * Por onde a mensagem sai.
 *
 * O Resend vai por **HTTP**, e não por SMTP, por um motivo aprendido em
 * produção: o Railway bloqueia a saída na porta 587, e a tentativa morre em
 * `Connection timeout` — que se parece com chave errada e não é. A API HTTP usa
 * a 443, que nenhuma plataforma bloqueia porque é a mesma do resto da internet.
 *
 * `SMTP_URL` continua existindo e ganha da chave quando as duas estão postas:
 * é a saída para outro provedor sem tocar em código. Em plataforma que bloqueia
 * porta de e-mail ela não vai funcionar — mas isso é escolha de quem a definir,
 * e o diagnóstico está escrito na ferramenta de teste.
 */
export type FormaDeEnvio =
  | { via: 'RESEND'; chave: string }
  | { via: 'SMTP'; url: string };

export function formaDeEnvio(
  ambiente: Record<string, string | undefined> = process.env,
): FormaDeEnvio | null {
  const url = ambiente.SMTP_URL?.trim();
  if (url) return { via: 'SMTP', url };

  const chave = ambiente.RESEND_API_KEY?.trim();
  if (chave) return { via: 'RESEND', chave };

  return null;
}

/**
 * Confere, no arranque, se o e-mail de confirmação realmente chega em alguém.
 *
 * Esta é uma falha que não aparece em lugar nenhum quando acontece. Sem
 * `SMTP_URL`, o driver de log imprime a mensagem no console do contêiner: o
 * cadastro responde 201, a conta fica gravada, a tela diz "confira sua caixa
 * de entrada" — e não há caixa de entrada nenhuma. Ninguém novo entra no app,
 * e o sintoma chega como "o site não funciona", dias depois.
 *
 * O mesmo vale para `WEB_PUBLIC_URL`: sem ela o link cai no padrão de
 * desenvolvimento e o e-mail sai com `http://localhost:3000/verificar-email`,
 * que na máquina de quem recebeu não é lugar nenhum.
 *
 * Por isso o bootstrap trata os dois como erro fatal em produção — a não ser
 * que alguém declare `EMAIL_SEM_ENTREGA=true`. A escapatória existe para o
 * intervalo entre subir a API e contratar o provedor, e é explícita de
 * propósito: assumir a escolha é diferente de descobri-la por acidente.
 */
export function problemasDeEntregaDeEmail(
  ambiente: Record<string, string | undefined> = process.env,
): string[] {
  if (ambiente.NODE_ENV !== 'production') return [];
  if (ambiente.EMAIL_SEM_ENTREGA === 'true') return [];

  const problemas: string[] = [];

  if (!formaDeEnvio(ambiente)) {
    problemas.push(
      'Sem RESEND_API_KEY nem SMTP_URL: o e-mail de confirmação só iria para o log e ninguém conseguiria ativar a conta.',
    );
  }

  const web = ambiente.WEB_PUBLIC_URL?.trim();
  if (!web) {
    problemas.push('WEB_PUBLIC_URL não configurada: o link de confirmação sairia apontando para localhost.');
  } else if (!/^https?:\/\//.test(web)) {
    problemas.push(`WEB_PUBLIC_URL precisa começar com http:// ou https:// — está "${web}".`);
  }

  return problemas;
}
