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
 * ## A proteção mudou de forma duas vezes, e a razão importa
 *
 * A primeira versão procurava a palavra `prod` na URL. Não pegou nada: nenhum
 * provedor gerenciado põe isso no hostname, e a suíte rodou meses contra o
 * banco de produção sem um aviso. A regra procurava o **nome** do perigo.
 *
 * A segunda exigia declarar um banco de teste. Funcionava, mas dependia de
 * disciplina — e a decisão do projeto passou a ser rodar contra o banco único
 * mesmo, sem manter um segundo só para teste.
 *
 * Esta terceira olha o **conteúdo**: a suíte só roda num banco que ainda não
 * tem gente de verdade dentro. Enquanto o app é semente e teste, tudo bem
 * apagar. No dia em que o primeiro aluno se cadastrar, o portão fecha sozinho,
 * sem depender de alguém lembrar.
 */
carregarEnv();

const teste = process.env.DATABASE_URL_TEST;

if (teste) {
  // O Prisma só olha DATABASE_URL; a troca acontece aqui.
  process.env.DATABASE_URL = teste;
  process.env.DIRECT_URL = process.env.DIRECT_URL_TEST ?? teste;
} else if (!process.env.DATABASE_URL) {
  throw new Error('Nem DATABASE_URL nem DATABASE_URL_TEST estão definidas.');
}

const alvo = process.env.DATABASE_URL!;

// Rede de segurança pelo nome, mantida como camada extra: se a URL AVISAR que
// é produção, nem a checagem de conteúdo abaixo tem chance de liberar.
if (process.env.NODE_ENV === 'production' || /(^|[^a-z])prod(uction)?([^a-z]|$)/i.test(alvo)) {
  throw new Error(
    'Recusando rodar os testes: a URL do banco parece de produção. A suíte apaga dados.',
  );
}

/*
  A checagem de CONTEÚDO — se há gente de verdade no banco — mora em
  `guarda-de-producao.ts`, como `globalSetup`. Aqui não dá: `setupFiles` roda
  por arquivo de teste e é síncrono, e a consulta precisaria de `await` no topo,
  que não existe em CommonJS. Além disso, no `globalSetup` a pergunta é feita
  uma vez para a suíte inteira em vez de 48.
*/
export {};
