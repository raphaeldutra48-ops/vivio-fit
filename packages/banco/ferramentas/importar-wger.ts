import { PrismaClient } from '@prisma/client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { extname } from 'node:path';
import { MAPA, indiceDeMidia, type MidiaDoWger } from './wger';

/**
 * Traz para o compartimento `catalogo` do Supabase a mídia dos exercícios
 * mapeados em `MAPA`.
 *
 *   pnpm --filter @vivio/banco importar-wger
 *   SIMULAR=true pnpm --filter @vivio/banco importar-wger   (só diagnostica)
 *
 * ## Por que baixa em vez de apontar para o wger
 *
 * Link direto para o servidor deles quebra quando eles reorganizam o acervo, e
 * transfere para um serviço gratuito de terceiro o tráfego de todos os nossos
 * alunos. Baixar uma vez custa alguns megabytes e acaba com as duas coisas.
 *
 * ## Grava direto no compartimento, com a chave de serviço
 *
 * Enquanto a API existia, este importador gravava pelo driver de mídia dela,
 * escolhido pela mesma regra do boot. Com a API fora do repositório, o destino
 * é um só: o compartimento público `catalogo`, onde o
 * navegador do aluno alcança a figura sem servidor nosso no meio. Ele não tem
 * política de escrita — ninguém que use o app grava no catálogo —, então quem
 * envia é esta ferramenta, rodada à mão, como o `subir-catalogo`.
 *
 * ## Idempotente pelo ARQUIVO, não pela coluna
 *
 * Exercício com `imagemChave` preenchida não é pulado só por isso. A coluna diz
 * que o arquivo foi gravado um dia, não que ele está no compartimento — e
 * depois de uma troca de armazenamento as colunas continuam preenchidas com o
 * destino vazio. A pergunta é feita ao compartimento: o que não está lá é
 * trazido de novo.
 */

/** Prefixo próprio, fora de `exercicios/<userId>/`. */
export const PREFIXO = 'catalogo/exercicios';

/**
 * Vídeo do wger fica de fora por padrão, e a medição é o motivo.
 *
 * Na primeira importação: 30 imagens somaram **17,5 MB** (média de 597 KB) e
 * 14 vídeos somaram **466 MB** (média de 33 MB). Vinte e sete vezes o custo,
 * para o item de menor valor — o vídeo bom é o que o personal grava, porque
 * mostra o aparelho da academia dele e fala a língua do aluno.
 *
 *   COM_VIDEO=true
 */
const COM_VIDEO = process.env.COM_VIDEO === 'true';
const SIMULAR = process.env.SIMULAR === 'true';

/** Tipos aceitos e a extensão de cada um — o resto é recusado. */
const POR_MIME: Readonly<Record<string, string>> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};

/**
 * Tipo e extensão, primeiro pelo `Content-Type` e só depois pelo caminho.
 *
 * A primeira versão olhava só a URL e gravou 14 vídeos como `.bin`, porque o
 * wger serve vídeo por caminho sem extensão. Arquivo `.bin` é servido com o
 * tipo errado e não toca no navegador — falha silenciosa, do pior tipo: o
 * arquivo está lá, ocupando espaço, e não funciona.
 */
export function formatoDe(
  url: string,
  contentType: string | null,
): { mime: string; ext: string } | null {
  const mime = (contentType ?? '').split(';')[0]!.trim().toLowerCase();
  const doMime = POR_MIME[mime];
  if (doMime) return { mime, ext: doMime };

  const daUrl = extname(new URL(url).pathname).toLowerCase();
  const pelaUrl = Object.entries(POR_MIME).find(([, ext]) => ext === daUrl);
  return pelaUrl ? { mime: pelaUrl[0], ext: pelaUrl[1] } : null;
}

export interface ExercicioParaImportar {
  id: string;
  imagemChave: string | null;
  videoChave: string | null;
}

export type Motivo = 'NOVA' | 'PERDIDA';

export interface Acao {
  tipo: 'IMAGEM' | 'VIDEO';
  motivo: Motivo;
  midia: MidiaDoWger;
}

/** A chave foi gravada por este importador? Só essas ele pode refazer. */
export const ehDoCatalogo = (chave: string): boolean => chave.startsWith(`${PREFIXO}/`);

/**
 * O que fazer com um exercício. Decisão pura: não baixa, não grava, não
 * pergunta nada à rede — quem chama já mediu o que existe.
 *
 * `presentes` só importa para as chaves preenchidas: diz se o arquivo que a
 * coluna aponta ainda está no compartimento.
 */
export function planejar(
  exercicio: ExercicioParaImportar,
  midias: MidiaDoWger[],
  presentes: { imagem: boolean; video: boolean },
  opcoes: { comVideo: boolean },
): Acao[] {
  const acoes: Acao[] = [];

  const imagem = midias.find((m) => m.tipo === 'IMAGEM');
  const motivoImagem = motivoPara(exercicio.imagemChave, presentes.imagem);
  if (imagem && motivoImagem) acoes.push({ tipo: 'IMAGEM', motivo: motivoImagem, midia: imagem });

  /*
    O vídeo só entra quando pedido. E vídeo que não foi este importador que
    gravou nunca é substituído — nem quando o arquivo sumiu. O gravado pelo
    profissional mostra o aparelho da academia dele e fala a língua do aluno;
    trocá-lo por uma demonstração genérica seria perder o melhor que havia.
  */
  const video = midias.find((m) => m.tipo === 'VIDEO');
  const motivoVideo = motivoPara(exercicio.videoChave, presentes.video);
  if (opcoes.comVideo && video && motivoVideo) {
    acoes.push({ tipo: 'VIDEO', motivo: motivoVideo, midia: video });
  }

  return acoes;
}

function motivoPara(chave: string | null, presente: boolean): Motivo | null {
  if (chave === null) return 'NOVA';
  if (presente) return null;
  // Sumiu — mas só refaz o que é dele. Chave de fora é decisão de outra pessoa.
  return ehDoCatalogo(chave) ? 'PERDIDA' : null;
}

async function baixar(url: string): Promise<{ bytes: Buffer; mime: string; ext: string } | null> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} ao baixar ${url}`);
  const formato = formatoDe(url, r.headers.get('content-type'));
  if (!formato) {
    console.log(`  ! formato desconhecido, ignorado: ${url}`);
    return null;
  }
  return { bytes: Buffer.from(await r.arrayBuffer()), ...formato };
}

/** O compartimento `catalogo`, e o que já existe nele — uma listagem só. */
async function arquivosNoCatalogo(supabase: SupabaseClient): Promise<Set<string>> {
  const pasta = PREFIXO.slice('catalogo/'.length);
  const presentes = new Set<string>();
  for (let pagina = 0; ; pagina += 1) {
    const { data, error } = await supabase.storage
      .from('catalogo')
      .list(pasta, { limit: 1000, offset: pagina * 1000 });
    if (error) throw new Error(`listar o catálogo: ${error.message}`);
    for (const o of data) presentes.add(`${PREFIXO}/${o.name}`);
    if (data.length < 1000) return presentes;
  }
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const servico = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !servico) {
    console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE (packages/banco/.env.supabase).');
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(url, servico, { auth: { persistSession: false } });
  const prisma = new PrismaClient();
  try {
    console.log(`Destino: compartimento catalogo${SIMULAR ? ' — SIMULAÇÃO' : ''}`);
    const noCatalogo = await arquivosNoCatalogo(supabase);
    console.log('Baixando índice do wger…');
    const indice = await indiceDeMidia();

    const contagem = { novas: 0, perdidas: 0, intactas: 0, semCorrespondencia: 0 };
    let bytes = 0;

    for (const [nome, idWger] of Object.entries(MAPA)) {
      const exercicio = await prisma.exercicio.findFirst({
        where: { nome, escopo: 'GLOBAL', deletadoEm: null },
        select: { id: true, imagemChave: true, videoChave: true },
      });
      if (!exercicio) {
        console.log(`  ? sem exercício no banco: ${nome}`);
        contagem.semCorrespondencia += 1;
        continue;
      }

      // Chave de outro compartimento (o vídeo que o profissional gravou) não é
      // listada aqui; `planejar` já não a substitui, presente ou não.
      const presentes = {
        imagem: exercicio.imagemChave ? noCatalogo.has(exercicio.imagemChave) : false,
        video: exercicio.videoChave ? noCatalogo.has(exercicio.videoChave) : false,
      };
      const acoes = planejar(exercicio, indice.get(idWger) ?? [], presentes, {
        comVideo: COM_VIDEO,
      });

      if (acoes.length === 0) {
        if (exercicio.imagemChave) contagem.intactas += 1;
        else contagem.semCorrespondencia += 1;
        continue;
      }

      const dados: Record<string, string> = {};
      for (const acao of acoes) {
        if (acao.motivo === 'NOVA') contagem.novas += 1;
        else contagem.perdidas += 1;

        const rotulo = `${acao.tipo === 'IMAGEM' ? 'img' : 'vid'}${acao.motivo === 'PERDIDA' ? ', arquivo tinha sumido' : ''}`;
        if (SIMULAR) {
          console.log(`  ~ ${nome} [${rotulo}]`);
          continue;
        }

        const baixado = await baixar(acao.midia.url);
        if (!baixado) continue;
        const sufixo = acao.tipo === 'VIDEO' ? '-video' : '';
        const chave = `${PREFIXO}/${exercicio.id}${sufixo}${baixado.ext}`;
        const envio = await supabase.storage
          .from('catalogo')
          .upload(chave.slice('catalogo/'.length), baixado.bytes, {
            contentType: baixado.mime,
            upsert: true,
            cacheControl: '2592000',
          });
        if (envio.error) {
          // Sem arquivo, a coluna não muda: é o defeito que este arquivo existe
          // para não repetir.
          console.error(`  ! ${nome} [${rotulo}]: ${envio.error.message}`);
          process.exitCode = 1;
          continue;
        }
        bytes += baixado.bytes.byteLength;

        if (acao.tipo === 'IMAGEM') {
          dados.imagemChave = chave;
          dados.imagemCredito = acao.midia.credito;
          dados.imagemOrigemUrl = acao.midia.origemUrl;
        } else {
          dados.videoChave = chave;
          dados.videoCredito = acao.midia.credito;
          dados.videoOrigemUrl = acao.midia.origemUrl;
        }
        console.log(`  + ${nome} [${rotulo}]`);
      }

      // A coluna só muda DEPOIS de o arquivo estar gravado.
      if (Object.keys(dados).length > 0) {
        await prisma.exercicio.update({ where: { id: exercicio.id }, data: dados });
      }
    }

    console.log('');
    console.log(`novas:                        ${contagem.novas}`);
    console.log(`com arquivo perdido, refeitas: ${contagem.perdidas}${SIMULAR ? ' (a refazer)' : ''}`);
    console.log(`intactas:                     ${contagem.intactas}`);
    console.log(`sem correspondência:          ${contagem.semCorrespondencia}`);
    if (!SIMULAR) console.log(`gravado:                      ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  } finally {
    await prisma.$disconnect();
  }
}

// Só roda quando chamado como programa — o teste importa `planejar` sem disparar
// uma importação de verdade contra o banco.
if (require.main === module) {
  main().catch((erro: unknown) => {
    console.error(erro);
    process.exit(1);
  });
}
