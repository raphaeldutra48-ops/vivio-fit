import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { extname } from 'node:path';
import type { Armazenamento } from '../modules/midia/armazenamento';
import { ArmazenamentoLocal } from '../modules/midia/armazenamento-local';
import { ArmazenamentoR2 } from '../modules/midia/armazenamento-r2';
import {
  escolherDriverDeMidia,
  midiaEmDiscoPersistente,
} from '../modules/midia/escolher-armazenamento';
import { MAPA, indiceDeMidia, type MidiaDoWger } from './wger';

/**
 * Traz para o nosso armazenamento a mídia dos exercícios mapeados em `MAPA`.
 *
 *   pnpm --filter @vivio/api importar-wger              (desenvolvimento)
 *   IMPORTAR_WGER=true no serviço da API e deploy       (hospedagem)
 *   SIMULAR=true                                        (só diagnostica)
 *
 * ## Por que baixa em vez de apontar para o wger
 *
 * Link direto para o servidor deles quebra quando eles reorganizam o acervo, e
 * transfere para um serviço gratuito de terceiro o tráfego de todos os nossos
 * alunos. Baixar uma vez custa alguns megabytes e acaba com as duas coisas.
 *
 * ## Por que mora em `src/`, e grava pelo driver
 *
 * A primeira versão morava em `prisma/` e gravava com `writeFile` direto na
 * pasta de mídia, por fora da interface `Armazenamento`. Enquanto a mídia mora
 * no volume do Railway isso dá na mesma — a pasta É o armazenamento. Deixa de
 * dar no dia em que o destino mudar: com o R2 ligado, o importador antigo
 * seguiria gravando no disco e a API passaria a procurar no bucket, e a imagem
 * "importada" nunca apareceria na tela.
 *
 * Gravar pelo driver exige o código do driver, e a imagem de produção leva
 * `dist/`, não o código-fonte: um script em `prisma/` importando de `src/`
 * existiria no repositório e quebraria no contêiner. Por isso veio para cá, ao
 * lado do `enviar-email-teste`, pelo mesmo motivo.
 *
 * ## Idempotente pelo ARQUIVO, não pela coluna
 *
 * Antes, exercício com `imagemChave` preenchida era pulado. Só que a coluna diz
 * que o arquivo foi gravado um dia, não que ele está no armazenamento em uso —
 * e depois de uma troca de armazenamento as colunas continuam preenchidas com
 * o bucket vazio. Agora a pergunta é feita ao armazenamento: o que não está lá
 * é trazido de novo, e rodar o importador é o que repovoa o destino novo.
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
 * coluna aponta ainda está no armazenamento.
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

/**
 * O driver é o mesmo que a API usaria, escolhido pela mesma regra.
 *
 * `escolherDriverDeMidia` já grita no log quando a mídia vai para disco de
 * contêiner em produção — e é esse log que responde, na hospedagem, se o
 * bucket R2 chegou a ser configurado.
 */
function criarArmazenamento(config: ConfigService): { armazenamento: Armazenamento; r2: boolean } {
  const r2 = escolherDriverDeMidia(config, new Logger('Importador')) === 'R2';
  return {
    armazenamento: r2 ? new ArmazenamentoR2(config) : new ArmazenamentoLocal(config),
    r2,
  };
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

/**
 * O que for gravado aqui sobrevive ao próximo deploy?
 *
 * Em produção, gravar num disco que não sobrevive é fabricar link quebrado: o
 * arquivo vai para o contêiner, a coluna é preenchida, e o próximo deploy apaga
 * o arquivo e deixa a coluna.
 *
 * A pergunta é a MESMA que a API faz no boot — R2, ou volume persistente —, e
 * não "tem R2?". A primeira versão desta trava perguntava só pelo R2, e
 * recusaria importar no Railway, onde o volume guarda a mídia muito bem.
 */
export function gravacaoDura(config: ConfigService, r2: boolean): boolean {
  if (config.get<string>('NODE_ENV') !== 'production') return true;
  return r2 || midiaEmDiscoPersistente(config);
}

async function main(): Promise<void> {
  const config = new ConfigService();
  const { armazenamento, r2 } = criarArmazenamento(config);

  if (!gravacaoDura(config, r2) && !SIMULAR) {
    console.error(
      'Em produção sem R2 e sem volume persistente, importar só criaria links quebrados. ' +
        'Rode com SIMULAR=true para ver o diagnóstico sem gravar nada.',
    );
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    console.log(`Armazenamento: ${r2 ? 'R2' : 'disco local'}${SIMULAR ? ' — SIMULAÇÃO' : ''}`);
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

      const presentes = {
        imagem: exercicio.imagemChave ? await armazenamento.existe(exercicio.imagemChave) : false,
        video: exercicio.videoChave ? await armazenamento.existe(exercicio.videoChave) : false,
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
        await armazenamento.gravar(chave, baixado.bytes, baixado.mime);
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

      // A coluna só muda DEPOIS de o arquivo estar gravado: o contrário é o
      // defeito que este arquivo existe para não repetir.
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
