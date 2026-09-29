import { defineConfig } from 'vitest/config';

/**
 * A primeira suíte do aplicativo.
 *
 * Ele tinha 24 telas e **zero teste** — era a pendência 14b, e ela cobrou o preço
 * em 28/09: a correção da tela de cadastro (o limite de e-mail do Supabase
 * aparecendo como "verifique a internet") foi feita sem nenhuma prova, enquanto a
 * mesma correção na web nasceu com quatro casos.
 *
 * ## Por que `react-native-web`, e não um ambiente nativo
 *
 * Provar componente React Native de verdade exige emulador ou o runtime do Jest
 * com o preset do Expo — peso que não se paga para provar FIAÇÃO de tela: qual
 * texto aparece, qual chamada é feita, o que a tela diz quando o servidor recusa.
 *
 * O apelido de `react-native` para `react-native-web` é exatamente o que o
 * `expo start --web` faz, e foi por esse caminho que o aplicativo foi operado na
 * auditoria. O que ele NÃO cobre fica dito: gesto, layout nativo, permissão de
 * câmera e módulo nativo não têm substituto a um aparelho de verdade.
 */
export default defineConfig({
  /*
    `react-jsx` do `expo/tsconfig.base` é o que o Metro precisa; o esbuild do
    Vitest precisa ser mandado explicitamente. Vale só para o teste — é a mesma
    linha que a suíte da web tem, pelo mesmo motivo.
  */
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: [{ find: /^react-native$/, replacement: 'react-native-web' }],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    /*
      As três terminações, e isto já custou: o primeiro `*.test.ts` (sem o `x`)
      ficou de fora do padrão e a suíte rodou 17 provas como se fossem todas,
      sem acusar nada. Arquivo de teste que não roda é pior que arquivo que
      falha — ele conta como cobertura e não cobre.
    */
    include: ['teste/**/*.test.ts', 'teste/**/*.test.tsx', 'teste/**/*.spec.ts'],
    setupFiles: ['./teste/preparo.ts'],
    /*
      Sem isto o histórico de chamadas de um `vi.fn()` sobra para o teste
      seguinte, e um `mock.calls[0]` passa a ler o envio do teste anterior. A
      suíte da web aprendeu isso com um teste que "provou" o número errado.
    */
    clearMocks: true,
    // Teclado simulado em máquina lenta estoura os 5 s padrão, e suíte vermelha
    // por ruído deixa de servir como portão.
    testTimeout: 20_000,
    // Zero teste é falha: suíte que não roda nada não aprova nada.
    passWithNoTests: false,
  },
});
