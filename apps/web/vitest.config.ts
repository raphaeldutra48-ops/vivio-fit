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
    // Irmão do `afterEach(cleanup)` do preparo: sem isto o histórico de
    // chamadas de um `vi.fn()` sobra para o teste seguinte, e um
    // `mock.calls[0]` passa a ler o envio do teste anterior — que foi
    // exatamente como o teste da vírgula decimal "provou" 120 g em vez de
    // 152,5. As implementações não são tocadas; quem define `mockResolvedValue`
    // num `beforeEach` continua valendo.
    clearMocks: true,
    setupFiles: ['./teste/preparo.ts'],
  },
});
