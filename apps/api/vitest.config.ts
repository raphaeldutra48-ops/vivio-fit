import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// O esbuild (padrão do Vitest) não implementa emitDecoratorMetadata, e sem isso
// a injeção de dependência do Nest não resolve os tipos. Por isso, SWC.
export default defineConfig({
  test: {
    globals: true,
    root: './',
    // `prisma/` entra porque o catálogo de exercícios e alimentos mora lá: é
    // conteúdo do produto, não script de apoio, e erra igual a código.
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts', 'prisma/**/*.spec.ts'],
    environment: 'node',
    // Decide o banco antes de qualquer import — o PrismaClient lê DATABASE_URL
    // ao ser construído, então depois já é tarde.
    setupFiles: ['./test/banco-de-teste.ts'],
    /*
      Roda UMA vez antes de tudo e recusa a suite se o banco tiver usuario de
      verdade dentro. Fica aqui, e nao no setup por arquivo, porque a pergunta
      e a mesma para os 48 e porque precisa de `await`.
    */
    globalSetup: ['./test/guarda-de-producao.ts'],
    // O Neon do plano gratuito escala a zero e fica lento sob carga; com a
    // suíte inteira, uma requisição chega a levar 10s. Margem generosa evita
    // falha por lentidão de infraestrutura sendo lida como bug.
    testTimeout: 90_000,
    hookTimeout: 90_000,
    fileParallelism: false, // testes compartilham o mesmo banco
    // O scheduler roda a cada minuto; nos testes o disparo e chamado direto,
    // com horario injetado. Ligado, ele criaria notificacoes no meio do teste.
    env: { LEMBRETES_ATIVOS: 'false' },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
