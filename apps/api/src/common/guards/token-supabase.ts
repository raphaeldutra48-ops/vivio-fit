import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Aceita o token do Supabase Auth enquanto a API ainda existe.
 *
 * ## Isto é código com data para morrer, e é de propósito
 *
 * A autenticação já migrou: quem faz login é o Supabase, e é o token dele que
 * as telas passam a carregar. Os dados, não — são 177 rotas, e elas saem por
 * grupos, com o app no ar.
 *
 * Entre uma coisa e outra, o SDK manda um token que a API não emitiu. Sem isto
 * a migração teria de ser um dia de virada: as 177 rotas de uma vez, num app
 * de saúde com gente usando. Trinta linhas descartáveis compram o direito de
 * ir por partes, e some junto com `apps/api`.
 *
 * ## Por que JWKS e não um segredo compartilhado
 *
 * O projeto assina com ES256, que é assimétrico: existe uma chave pública, e é
 * só ela que precisa chegar aqui. Um segredo compartilhado colocaria a chave
 * capaz de FORJAR token dentro de mais um lugar — e mais um lugar é mais uma
 * variável de ambiente para vazar.
 *
 * A chave é buscada uma vez e guardada pelo `jose`, com rotação automática:
 * quando o Supabase troca a chave de assinatura, a próxima verificação que
 * falhar por chave desconhecida faz o `jose` buscar de novo sozinho.
 */
export interface PayloadSupabase {
  /** O id do Auth (uuid). Não é o nosso, para quem foi criado antes. */
  sub: string;
  /** O nosso id, posto pelo hook `token_com_id_vivio` a cada login. */
  vivio_id?: string;
  vivio_papel?: string;
  email?: string;
}

let chaves: ReturnType<typeof createRemoteJWKSet> | null = null;

function conjuntoDeChaves(urlProjeto: string): ReturnType<typeof createRemoteJWKSet> {
  chaves ??= createRemoteJWKSet(new URL(`${urlProjeto.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`));
  return chaves;
}

/**
 * Devolve o payload, ou `null` se o token não for do Supabase.
 *
 * `null` e não exceção: quem chama tenta o token antigo em seguida, e um token
 * legítimo de qualquer um dos dois lados precisa passar enquanto os dois
 * existirem.
 */
export async function verificarTokenSupabase(
  token: string,
  urlProjeto: string,
): Promise<PayloadSupabase | null> {
  try {
    const { payload } = await jwtVerify(token, conjuntoDeChaves(urlProjeto), {
      // O emissor é o próprio projeto. Sem isto, um token assinado por outro
      // projeto Supabase qualquer entraria — e o `aud` sozinho não distingue,
      // porque "authenticated" é o mesmo em todos eles.
      issuer: `${urlProjeto.replace(/\/$/, '')}/auth/v1`,
      audience: 'authenticated',
    });
    return payload as unknown as PayloadSupabase;
  } catch {
    return null;
  }
}

/** Só para teste: esquece a chave guardada. */
export function esquecerChaves(): void {
  chaves = null;
}
