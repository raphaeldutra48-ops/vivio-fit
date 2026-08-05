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

  if (!ambiente.SMTP_URL?.trim()) {
    problemas.push(
      'SMTP_URL não configurada: o e-mail de confirmação só iria para o log e ninguém conseguiria ativar a conta.',
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
