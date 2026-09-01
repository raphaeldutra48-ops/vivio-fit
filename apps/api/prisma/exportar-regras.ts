import { PrismaClient } from '@prisma/client';
import { REGRAS } from '../src/modules/alertas/regras';
import { CUIDADO_POR_REGIAO } from '../src/modules/alertas/regras-condicao';

/**
 * Leva as regras de alerta do TypeScript para a tabela.
 *
 *   pnpm --filter @vivio/api exportar-regras
 *
 * Elas nasceram como arranjo dentro da API porque a API era quem as executava.
 * Com o acesso por RLS não há mais API no meio: o alerta precisa nascer no
 * banco, por gatilho, e o gatilho lê a regra de uma tabela.
 *
 * A tradução é fiel — mesmo `id`, mesmo texto, mesma severidade. O `id` entra
 * na deduplicação do alerta, então mudá-lo quebraria o histórico de quem já
 * recebeu.
 *
 * Idempotente: `upsert` por id. Rodar de novo depois de editar um texto no
 * TypeScript atualiza a linha — o que serve para a transição. Depois dela, a
 * tabela passa a ser a origem, e este script sai junto com a API.
 */
async function principal(): Promise<void> {
  const prisma = new PrismaClient({
    datasourceUrl: process.env.SUPABASE_DIRECT_URL ?? process.env.DATABASE_URL,
  });
  try {
    let n = 0;

    for (const regra of REGRAS) {
      for (const aviso of regra.avisos) {
        // Uma linha por (regra, papel): cada papel recebe texto próprio, e é
        // isso que faz o personal ler conduta sem ler o marcador.
        const id = `${regra.id}:${aviso.papel}`;
        const dados = {
          origem: 'MARCADOR',
          marcador: regra.marcador,
          quando: regra.quando as unknown as string[],
          lado: regra.lado ?? null,
          tipoCondicao: null,
          regiao: null,
          papelDestino: aviso.papel,
          severidade: regra.quando.includes('CRITICO' as never) ? 'ALTA' : 'MEDIA',
          titulo: aviso.titulo,
          orientacao: aviso.orientacao,
          ativa: true,
        };
        await prisma.regraDeAlerta.upsert({ where: { id }, update: dados, create: { id, ...dados } });
        n += 1;
      }
    }

    /*
      As regras de CONDIÇÃO não são um arranjo, são função: o texto para o
      personal muda por região do corpo, e a severidade vem da gravidade da
      condição. O que dá para virar dado é o mapa de cuidado por região —
      exatamente a parte que um profissional de saúde vai querer editar sem
      abrir o repositório.

      O resto da lógica (qual gravidade vira qual severidade, quando a condição
      está ativa) fica no gatilho, porque é decisão e não conteúdo.
    */
    for (const [regiao, cuidado] of Object.entries(CUIDADO_POR_REGIAO)) {
      const id = `lesao-regiao:${regiao}:PERSONAL`;
      const dados = {
        origem: 'CONDICAO',
        marcador: null,
        quando: [] as string[],
        lado: null,
        tipoCondicao: 'LESAO',
        regiao,
        papelDestino: 'PERSONAL',
        severidade: 'MEDIA',
        titulo: `Cuidado com ${regiao.toLowerCase().replace(/_/g, ' ')}`,
        orientacao: cuidado,
        ativa: true,
      };
      await prisma.regraDeAlerta.upsert({ where: { id }, update: dados, create: { id, ...dados } });
      n += 1;
    }

    console.log(`regras na tabela: ${n}`);
    const porOrigem = await prisma.regraDeAlerta.groupBy({ by: ['origem'], _count: true });
    for (const o of porOrigem) console.log(`  ${o.origem}: ${o._count}`);
  } finally {
    await prisma.$disconnect();
  }
}
void principal();
