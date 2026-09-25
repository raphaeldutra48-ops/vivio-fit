import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    // `prisma/` entra porque o catálogo de exercícios e alimentos mora lá: é
    // conteúdo do produto, não script de apoio, e erra igual a código.
    include: [
      'teste/**/*.spec.ts',
      'ferramentas/**/*.spec.ts',
      'regras/**/*.spec.ts',
      'prisma/**/*.spec.ts',
    ],
    environment: 'node',
    // Decide o banco antes de qualquer import — o PrismaClient lê DATABASE_URL
    // ao ser construído, então depois já é tarde.
    setupFiles: ['./teste/banco-de-teste.ts'],
    /*
      Roda UMA vez antes de tudo e recusa a suíte se o banco tiver usuário de
      verdade dentro. Fica aqui, e não no setup por arquivo, porque a pergunta
      é a mesma para todos e porque precisa de `await`.
    */
    globalSetup: ['./teste/guarda-de-producao.ts'],
    /*
      Zero teste é FALHA, e não sucesso silencioso.

      Em 25/09 o guarda de produção não alcançou o banco (o host direto do
      Supabase só responde em IPv6, e a rede estava sem), e a suíte terminou
      dizendo "no tests" — nenhuma falha vermelha, nenhum teste rodado, nada
      provado. Explícito aqui para que isso nunca volte a parecer aprovação.
    */
    passWithNoTests: false,
    testTimeout: 90_000,
    hookTimeout: 90_000,
    fileParallelism: false, // os testes de regra compartilham o mesmo banco
  },
});
