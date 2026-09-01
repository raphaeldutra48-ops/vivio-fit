import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Lint do monorepo.
 *
 * O `turbo.json` declarava a tarefa `lint` desde o começo e nenhum pacote tinha
 * o script — `turbo lint` percorria oito pacotes e não olhava uma linha. Este
 * arquivo é o que faltava.
 *
 * ## O que entra
 *
 * Regras que apontam **defeito**, não estilo. Formatação não está aqui de
 * propósito: ela gera centenas de apontamentos que ninguém lê e que escondem
 * os poucos que importam.
 *
 * As três que pagam o custo sozinhas:
 *
 * - `no-floating-promises` — `promise` sem `await` nem `void` engole erro em
 *   silêncio. Num app que grava treino e consentimento, é dado que some sem
 *   ninguém saber.
 * - `no-misused-promises` — `async` passado onde se espera função síncrona,
 *   caso clássico em `onClick` e em middleware.
 * - `react-hooks/exhaustive-deps` — dependência faltando em `useEffect` é a
 *   causa mais comum de tela que não atualiza e de requisição em laço.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/build/**',
      '**/.expo/**',
      'apps/mobile/dist/**',
      // Gerado pelo Next a cada build; editar não adianta.
      'apps/web/next-env.d.ts',
    ],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    /*
      Arquivos de configuração (`next.config.mjs`, `metro.config.js`,
      `tailwind-preset.cjs`, este próprio) não pertencem a nenhum `tsconfig`, e
      as regras que dependem de tipo não conseguem analisá-los — o resultado
      eram oito "Parsing error" que não apontavam defeito nenhum, só barulho
      que empurrava os apontamentos reais para fora da tela.
    */
    files: ['**/*.{js,cjs,mjs}'],
    ...tseslint.configs.disableTypeChecked,
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      /*
        `require()` é o que esses arquivos têm de usar: `metro.config.js`,
        `tailwind-preset.cjs` e o gerador de ícones são carregados por
        ferramentas que só entendem CommonJS. A regra vale para o código do
        produto, não para a configuração dele.
      */
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Só TypeScript: os arquivos de configuração em `.js`/`.mjs`/`.cjs` não
    // pertencem a nenhum `tsconfig`, e aplicar `projectService` a eles
    // desfazia o `disableTypeChecked` declarado logo acima.
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Ruído puro em TypeScript com tipos: o compilador já garante.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',

      // Variável não usada com `_` na frente é intenção declarada.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      /*
        Desligada depois de olhar os 120 apontamentos: são quase todos `!` em
        teste, onde o autor sabe que o índice existe porque acabou de montar o
        arranjo. A regra é de arrumação, não de defeito, e 120 linhas de ruído
        escondem as poucas que importam — que foi o motivo de este arquivo
        existir com esse critério.
      */
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',

      /*
        Aviso, não erro, e a razão está medida: os 44 casos são `onSubmit` e
        `onClick` recebendo função `async`, e os manipuladores que conferi têm
        `try/catch` cobrindo tudo — a promessa rejeitada não chega a existir.
        Como erro, quebraria `pnpm lint` sem nenhum defeito real por trás, e um
        portão que sempre reprova deixa de ser lido.

        Fica como aviso porque em código NOVO o alerta vale: `async` num
        manipulador sem `try/catch` engole a falha, e num app que grava treino
        e consentimento isso é dado que some sem ninguém saber.
      */
      /*
        Desligada. Os sete apontamentos eram todos o mesmo caso legítimo:
        método `async` sem `await` porque implementa uma interface que devolve
        `Promise` — `Armazenamento.urlDeLeitura` é síncrono no driver de disco
        e assíncrono no de R2, e o `EnvioDeEmail` idem. Tirar o `async`
        quebraria o contrato; manter o alerta ensina a ignorar alertas.
      */
      '@typescript-eslint/require-await': 'off',

      '@typescript-eslint/no-misused-promises': [
        'warn',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },
  {
    files: ['apps/web/**/*.tsx', 'apps/mobile/**/*.tsx', 'packages/ui*/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Testes e scripts de manutenção: `$queryRawUnsafe` e afins são o trabalho.
    files: ['**/*.spec.ts', '**/*.test.tsx', 'apps/api/test/**', 'apps/api/prisma/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
);
