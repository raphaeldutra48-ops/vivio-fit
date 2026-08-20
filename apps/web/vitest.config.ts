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
    /*
      20 s, e não os 5 s padrão.

      Quatro testes que digitam com `userEvent.type` estouravam o padrão em
      máquina lenta — um deles chegou a asseverar "oHfiipaertrofia", que são as
      letras de "Hipertrofia" intercaladas fora de ordem pela corrida entre o
      teclado simulado e o re-render. Nenhum era defeito de produto, mas a suíte
      ficava vermelha e, vermelha por ruído, deixa de servir como portão: quem
      vê falha que "sempre falha" para de olhar.
    */
    testTimeout: 20_000,
    setupFiles: ['./teste/preparo.ts'],
  },
});
