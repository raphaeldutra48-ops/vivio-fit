import { PROJETO_SUPABASE, VivioClient } from '@vivio/sdk';

/**
 * Telas que existem justamente para quem ainda não tem sessão.
 *
 * A sessão perdida manda para /login, e estas telas não podem entrar nessa
 * regra: quem acabou de clicar no link de confirmação do e-mail, ou abriu a
 * página pública de um profissional, nunca teve sessão para perder.
 */
const ROTAS_PUBLICAS = [
  '/login',
  '/cadastrar',
  '/verificar-email',
  '/redefinir-senha',
  // Página do profissional: existe justamente para quem não tem conta.
  '/p/',
];

const emRotaPublica = (): boolean =>
  typeof window !== 'undefined' &&
  ROTAS_PUBLICAS.some((rota) => window.location.pathname.startsWith(rota));

/**
 * ## Onde a sessão fica, e o que mudou
 *
 * Antes: o refresh de 30 dias num cookie httpOnly emitido pela API, que o
 * JavaScript da página não conseguia ler — um XSS levava no máximo os 15
 * minutos do access token.
 *
 * Agora o navegador fala DIRETO com o Postgres, e o token É a credencial do
 * banco. Não existe versão disso em que o JavaScript não alcança o token: se
 * ele não alcançasse, não haveria como fazer a consulta. httpOnly e acesso
 * direto são incompatíveis, e escolher o acesso direto é escolher isto junto.
 *
 * O que dá para fazer, e está feito:
 *
 *   * o access token dura 15 minutos, como antes (`jwt_exp = 900`);
 *   * o refresh gira a cada uso e o Supabase detecta reapresentação — um
 *     refresh roubado e usado depois do legítimo derruba a sessão inteira, que
 *     é o comportamento que a API própria também tinha.
 *
 * O que piorou, dito sem rodeio: um XSS agora alcança o refresh token, e não
 * só os 15 minutos. A defesa passou a ser não ter XSS — CSP e escape — em vez
 * de conter o estrago depois.
 */
export const sdk = new VivioClient({
  supabase: {
    /*
      O padrão vem do código, e não do painel de quem constrói.

      `NEXT_PUBLIC_*` é variável de BUILD: o valor é embutido quando o
      `next build` roda. Uma configuração a mais para esquecer, num valor que
      não é segredo — a chave `anon` é pública por desenho, e quem protege os
      dados é o RLS. Esquecê-la faria o app subir sem conseguir autenticar
      ninguém.

      A variável continua ganhando quando existe: apontar para uma cópia de
      teste é só defini-la.
    */
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? PROJETO_SUPABASE.url,
    chaveAnonima: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? PROJETO_SUPABASE.chaveAnonima,
    // No servidor do Next não há onde guardar sessão, e nem deve haver: cada
    // requisição é de uma pessoa diferente.
    persistirSessao: typeof window !== 'undefined',
    urlDeRetorno:
      typeof window !== 'undefined' ? `${window.location.origin}/redefinir-senha` : undefined,
  },
  aoPerderSessao: () => {
    if (typeof window !== 'undefined' && !emRotaPublica()) {
      window.location.href = '/login';
    }
  },
});

/** Sessão encerrada: quem apaga o que ficou guardado é o próprio Supabase. */
