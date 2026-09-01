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
  /*
    O texto anterior dizia "banco de DESENVOLVIMENTO", e essa afirmação era
    falsa: existe **um** banco nesta instalação, e é o mesmo que a API de
    produção usa. Descobrimos comparando os endpoints — `.env` aponta para
    `ep-jolly-glade-...-pooler` e a produção para `ep-jolly-glade-...`, o mesmo
    banco por duas portas.

    Um aviso que nomeia errado o risco é pior que nenhum: ele tranquiliza.
  */
  console.warn(
    '\n⚠  Rodando contra o banco apontado por DATABASE_URL, que NÃO é um banco' +
      '\n   de teste separado. A suíte cria e apaga usuários nele.' +
      '\n   O certo é DATABASE_URL_TEST num branch próprio (pendência 2).\n',
  );
}

const alvo = process.env.DATABASE_URL!;

/*
  A rede de segurança antiga procurava a palavra "prod" na URL — e não pegou
  nada, porque nenhum provedor gerenciado põe "prod" no hostname. A URL do Neon
  desta instalação é `ep-jolly-glade-ayydu988.../neondb`: não há "prod" nela,
  e a suíte rodou contra o banco de produção sem um aviso sequer.

  O erro era a forma da regra, não o texto dela. Procurar o nome do perigo só
  funciona quando alguém se lembrou de nomeá-lo; o padrão certo é o inverso —
  **exigir que o banco de teste seja declarado**, e recusar tudo que não foi.

  Duas formas de declarar:

  - `DATABASE_URL_TEST` apontando para um branch separado. É o certo, e o Neon
    faz branch por cópia em segundos.
  - `BANCO_DE_TESTE_ASSUMIDO=sim`, para quem aceita rodar contra o banco comum
    sabendo que a suíte cria e apaga usuários. Fica no `.env`, escrito de
    propósito, e não por esquecimento.
*/
if (!teste && process.env.BANCO_DE_TESTE_ASSUMIDO !== 'sim') {
  throw new Error(
    [
      'Recusando rodar: nenhum banco de teste foi declarado.',
      '',
      'A suíte cria e apaga usuários. Sem declaração explícita não há como',
      'saber se este banco pode receber isso — o nome do host não diz.',
      '',
      'Escolha uma:',
      '  1. DATABASE_URL_TEST=... apontando para um branch de teste no Neon',
      '  2. BANCO_DE_TESTE_ASSUMIDO=sim, se este banco pode mesmo ser mexido',
    ].join('\n'),
  );
}

// Mantido como camada extra: se o nome AVISAR que é produção, nem a declaração
// explícita passa.
if (process.env.NODE_ENV === 'production' || /(^|[^a-z])prod(uction)?([^a-z]|$)/i.test(alvo)) {
  throw new Error(
    'Recusando rodar os testes: a URL do banco parece de produção. A suíte apaga dados. ' +
      'Aponte DATABASE_URL_TEST para um branch de teste.',
  );
}

export {};
