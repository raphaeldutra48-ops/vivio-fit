import { defineConfig } from 'vitest/config';

export default defineConfig({
  // `jsx: preserve` no tsconfig é o que o Next precisa, mas o esbuild do Vitest
  // não sabe o que fazer com JSX preservado. 'automatic' aqui vale só para o
  // teste e não muda em nada o build.
  esbuild: { jsx: 'automatic' },
  test: {
    // jsdom só onde há componente para renderizar: montá-lo para um teste de
    // lógica pura custa mais que o teste inteiro.
    environment: 'node',
    environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']],
    globals: false,
    setupFiles: ['./teste/preparo.ts'],
  },
});
