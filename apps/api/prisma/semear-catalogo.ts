import { Papel, PrismaClient } from '@prisma/client';
import { semearCatalogo } from './catalogo';

/**
 * Popula o catálogo do produto num banco de produção: biblioteca global de
 * exercícios e tabela de composição de alimentos.
 *
 * Sem isto o app sobe funcionando e inútil — não há um exercício para montar
 * treino nem um alimento para montar dieta.
 *
 * Não faz parte do start do contêiner: são centenas de linhas de escrita, e
 * repetir isso a cada deploy só gasta banco. Rode uma vez, depois do
 * `criar-admin.ts` (o autor dos exercícios globais é o admin).
 *
 *   pnpm --filter @vivio/api exec tsx prisma/semear-catalogo.ts
 *
 * Idempotente: rodar de novo só insere o que ainda não existe.
 */
const prisma = new PrismaClient();

async function main(): Promise<void> {
  const admin = await prisma.user.findFirst({
    where: { papel: Papel.ADMIN },
    orderBy: { criadoEm: 'asc' },
    select: { id: true, email: true },
  });

  if (!admin) {
    console.error('Nenhum admin no banco. Rode prisma/criar-admin.ts primeiro.');
    process.exit(1);
  }

  const total = await semearCatalogo(prisma, admin.id);
  console.log(`Catálogo pronto (autor: ${admin.email}).`);
  console.log(`Exercícios globais: ${total.exercicios}`);
  console.log(`Alimentos: ${total.alimentos}`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
