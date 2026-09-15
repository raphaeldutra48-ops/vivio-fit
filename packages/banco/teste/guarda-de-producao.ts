import { PrismaClient } from '@prisma/client';
import { config as carregarEnv } from 'dotenv';

/**
 * Recusa a suíte inteira se o banco tiver gente de verdade dentro.
 *
 * `globalSetup`, e não `setupFiles`: a pergunta é a mesma para os 48 arquivos,
 * então é feita uma vez só — e aqui `await` no topo é permitido, o que no
 * setup por arquivo não é.
 *
 * ## Por que olhar o conteúdo e não o nome
 *
 * A proteção antiga procurava a palavra `prod` na URL do banco. Não pegou
 * nada: nenhum provedor gerenciado põe isso no hostname, e a suíte — que cria
 * e **apaga** usuários — rodou meses contra a produção sem um aviso sequer.
 *
 * A decisão do projeto é rodar contra o banco único, sem manter um segundo só
 * para teste. Isso é seguro **enquanto** o banco tem só semente e teste
 * dentro, e deixa de ser no instante em que o primeiro aluno se cadastra.
 *
 * Perguntar ao banco fecha esse portão sozinho, sem depender de alguém lembrar
 * de trocar uma variável no dia certo.
 */

/** Contas que a semente e os próprios testes criam. O resto é gente. */
const DE_MENTIRA = [
  /@viviofit\.com\.br$/i, // admin, personal, nutri, medico — a equipe da semente
  /@exemplo\.com$/i, // Ana, Bruno, Carla
  /@teste\.com$/i, // criados pelos próprios e2e
];

/**
 * É conta de gente de verdade?
 *
 * Exportada para ter teste próprio: a alternativa seria provar o guard criando
 * um usuário falso no banco, e um teste que escreve em produção para verificar
 * a proteção de produção é o contrário do que ele defende.
 */
export function ehUsuarioDeVerdade(email: string): boolean {
  return !DE_MENTIRA.some((p) => p.test(email));
}

export async function setup(): Promise<void> {
  carregarEnv();

  const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Nem DATABASE_URL nem DATABASE_URL_TEST estão definidas.');

  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const usuarios = await prisma.user.findMany({ select: { email: true } });
    const reais = usuarios.filter((u) => ehUsuarioDeVerdade(u.email));

    if (reais.length > 0) {
      throw new Error(
        [
          '',
          `RECUSANDO RODAR: este banco tem ${reais.length} usuário(s) de verdade.`,
          '',
          `  exemplo: ${reais[0]!.email}`,
          '',
          'A suíte cria e apaga usuários. Rodá-la aqui destrói dado de gente real:',
          'treino, medida, exame, consentimento — coisas que não voltam.',
          '',
          'Aponte DATABASE_URL_TEST para um banco separado antes de continuar.',
          '',
        ].join('\n'),
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}
