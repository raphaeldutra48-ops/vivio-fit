import { senhaDaSemente } from '../../banco/prisma/senha-da-semente';

/**
 * A senha das contas da semente, para as provas que entram nelas.
 *
 * Vem de `SENHA_DA_SEMENTE`, em `packages/banco/.env.supabase` — o mesmo
 * arquivo das chaves, carregado pelo `preparo.ts`. Ela era escrita aqui, em
 * texto, em ~150 lugares; o repositório é público e uma das contas é o
 * administrador. Ver `packages/banco/prisma/senha-da-semente.ts`.
 *
 * Só é exigida quando a suíte vai de fato falar com o Supabase. Sem as chaves
 * as provas se pulam sozinhas, e cobrar a senha nesse caso faria o arquivo
 * quebrar em vez de pular.
 */
const vaiFalarComOSupabase = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE,
);

export const SENHA_DA_SEMENTE: string = vaiFalarComOSupabase ? senhaDaSemente() : '';
