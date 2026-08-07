import { MAPA, indiceDeMidia } from './wger';

/**
 * Confere, **contra a API do wger ao vivo**, que cada id do mapa existe e tem
 * mídia hoje.
 *
 * Separado do teste de unidade de propósito: aquele valida a forma do mapa e
 * roda sempre; este depende da rede e de um serviço de terceiro, e uma suíte
 * que quebra porque o wger saiu do ar é uma suíte em que ninguém confia.
 *
 *   pnpm --filter @vivio/api exec tsx prisma/conferir-mapa.ts
 */
async function main(): Promise<void> {
  const indice = await indiceDeMidia();

  let comImagem = 0;
  let comVideo = 0;
  const semMidia: string[] = [];

  for (const [nome, id] of Object.entries(MAPA)) {
    const midia = indice.get(id) ?? [];
    if (midia.length === 0) {
      semMidia.push(`${nome} (id=${id})`);
      continue;
    }
    if (midia.some((m) => m.tipo === 'IMAGEM')) comImagem += 1;
    if (midia.some((m) => m.tipo === 'VIDEO')) comVideo += 1;
  }

  console.log(`mapeados:    ${Object.keys(MAPA).length}`);
  console.log(`com imagem:  ${comImagem}`);
  console.log(`com vídeo:   ${comVideo}`);

  if (semMidia.length > 0) {
    console.log('\nSEM MÍDIA no wger (revisar o mapa):');
    for (const s of semMidia) console.log(`  - ${s}`);
    process.exitCode = 1;
  } else {
    console.log('\nTodos os ids do mapa têm mídia.');
  }
}

void main();
