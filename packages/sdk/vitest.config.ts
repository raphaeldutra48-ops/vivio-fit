import { defineConfig } from 'vitest/config';

/**
 * A suíte do SDK fala com o Supabase de verdade.
 *
 * Não há o que simular aqui que valha a pena: o que está sob teste é
 * exatamente a conversa com o PostgREST e com as políticas — token, embed de
 * chave estrangeira, forma da linha que volta. Um dublê provaria só que o
 * dublê concorda com o que eu imaginei.
 *
 * Sem as variáveis do Supabase os testes se PULAM sozinhos, em vez de falharem
 * e parecerem defeito. Quem clona o repositório e roda `pnpm test` vê zero
 * falha; quem tem o `.env.supabase` vê a suíte inteira.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['teste/**/*.spec.ts'],
    setupFiles: ['./teste/preparo.ts'],
    // Rede e banco de verdade: o padrão de 5 s não cabe.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Os testes compartilham o mesmo banco.
    fileParallelism: false,
  },
});
