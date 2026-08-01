import { hash } from '@node-rs/argon2';
import { PrismaClient, Papel, StatusConta } from '@prisma/client';

/**
 * Cria a PRIMEIRA conta de administrador em produção.
 *
 * O banco de produção nasce vazio, e sem um admin ninguém aprova profissional
 * nenhum — o app sobe travado. O `seed.ts` não serve aqui: ele monta Ana,
 * Bruno, Carla e a equipe de demonstração, que não podem existir num banco com
 * gente de verdade.
 *
 * As credenciais vêm de variável de ambiente e nunca de argumento na linha de
 * comando: argumento fica no histórico do shell e nos logs do processo.
 *
 *   ADMIN_EMAIL=... ADMIN_SENHA=... pnpm --filter @vivio/api exec \
 *     tsx prisma/criar-admin.ts
 *
 * Depois de rodar, **apagar as duas variáveis** do painel: elas não são
 * necessárias para a aplicação funcionar e deixá-las ali é guardar uma senha em
 * texto claro num lugar que várias pessoas enxergam.
 *
 * Idempotente: rodar de novo com o mesmo e-mail não duplica nem sobrescreve a
 * senha — só avisa que a conta já existe.
 */
const prisma = new PrismaClient();

const SENHA_MINIMA = 12;

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const senha = process.env.ADMIN_SENHA;
  const nome = process.env.ADMIN_NOME?.trim() || 'Administrador';

  if (!email || !senha) {
    console.error('Defina ADMIN_EMAIL e ADMIN_SENHA. Veja o cabeçalho deste arquivo.');
    process.exit(1);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('ADMIN_EMAIL não parece um e-mail.');
    process.exit(1);
  }

  // Mais exigente que o cadastro comum (8): esta conta aprova quem acessa dado
  // de saúde de terceiros, e é a única que não tem ninguém acima para socorrer.
  if (senha.length < SENHA_MINIMA || !/[A-Za-zÀ-ÿ]/.test(senha) || !/[0-9]/.test(senha)) {
    console.error(
      `A senha do admin precisa de ao menos ${SENHA_MINIMA} caracteres, com letra e número.`,
    );
    process.exit(1);
  }

  const existente = await prisma.user.findUnique({ where: { email } });
  if (existente) {
    // Não troca a senha: se o script rodar sozinho a cada deploy, uma troca
    // silenciosa derrubaria o admin sem ninguém entender por quê.
    console.log(
      existente.papel === Papel.ADMIN
        ? `Já existe admin para ${email}. Nada a fazer.`
        : `Já existe conta para ${email}, mas com papel ${existente.papel}. ` +
            'Use outro e-mail ou promova essa conta manualmente.',
    );
    return;
  }

  const admin = await prisma.user.create({
    data: {
      email,
      nome,
      senhaHash: await hash(senha),
      papel: Papel.ADMIN,
      status: StatusConta.ATIVA,
      // Já verificado: quem tem acesso às variáveis do servidor provou posse da
      // conta muito antes de qualquer e-mail poder provar.
      emailVerifEm: new Date(),
    },
  });

  console.log(`Admin criado: ${admin.email}`);
  console.log('Agora apague ADMIN_EMAIL e ADMIN_SENHA das variáveis do serviço.');
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
