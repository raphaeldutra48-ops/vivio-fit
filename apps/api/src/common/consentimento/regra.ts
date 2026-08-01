import type { Prisma } from '@prisma/client';

/**
 * A condição que define "consentimento vigente para este profissional".
 *
 * Existe como função porque a regra estava escrita em dois lugares — o
 * `ConsentGuard` e o relatório de carteira — e **já divergiu uma vez**: o
 * relatório filtrava só por `profissionalId`, ignorando o consentimento com
 * `profissionalId: null`, que é o concedido para toda a equipe de cuidado e o
 * caso mais comum. O efeito era o pior possível para o produto: aluno que
 * autorizou tudo aparecia na tela como se não tivesse autorizado nada.
 *
 * Quem precisar da regra em um terceiro lugar chama daqui. Divergir de novo
 * passa a exigir reescrever de propósito.
 */
export function consentimentoVigentePara(profissionalId: string): Prisma.ConsentimentoWhereInput {
  return {
    revogadoEm: null,
    // null = concedido para a equipe inteira, e não para um profissional só.
    OR: [{ profissionalId: null }, { profissionalId }],
  };
}
