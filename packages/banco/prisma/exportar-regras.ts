import { PrismaClient } from '@prisma/client';
import {
  escoposEsperados,
  faixasEsperadas,
  regrasEsperadas,
} from '../regras/exportacao';
import { urlDoBanco } from '../conexao';

/**
 * Leva as regras clínicas do TypeScript para as tabelas.
 *
 *   pnpm --filter @vivio/banco exportar-regras
 *
 * Elas nasceram como arranjo dentro da API porque a API era quem as executava.
 * Com o acesso por RLS não há mais API no meio: o alerta nasce no banco, por
 * gatilho, e o gatilho lê a regra de uma tabela.
 *
 * **Este script é obrigatório num banco novo**, logo depois de `rls:aplicar`.
 * As três tabelas nascem vazias das migrações, e vazias o app fica
 * silenciosamente menor do que promete — a explicação das três consequências
 * está em `../regras/exportacao.ts`.
 *
 * Aqui só sobrou a gravação. **O que gravar virou função pura** em
 * `../regras/exportacao.ts`, por duas razões:
 *
 * 1. script que só roda contra produção não tem teste, e as linhas que ele
 *    monta são exatamente a parte que erra calado — a primeira versão
 *    transcreveu as regras de condição à mão e esqueceu seis tipos;
 * 2. o diagnóstico precisa saber o que o banco **deveria** ter para dizer que
 *    está atrasado. Com a derivação num lugar só, as duas respostas não podem
 *    divergir.
 *
 * Idempotente: `upsert` por id. O `id` entra na deduplicação do alerta, então
 * mudá-lo quebraria o histórico de quem já recebeu.
 */
async function principal(): Promise<void> {
  const prisma = new PrismaClient({
    datasourceUrl: urlDoBanco(),
  });

  try {
    const regras = regrasEsperadas();
    for (const { id, ...dados } of regras) {
      await prisma.regraDeAlerta.upsert({
        where: { id },
        update: dados,
        create: { id, ...dados } as never,
      });
    }

    for (const { marcador, escopo } of escoposEsperados()) {
      await prisma.marcadorEscopo.upsert({
        where: { marcador },
        update: { escopo },
        create: { marcador, escopo },
      });
    }
    console.log(`marcadores com escopo: ${escoposEsperados().length}`);

    /*
      As faixas, por sexo.

      Vão junto porque a CLASSIFICAÇÃO de um resultado não pode ser calculada
      pelo cliente: é ela que dispara o alerta clínico, e um cliente adulterado
      marcaria "ótimo" num valor crítico para o aviso nunca nascer. O gatilho
      recalcula na entrada, e para isso precisa das faixas aqui dentro.
    */
    const faixas = faixasEsperadas();
    for (const { marcador, sexo, ...dados } of faixas) {
      await prisma.faixaMarcador.upsert({
        where: { marcador_sexo: { marcador, sexo } },
        update: dados,
        create: { marcador, sexo, ...dados },
      });
    }
    console.log(`faixas de referência: ${faixas.length}`);

    /*
      O que sobrou na tabela e não existe mais no TypeScript é desligado, não
      apagado: um alerta já entregue aponta para a regra que o gerou, e a tela
      mostra de onde ele veio. Apagar deixaria histórico órfão.
    */
    const desligadas = await prisma.regraDeAlerta.updateMany({
      where: { id: { notIn: regras.map((r) => r.id) }, ativa: true },
      data: { ativa: false },
    });

    console.log(`regras gravadas: ${regras.length}`);
    if (desligadas.count > 0) {
      console.log(`regras desligadas (sumiram do TypeScript): ${desligadas.count}`);
    }
    const porOrigem = await prisma.regraDeAlerta.groupBy({
      by: ['origem'],
      where: { ativa: true },
      _count: true,
    });
    for (const o of porOrigem) console.log(`  ${o.origem}: ${o._count}`);
  } finally {
    await prisma.$disconnect();
  }
}
void principal();
