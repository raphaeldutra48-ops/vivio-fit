import { config as carregarEnv } from 'dotenv';

/**
 * Escolhe o banco que a suíte usa, e recusa os que ela não pode tocar.
 *
 * Roda como `setupFiles`, isto é, dentro do processo de cada arquivo de teste e
 * antes de qualquer import dele — que é onde `DATABASE_URL` precisa já estar
 * decidida, porque o PrismaClient a lê ao ser construído. Quem lê o `.env` em
 * produção é o ConfigModule, no bootstrap; aqui isso ainda não aconteceu, daí
 * carregá-lo à mão.
 *
 * Os e2e criam e apagam usuários de verdade. Apontar isso para o banco errado
 * uma vez basta para o estrago (pendências 2 e 12).
 */
// Sem `path`: resolve a partir do cwd, igual ao `envFilePath: '.env'` do
// ConfigModule. O `root` do Vitest é o próprio apps/api.
carregarEnv();

const teste = process.env.DATABASE_URL_TEST;

if (teste) {
  // O Prisma só olha DATABASE_URL; a troca acontece aqui.
  process.env.DATABASE_URL = teste;
  process.env.DIRECT_URL = process.env.DIRECT_URL_TEST ?? teste;
} else if (!process.env.DATABASE_URL) {
  throw new Error('Nem DATABASE_URL nem DATABASE_URL_TEST estão definidas.');
} else if (!process.env.VITEST_WORKER_ID || process.env.VITEST_WORKER_ID === '1') {
  // Só no primeiro worker: um aviso por arquivo de teste vira ruído e some.
  console.warn(
    '\n⚠  Suíte rodando contra o banco de DESENVOLVIMENTO — ela cria e apaga usuários.' +
      '\n   Para separar: branch de teste no Neon + DATABASE_URL_TEST (pendência 2).\n',
  );
}

const alvo = process.env.DATABASE_URL!;

// Rede de segurança, não segurança de verdade: um banco chamado "prod" ou um
// NODE_ENV de produção não são lugar para uma suíte que faz deleteMany.
if (process.env.NODE_ENV === 'production' || /(^|[^a-z])prod(uction)?([^a-z]|$)/i.test(alvo)) {
  throw new Error(
    'Recusando rodar os testes: a URL do banco parece de produção. A suíte apaga dados. ' +
      'Aponte DATABASE_URL_TEST para um branch de teste.',
  );
}

export {};
