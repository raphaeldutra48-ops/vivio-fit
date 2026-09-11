import { PrismaClient } from '@prisma/client';
import { CREDITO_PRIME, MAPA_PRIME, origemPrime, type VideoPrime } from './prime';

/**
 * Liga cada exercício do catálogo ao player do vídeo em português do Prime.
 *
 *   pnpm --filter @vivio/api vincular-prime                  (grava)
 *   SIMULAR=true      pnpm --filter @vivio/api vincular-prime (só mostra)
 *   COM_CONFERIR=true ...  inclui os pares marcados `conferir`
 *   DESFAZER=true     ...  tira de todos os exercícios o player do Prime
 *
 * Só escreve coluna — nenhum arquivo é baixado. O vídeo continua na conta do
 * Prime e é assistido pelo player oficial deles, dentro da tela do exercício.
 * Por isso roda de qualquer lugar que alcance o banco, ao contrário do
 * importador do wger, que precisa estar onde o armazenamento está.
 *
 * Os pares `conferir` ficam de fora por padrão: são o mesmo exercício com
 * quase certeza, mas o nome não diz o aparelho. Vídeo errado é pior que vídeo
 * nenhum — ninguém desconfia de uma demonstração.
 */

export interface ExercicioParaVincular {
  videoChave: string | null;
  videoExternoUrl: string | null;
  videoCredito: string | null;
}

export interface Vinculo {
  videoExternoUrl: string;
  videoCredito: string;
  videoOrigemUrl: string;
}

/**
 * O que gravar num exercício, ou `null` para não mexer. Decisão pura.
 *
 * Exercício com vídeo NOSSO não é tocado: o player de fora nunca apareceria
 * (a gravação vence), e o `videoCredito` que está ali é o crédito daquele
 * arquivo — sobrescrevê-lo atribuiria ao Prime um vídeo que não é deles.
 */
export function planejarVinculo(
  exercicio: ExercicioParaVincular,
  entrada: VideoPrime | undefined,
  opcoes: { comConferir: boolean },
): Vinculo | null {
  if (!entrada) return null;
  if (entrada.conferir !== undefined && !opcoes.comConferir) return null;
  if (exercicio.videoChave !== null) return null;

  const url = origemPrime(entrada.video);
  // Já está assim: não escreve de novo — rodar duas vezes não muda nada.
  if (exercicio.videoExternoUrl === url && exercicio.videoCredito === CREDITO_PRIME) return null;

  return { videoExternoUrl: url, videoCredito: CREDITO_PRIME, videoOrigemUrl: url };
}

async function main(): Promise<void> {
  const SIMULAR = process.env.SIMULAR === 'true';
  const prisma = new PrismaClient();
  try {
    if (process.env.DESFAZER === 'true') {
      /*
        Pelo crédito, e não por lista de ids: tira exatamente o que este
        vínculo pôs — e nada do que alguém tenha posto por outro caminho.
      */
      const onde = { videoCredito: CREDITO_PRIME, videoChave: null };
      const n = await prisma.exercicio.count({ where: onde });
      if (!SIMULAR) {
        await prisma.exercicio.updateMany({
          where: onde,
          data: { videoExternoUrl: null, videoCredito: null, videoOrigemUrl: null },
        });
      }
      console.log(`${SIMULAR ? 'desfaria' : 'desfeito'}: ${n} exercício(s)`);
      return;
    }

    const comConferir = process.env.COM_CONFERIR === 'true';
    const exercicios = await prisma.exercicio.findMany({
      where: { escopo: 'GLOBAL', deletadoEm: null, nome: { in: Object.keys(MAPA_PRIME) } },
      select: { id: true, nome: true, videoChave: true, videoExternoUrl: true, videoCredito: true },
    });

    const contagem = { gravados: 0, jaEstavam: 0, aConferir: 0, comVideoNosso: 0 };
    for (const e of exercicios) {
      const entrada = MAPA_PRIME[e.nome];
      const vinculo = planejarVinculo(e, entrada, { comConferir });
      if (!vinculo) {
        if (e.videoChave !== null) contagem.comVideoNosso += 1;
        else if (entrada?.conferir !== undefined && !comConferir) contagem.aConferir += 1;
        else contagem.jaEstavam += 1;
        continue;
      }
      if (!SIMULAR) await prisma.exercicio.update({ where: { id: e.id }, data: vinculo });
      contagem.gravados += 1;
    }

    const faltando = Object.keys(MAPA_PRIME).filter((n) => !exercicios.some((e) => e.nome === n));
    console.log(`${SIMULAR ? 'gravaria' : 'gravados'}:          ${contagem.gravados}`);
    console.log(`já estavam assim:     ${contagem.jaEstavam}`);
    console.log(`a conferir (fora):    ${contagem.aConferir}`);
    console.log(`com vídeo nosso:      ${contagem.comVideoNosso}`);
    if (faltando.length > 0) console.log(`no mapa e não no banco: ${faltando.join(', ')}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((erro: unknown) => {
    console.error(erro);
    process.exit(1);
  });
}
