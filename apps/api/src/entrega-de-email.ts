/** Servidor SMTP do Resend. O usuário é a palavra `resend`, literal. */
const SMTP_RESEND = 'smtp.resend.com';
const PORTA_RESEND = 587;

/**
 * A URL de SMTP, montada a partir da chave do Resend quando é o caso.
 *
 * Existem dois caminhos de propósito. `SMTP_URL` continua valendo e é o que
 * permite trocar de provedor sem tocar em código. Mas exigir que alguém monte
 * `smtp://resend:CHAVE@smtp.resend.com:587` na mão, dentro de um campo de
 * painel, é pedir para errar — e o erro aparece como "não conecta", que é
 * indistinguível de chave errada.
 *
 * Com `RESEND_API_KEY`, quem configura só cola a chave que o Resend deu, sem
 * cirurgia de texto. O resto é sempre igual e mora aqui.
 */
export function urlDoSmtp(
  ambiente: Record<string, string | undefined> = process.env,
): string | null {
  const direta = ambiente.SMTP_URL?.trim();
  if (direta) return direta;

  const chave = ambiente.RESEND_API_KEY?.trim();
  if (!chave) return null;

  // `encodeURIComponent` porque a chave entra na parte de senha de uma URL: um
  // `@` ou `/` no meio dela quebraria a análise e o erro sairia como host
  // inválido, que não parece nada com "a chave tem um caractere especial".
  return `smtp://resend:${encodeURIComponent(chave)}@${SMTP_RESEND}:${PORTA_RESEND}`;
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

  if (!urlDoSmtp(ambiente)) {
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
