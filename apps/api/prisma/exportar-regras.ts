import { PrismaClient } from '@prisma/client';
import {
  Classificacao,
  REFERENCIAS,
  SexoBiologico,
  TipoCondicao,
  type Faixa,
  type Marcador,
} from '@vivio/contracts';
import { REGRAS } from '../src/modules/alertas/regras';
import { CUIDADO_POR_REGIAO, alertasDaCondicao } from '../src/modules/alertas/regras-condicao';

/**
 * Leva as regras de alerta do TypeScript para a tabela.
 *
 *   pnpm --filter @vivio/api exportar-regras
 *
 * Elas nasceram como arranjo dentro da API porque a API era quem as executava.
 * Com o acesso por RLS não há mais API no meio: o alerta nasce no banco, por
 * gatilho, e o gatilho lê a regra de uma tabela.
 *
 * ## A primeira versão exportou menos do que existia, e isso custou alertas
 *
 * Ela transcreveu à mão as regras de MARCADOR e, de CONDIÇÃO, só o mapa de
 * cuidado por região. Alergia alimentar, gestação, medicação contínua, doença
 * crônica, restrição e cirurgia ficaram de fora — e, no dia em que a API parou
 * de derivar, esses avisos simplesmente deixaram de existir. Um teste pegou;
 * não era garantido que pegasse.
 *
 * Por isso agora nada é transcrito: as linhas de CONDIÇÃO saem de chamar
 * `alertasDaCondicao`, que é a própria função que a API usava. Regra nova no
 * TypeScript aparece aqui sozinha. O que não pode ser gerado assim é o texto
 * que interpola a descrição do paciente — e para esse existe o marcador
 * `{descricao}`, que o gatilho troca na hora.
 *
 * Idempotente: `upsert` por id. O `id` entra na deduplicação do alerta, então
 * mudá-lo quebraria o histórico de quem já recebeu.
 *
 * Este script sai junto com a API. Depois dele, a tabela é a origem.
 */

/**
 * Texto improvável de aparecer numa descrição de verdade, para achá-lo depois.
 * Chamamos a regra com ele no lugar da descrição e trocamos pelo marcador.
 */
const SENTINELA = 'DESCRICAO';

/** O limite que `lado` compara, por sexo. */
function limitesDe(marcador: Marcador, lado: 'ABAIXO' | 'ACIMA'): Record<string, number> {
  const { funcional } = REFERENCIAS[marcador];
  const bordaDe = (f: Faixa): number | undefined => (lado === 'ABAIXO' ? f.min : f.max);

  // Faixa única, igual para os dois sexos.
  if ('min' in funcional || 'max' in funcional) {
    const v = bordaDe(funcional as Faixa);
    return v === undefined ? {} : { '*': v };
  }

  const porSexo = funcional as Record<SexoBiologico, Faixa>;
  const saida: Record<string, number> = {};
  for (const sexo of Object.keys(porSexo)) {
    const v = bordaDe(porSexo[sexo as SexoBiologico]);
    if (v !== undefined) saida[sexo] = v;
  }
  return saida;
}

async function principal(): Promise<void> {
  const prisma = new PrismaClient({
    datasourceUrl: process.env.SUPABASE_DIRECT_URL ?? process.env.DATABASE_URL,
  });
  const vistos = new Set<string>();

  const gravar = async (id: string, dados: Record<string, unknown>): Promise<void> => {
    vistos.add(id);
    await prisma.regraDeAlerta.upsert({
      where: { id },
      update: dados,
      create: { id, ...dados } as never,
    });
  };

  try {
    for (const regra of REGRAS) {
      for (const aviso of regra.avisos) {
        // Uma linha por (regra, papel): cada papel recebe texto próprio, e é
        // isso que faz o personal ler conduta sem ler o marcador.
        await gravar(`${regra.id}:${aviso.papel}`, {
          origem: 'MARCADOR',
          marcador: regra.marcador,
          quando: regra.quando as unknown as string[],
          lado: regra.lado ?? null,
          limites: regra.lado ? limitesDe(regra.marcador, regra.lado) : undefined,
          tipoCondicao: null,
          regiao: null,
          papelDestino: aviso.papel,
          /*
            Guardada, e ignorada pelo gatilho de marcador de propósito: a
            severidade de verdade vem da CLASSIFICAÇÃO do resultado — o mesmo
            achado pesa diferente se veio ATENCAO ou CRITICO. A coluna fica
            como o valor de referência da regra, para a tela de curadoria.
          */
          severidade: regra.quando.includes(Classificacao.CRITICO as never) ? 'ALTA' : 'MEDIA',
          titulo: aviso.titulo,
          orientacao: aviso.orientacao,
          ativa: true,
        });
      }
    }

    /*
      CONDIÇÃO: geradas chamando a própria função da API.

      LESAO e CIRURGIA_RECENTE dependem da região — uma linha por região. Os
      outros tipos não, e passam com região nula. Quem decide qual é qual não é
      uma lista aqui: é a função devolver vazio quando falta região.
    */
    for (const tipo of Object.values(TipoCondicao)) {
      const semRegiao = alertasDaCondicao({
        tipo,
        descricao: SENTINELA,
        regiao: null,
        gravidade: 'MODERADA',
      } as never);

      const regioes = semRegiao.length > 0 ? [null] : Object.keys(CUIDADO_POR_REGIAO);

      for (const regiao of regioes) {
        const avisos =
          regiao === null
            ? semRegiao
            : alertasDaCondicao({
                tipo,
                descricao: SENTINELA,
                regiao,
                gravidade: 'MODERADA',
              } as never);

        for (const a of avisos) {
          const id = regiao === null ? `${a.regra}:${a.papelDestino}` : `${a.regra}:${regiao}:${a.papelDestino}`;
          await gravar(id, {
            origem: 'CONDICAO',
            marcador: null,
            quando: [] as string[],
            lado: null,
            limites: undefined,
            tipoCondicao: tipo,
            regiao,
            papelDestino: a.papelDestino,
            // Também ignorada no gatilho: para condição, a severidade vem da
            // GRAVIDADE registrada — a mesma lesão pesa diferente se leve ou
            // incapacitante.
            severidade: a.severidade,
            titulo: a.titulo,
            // O único ponto que não sai pronto: o texto cita a descrição que o
            // profissional escreveu, e ela só existe na hora.
            orientacao: a.orientacao.split(SENTINELA).join('{descricao}'),
            ativa: true,
          });
        }
      }
    }

    /*
      O escopo de cada marcador, pela mesma razão das regras: o gatilho precisa
      saber se o destinatário do alerta pode ver aquele marcador, e a
      alternativa era uma lista de marcadores escrita à mão dentro do SQL — que
      é exatamente como as regras divergiram da fonte uma vez.
    */
    for (const [marcador, ref] of Object.entries(REFERENCIAS)) {
      await prisma.marcadorEscopo.upsert({
        where: { marcador },
        update: { escopo: ref.escopo },
        create: { marcador, escopo: ref.escopo },
      });
    }
    console.log(`marcadores com escopo: ${Object.keys(REFERENCIAS).length}`);

    /*
      O que sobrou na tabela e não existe mais no TypeScript é desligado, não
      apagado: um alerta já entregue aponta para a regra que o gerou, e a tela
      mostra de onde ele veio. Apagar deixaria histórico órfão.
    */
    const desligadas = await prisma.regraDeAlerta.updateMany({
      where: { id: { notIn: [...vistos] }, ativa: true },
      data: { ativa: false },
    });

    console.log(`regras gravadas: ${vistos.size}`);
    if (desligadas.count > 0) console.log(`regras desligadas (sumiram do TypeScript): ${desligadas.count}`);
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
