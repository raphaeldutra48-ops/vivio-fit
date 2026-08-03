import { hash } from '@node-rs/argon2';
import { PrismaClient, Papel } from '@prisma/client';

/**
 * Redefine a senha de uma conta de ADMIN.
 *
 * Saída de emergência para o único cenário sem socorro: o administrador
 * esqueceu a senha. Ele não tem ninguém acima para redefinir por ele, e a
 * recuperação por e-mail depende de SMTP, que pode ainda não existir.
 *
 * O `criar-admin.ts` **não** serve para isso de propósito: ele é idempotente e
 * se recusa a trocar a senha de uma conta existente, porque roda a cada deploy
 * e uma troca silenciosa derrubaria o admin sem ninguém entender por quê. Este
 * script faz a troca, mas só quando alguém pede explicitamente.
 *
 *   REDEFINIR_SENHA_EMAIL=... REDEFINIR_SENHA_NOVA=... pnpm --filter @vivio/api \
 *     exec tsx prisma/redefinir-senha.ts
 *
 * No Railway, é acionado pelas mesmas variáveis via `entrada.sh`. **Apague as
 * duas depois** — senha em texto claro no painel é senha exposta.
 *
 * Só mexe em conta com papel ADMIN. Aluno e profissional têm o fluxo normal de
 * recuperação; dar a este script poder sobre qualquer conta transformaria uma
 * variável de ambiente num jeito de assumir a conta de qualquer paciente.
 */
const prisma = new PrismaClient();

const SENHA_MINIMA = 12;

async function main(): Promise<void> {
  const email = process.env.REDEFINIR_SENHA_EMAIL?.toLowerCase().trim();
  const senha = process.env.REDEFINIR_SENHA_NOVA;

  if (!email || !senha) {
    console.error('Defina REDEFINIR_SENHA_EMAIL e REDEFINIR_SENHA_NOVA.');
    process.exit(1);
  }

  if (senha.length < SENHA_MINIMA || !/[A-Za-zÀ-ÿ]/.test(senha) || !/[0-9]/.test(senha)) {
    console.error(
      `A senha precisa de ao menos ${SENHA_MINIMA} caracteres, com letra e número.`,
    );
    process.exit(1);
  }

  const conta = await prisma.user.findUnique({ where: { email } });

  if (!conta) {
    console.error(`Não existe conta para ${email}.`);
    process.exit(1);
  }

  if (conta.papel !== Papel.ADMIN) {
    console.error(
      `A conta ${email} tem papel ${conta.papel}. Este script só redefine senha de ADMIN.`,
    );
    process.exit(1);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: conta.id },
      data: {
        senhaHash: await hash(senha),
        // Se a senha estava perdida, pode ter vazado. Sessão aberta com a senha
        // antiga não pode sobreviver à troca.
        sessoes: { deleteMany: {} },
      },
    });
  });

  console.log(`Senha redefinida para ${email}.`);
  console.log('Sessões anteriores revogadas. Apague REDEFINIR_SENHA_EMAIL e REDEFINIR_SENHA_NOVA.');
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
