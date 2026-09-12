import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

/**
 * Leva a mídia do catálogo para o compartimento `catalogo` do Supabase.
 *
 *   pnpm --filter @vivio/api subir-catalogo            (envia)
 *   SIMULAR=true pnpm --filter @vivio/api subir-catalogo
 *
 * As figuras do acervo foram baixadas do wger para a pasta de mídia local
 * (`MEDIA_DIR`), onde o driver antigo as guardava. Com a API saindo de cena,
 * elas precisam estar onde o navegador do aluno alcança sem servidor nosso no
 * meio — e o `catalogo` é público justamente por isso.
 *
 * ## Chave de serviço, e por quê
 *
 * O compartimento não tem política de escrita: ninguém que use o app grava no
 * catálogo. Quem envia é esta ferramenta, com a chave de serviço, rodada à
 * mão. É a mesma decisão do arquivo de regras — o catálogo é de leitura para
 * todo mundo e de escrita para ninguém.
 *
 * ## Idempotente
 *
 * Envia com `upsert`, então rodar de novo repõe o que faltar e sobrescreve o
 * que mudou. O relatório no fim compara o que o banco aponta com o que o
 * compartimento tem: chave apontando para arquivo inexistente é figura
 * quebrada na tela, e é o que esta ferramenta existe para não deixar passar.
 */

const TIPO_POR_EXTENSAO: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/** `catalogo/exercicios/x.png` → o que vai depois do nome do compartimento. */
export function caminhoNoCompartimento(chave: string): string | null {
  const [primeiro, ...resto] = chave.split('/');
  return primeiro === 'catalogo' && resto.length > 0 ? resto.join('/') : null;
}

async function main(): Promise<void> {
  const SIMULAR = process.env.SIMULAR === 'true';
  const url = process.env.SUPABASE_URL;
  const servico = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !servico) {
    console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE (apps/api/.env.supabase).');
    process.exitCode = 1;
    return;
  }

  const raiz = resolve(process.env.MEDIA_DIR ?? './media', 'catalogo');
  const supabase = createClient(url, servico, { auth: { persistSession: false } });
  const prisma = new PrismaClient();

  try {
    let arquivos: string[] = [];
    try {
      // Uma pasta só (`catalogo/exercicios`), e é a que existe.
      const dentro = await readdir(join(raiz, 'exercicios'));
      arquivos = dentro.map((a) => `exercicios/${a}`);
    } catch {
      console.log(`Sem pasta de catálogo em ${raiz} — nada a enviar daqui.`);
    }

    let enviados = 0;
    for (const relativo of arquivos) {
      const tipo = TIPO_POR_EXTENSAO[extname(relativo).toLowerCase()];
      if (!tipo) {
        console.log(`  ! formato não aceito no compartimento, pulado: ${relativo}`);
        continue;
      }
      if (SIMULAR) {
        console.log(`  ~ enviaria ${relativo}`);
        enviados += 1;
        continue;
      }
      const conteudo = await readFile(join(raiz, relativo));
      const r = await supabase.storage
        .from('catalogo')
        .upload(relativo, conteudo, { contentType: tipo, upsert: true, cacheControl: '2592000' });
      if (r.error) {
        console.error(`  ! ${relativo}: ${r.error.message}`);
        process.exitCode = 1;
        continue;
      }
      enviados += 1;
    }

    /*
      A conferência que importa: o banco aponta para arquivos que existem?
      Chave preenchida com arquivo ausente é figura quebrada na tela do aluno,
      e não aparece em lugar nenhum até alguém abrir a biblioteca.
    */
    const exercicios = await prisma.exercicio.findMany({
      where: { deletadoEm: null, OR: [{ imagemChave: { not: null } }, { videoChave: { not: null } }] },
      select: { nome: true, imagemChave: true, videoChave: true },
    });
    const noCompartimento = new Set<string>();
    for (const pasta of ['exercicios']) {
      const { data } = await supabase.storage.from('catalogo').list(pasta, { limit: 1000 });
      for (const o of data ?? []) noCompartimento.add(`${pasta}/${o.name}`);
    }

    const faltando: string[] = [];
    for (const e of exercicios) {
      for (const chave of [e.imagemChave, e.videoChave]) {
        if (!chave) continue;
        const caminho = caminhoNoCompartimento(chave);
        // Chave fora do catálogo é de outro compartimento (privado) e não é
        // assunto desta ferramenta.
        if (caminho && !noCompartimento.has(caminho)) faltando.push(`${e.nome} → ${chave}`);
      }
    }

    console.log('');
    console.log(`${SIMULAR ? 'enviaria' : 'enviados'}:            ${enviados}`);
    console.log(`no compartimento:     ${noCompartimento.size}`);
    console.log(`apontados pelo banco: ${exercicios.length}`);
    if (faltando.length > 0) {
      console.log(`SEM ARQUIVO (${faltando.length}):`);
      for (const f of faltando) console.log(`  ! ${f}`);
      process.exitCode = 1;
    } else {
      console.log('nenhuma chave do catálogo aponta para arquivo ausente.');
    }
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
