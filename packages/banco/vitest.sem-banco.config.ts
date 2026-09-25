import { defineConfig } from 'vitest/config';

/**
 * As provas deste pacote que NÃO precisam do Postgres.
 *
 *   pnpm --filter @vivio/banco test:sem-banco
 *
 * Existe para a verificação automática do GitHub. A configuração padrão tem
 * `globalSetup` que fala com o banco (o guarda que recusa rodar contra base com
 * gente de verdade dentro) e `setupFiles` que decide a URL — as duas coisas
 * certas para rodar aqui, e impossíveis sem credencial no CI.
 *
 * O corte não é por conveniência: as onze provas incluídas são de decisão pura
 * (o divisor de comandos SQL, as regras de alerta, o escopo por papel, o mapa do
 * acervo, as regras do diagnóstico). As que ficaram de fora provam POLÍTICA DE
 * ACESSO, e política de acesso só se prova contra um Postgres de verdade —
 * simular seria testar a simulação.
 *
 * Quem publicar o projeto continua precisando rodar `pnpm test` completo com a
 * credencial em mãos. O CI não substitui isso; ele pega o que dá para pegar em
 * cada push, que é mais do que pegava antes (nada).
 */
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: [
      'diagnostico/**/*.spec.ts',
      'exportar/**/*.spec.ts',
      'ferramentas/**/*.spec.ts',
      'regras/**/*.spec.ts',
      'prisma/**/*.spec.ts',
      'teste/aplicar-rls.spec.ts',
      'teste/guarda-de-producao.spec.ts',
    ],
    environment: 'node',
    // Zero teste é falha: suíte que não roda nada não aprova nada.
    passWithNoTests: false,
  },
});
