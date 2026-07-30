import { PrismaClient, StatusConta } from '@prisma/client';

/**
 * Ativa um profissional pela linha de comando.
 *
 * Existe porque a verificação de registro no conselho ainda não tem tela de
 * admin (pendência 3): `verificadoEm` é lido para barrar quem não foi
 * verificado, mas nada no app o escreve. Sem isto, a primeira conta criada em
 * produção nunca consegue receber um aluno — o app fica travado.
 *
 * Não roda no start do contêiner de propósito: ativar profissional é conferir
 * CREF/CRN/CRM de gente de verdade, e isso é decisão humana, não etapa de deploy.
 *
 *   pnpm --filter @vivio/api exec tsx prisma/ativar-profissional.ts email@dominio
 */
const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.argv[2]?.toLowerCase().trim();
  if (!email) {
    console.error('Uso: tsx prisma/ativar-profissional.ts <email>');
    process.exit(1);
  }

  const usuario = await prisma.user.findUnique({
    where: { email },
    include: { perfilProfissional: true },
  });

  if (!usuario) {
    console.error(`Nenhuma conta com o e-mail ${email}.`);
    process.exit(1);
  }
  if (!usuario.perfilProfissional) {
    console.error(`${email} não é conta de profissional (papel: ${usuario.papel}).`);
    process.exit(1);
  }

  const atualizado = await prisma.$transaction(async (tx) => {
    await tx.perfilProfissional.update({
      where: { userId: usuario.id },
      // Idempotente: reativar não reescreve a data da primeira verificação.
      data: { verificadoEm: usuario.perfilProfissional!.verificadoEm ?? new Date() },
    });

    return tx.user.update({
      where: { id: usuario.id },
      data: {
        status: StatusConta.ATIVA,
        // O e-mail continua sendo confirmado pelo link normal; isto só destrava
        // a conta quando a ativação é feita antes da confirmação.
        emailVerifEm: usuario.emailVerifEm ?? new Date(),
      },
      include: { perfilProfissional: true },
    });
  });

  console.log(
    `Ativado: ${atualizado.nome} (${atualizado.papel}) — ` +
      `${atualizado.perfilProfissional?.registroConselho}/${atualizado.perfilProfissional?.ufRegistro}`,
  );
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
