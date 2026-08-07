import { PrismaClient } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { MAPA, indiceDeMidia, type MidiaDoWger } from './wger';

/**
 * Baixa para o nosso storage a mídia dos exercícios mapeados em `MAPA`.
 *
 *   pnpm --filter @vivio/api exec tsx prisma/importar-wger.ts
 *
 * ## Por que baixa em vez de apontar para o wger
 *
 * Link direto para o servidor deles quebra quando eles reorganizam o acervo, e
 * transfere para um serviço gratuito de terceiro o tráfego de todos os nossos
 * alunos. Baixar uma vez custa alguns megabytes e acaba com as duas coisas.
 *
 * ## Idempotente
 *
 * Exercício que já tem `imagemChave` é pulado. Rodar de novo depois de
 * acrescentar linhas ao mapa traz só as novas.
 */

const prisma = new PrismaClient();

/** Mesma pasta que o `ArmazenamentoLocal` usa. */
const RAIZ = resolve(process.env.MEDIA_DIR ?? './media');

/**
 * Prefixo próprio, fora de `exercicios/<userId>/`.
 *
 * Aquele espaço é do upload do profissional e tem conferência de dono na rota
 * de vínculo; misturar mídia de catálogo ali confundiria as duas coisas.
 */
const PREFIXO = 'catalogo/exercicios';

/**
 * Vídeo do wger fica de fora por padrão, e a medição é o motivo.
 *
 * Na primeira importação: 30 imagens somaram **17,5 MB** (média de 597 KB) e
 * 14 vídeos somaram **466 MB** (média de 33 MB). Vinte e sete vezes o custo,
 * para o item de menor valor — o vídeo bom é o que o personal grava, porque
 * mostra o aparelho da academia dele e fala a língua do aluno.
 *
 * O volume de produção tem 5 GB e é dividido com as fotos de evolução dos
 * alunos. Gastar 10% dele com 14 demonstrações genéricas seria uma escolha
 * ruim feita por omissão.
 *
 *   COM_VIDEO=true pnpm --filter @vivio/api exec tsx prisma/importar-wger.ts
 */
const COM_VIDEO = process.env.COM_VIDEO === 'true';

/** Extensões conhecidas, por tipo de conteúdo — o resto é recusado. */
const POR_MIME: Readonly<Record<string, string>> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};

/**
 * A extensão sai do Content-Type, e só depois do caminho da URL.
 *
 * A primeira versão olhava só a URL e gravou 14 vídeos como `.bin`, porque o
 * wger serve vídeo por caminho sem extensão. Arquivo `.bin` é servido com o
 * tipo errado e não toca no navegador — falha silenciosa, do pior tipo: o
 * arquivo está lá, ocupando disco, e não funciona.
 */
function extensaoDe(url: string, contentType: string | null): string | null {
  const doMime = POR_MIME[(contentType ?? '').split(';')[0].trim().toLowerCase()];
  if (doMime) return doMime;

  const daUrl = extname(new URL(url).pathname).toLowerCase();
  return Object.values(POR_MIME).includes(daUrl) ? daUrl : null;
}

async function baixarPara(chaveSemExt: string, url: string): Promise<{ chave: string; bytes: number } | null> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} ao baixar ${url}`);

  const ext = extensaoDe(url, r.headers.get('content-type'));
  if (!ext) {
    console.log(`  ! formato desconhecido, ignorado: ${url}`);
    return null;
  }

  const chave = `${chaveSemExt}${ext}`;
  const bytes = Buffer.from(await r.arrayBuffer());

  const destino = join(RAIZ, chave);
  await mkdir(dirname(destino), { recursive: true });
  await writeFile(destino, bytes);
  return { chave, bytes: bytes.byteLength };
}

/** A principal quando houver; senão a primeira. */
function escolher(midias: MidiaDoWger[], tipo: 'IMAGEM' | 'VIDEO'): MidiaDoWger | null {
  return midias.find((m) => m.tipo === tipo) ?? null;
}

async function main(): Promise<void> {
  console.log(`Storage: ${RAIZ}`);
  console.log('Baixando índice do wger…');
  const indice = await indiceDeMidia();

  let importados = 0;
  let pulados = 0;
  let semCorrespondencia = 0;
  let bytes = 0;

  for (const [nome, idWger] of Object.entries(MAPA)) {
    const exercicio = await prisma.exercicio.findFirst({
      where: { nome, escopo: 'GLOBAL', deletadoEm: null },
    });

    if (!exercicio) {
      // O teste `wger.spec.ts` impede nome fora do catálogo, mas o catálogo
      // pode simplesmente ainda não ter sido semeado neste banco.
      console.log(`  ? sem exercício no banco: ${nome}`);
      semCorrespondencia += 1;
      continue;
    }

    if (exercicio.imagemChave) {
      pulados += 1;
      continue;
    }

    const midias = indice.get(idWger) ?? [];
    const imagem = escolher(midias, 'IMAGEM');
    const video = escolher(midias, 'VIDEO');

    if (!imagem && !video) {
      console.log(`  ? sem mídia no wger: ${nome} (id=${idWger})`);
      semCorrespondencia += 1;
      continue;
    }

    const dados: Record<string, string> = {};

    if (imagem) {
      const salvo = await baixarPara(`${PREFIXO}/${exercicio.id}`, imagem.url);
      if (salvo) {
        bytes += salvo.bytes;
        dados.imagemChave = salvo.chave;
        dados.imagemCredito = imagem.credito;
        dados.imagemOrigemUrl = imagem.origemUrl;
      }
    }

    /*
      O vídeo do wger só entra quando pedido E quando o exercício ainda não tem
      um. Vídeo gravado pelo profissional nunca é substituído por importação:
      ele mostra o aparelho da academia dele e fala a língua do aluno.
    */
    if (COM_VIDEO && video && !exercicio.videoChave) {
      const salvo = await baixarPara(`${PREFIXO}/${exercicio.id}-video`, video.url);
      if (salvo) {
        bytes += salvo.bytes;
        dados.videoChave = salvo.chave;
        dados.videoCredito = video.credito;
        dados.videoOrigemUrl = video.origemUrl;
      }
    }

    if (Object.keys(dados).length === 0) {
      semCorrespondencia += 1;
      continue;
    }

    await prisma.exercicio.update({ where: { id: exercicio.id }, data: dados });
    importados += 1;
    console.log(`  + ${nome}${imagem ? ' [img]' : ''}${dados.videoChave ? ' [vid]' : ''}`);
  }

  console.log('');
  console.log(`importados:          ${importados}`);
  console.log(`já tinham imagem:    ${pulados}`);
  console.log(`sem correspondência: ${semCorrespondencia}`);
  console.log(`baixado:             ${(bytes / 1024 / 1024).toFixed(1)} MB`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
