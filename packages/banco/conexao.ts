/**
 * A URL do Postgres que as ferramentas e as suítes deste pacote usam.
 *
 * ## Por que o POOLER vem primeiro
 *
 * O host direto do Supabase (`db.<ref>.supabase.co`) responde **só em IPv6** —
 * ele não tem registro A, só AAAA. Numa rede sem IPv6 o banco fica inalcançável
 * e o erro que aparece é `Can't reach database server`, que se lê como "banco
 * fora do ar" quando o banco está perfeitamente de pé. Foi o que aconteceu em
 * 25/09/2026: o site seguia no ar (fala HTTPS, IPv4, com o PostgREST) e a suíte
 * de banco não achava teste nenhum, porque o guarda de produção morria antes de
 * coletar os arquivos.
 *
 * O pooler (`...pooler.supabase.com`) tem IPv4 e atende em **modo sessão**, que
 * se comporta como conexão comum: transação, DDL e as regras de acesso passam
 * por ele sem ajuste.
 *
 * ## A ordem é a escolha de quem roda
 *
 * Definir só `SUPABASE_DIRECT_URL` continua funcionando onde há IPv6 — nada
 * obriga o pooler. Ele só é preferido quando existe, porque é o caminho que
 * funciona nas duas redes.
 */
export function urlDoBanco(): string {
  const url =
    process.env.SUPABASE_POOLER_URL ??
    process.env.SUPABASE_DIRECT_URL ??
    process.env.DIRECT_URL ??
    process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      'Falta a URL do banco: defina SUPABASE_POOLER_URL (recomendado, tem IPv4) ' +
        'ou SUPABASE_DIRECT_URL em packages/banco/.env.supabase.',
    );
  }
  return url;
}
