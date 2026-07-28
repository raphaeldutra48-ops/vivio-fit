import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// O esbuild (padrão do Vitest) não implementa emitDecoratorMetadata, e sem isso
// a injeção de dependência do Nest não resolve os tipos. Por isso, SWC.
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false, // testes compartilham o mesmo banco
    // O scheduler roda a cada minuto; nos testes o disparo e chamado direto,
    // com horario injetado. Ligado, ele criaria notificacoes no meio do teste.
    env: { LEMBRETES_ATIVOS: 'false' },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
