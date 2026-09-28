import { PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { urlDoBanco } from '../conexao';

/**
 * Confere que toda TABELA e toda COLUNA citadas nos arquivos de regra existem.
 *
 *   pnpm --filter @vivio/banco rls:conferir
 *
 * Existe porque escrever política é escrever SQL sem compilador: um nome errado
 * só aparece na hora de aplicar, uma falha por vez. Três colunas foram supostas
 * errado num arquivo só — `planoId` onde era `planoDietaId`, `criadoPorId` onde
 * era `profissionalId`, `usuarioId` onde era `userId`.
 *
 * ## A tabela que não existe mais, e por que isto passou a olhar tabela também
 *
 * Em 28/09/2026 o aplicador morreu em `relation "public.SessaoRefresh" does not
 * exist`: a migração de 22/09 apagou as três tabelas da autenticação antiga, e
 * duas linhas que ligavam RLS nelas ficaram nos arquivos. O efeito é o pior
 * possível para uma ferramenta de regras — aplicação PARCIAL: os arquivos depois
 * do 05 não rodaram.
 *
 * E nenhuma auditoria acusou, porque auditor LÊ O BANCO, e o banco estava certo
 * (as regras já estavam aplicadas de antes). Só reaplicar revelava. Agora este
 * conferidor pega antes, sem tocar em nada: ele compara o que os arquivos citam
 * com o que existe.
 */
async function principal(): Promise<void> {
  const prisma = new PrismaClient({
    datasourceUrl: urlDoBanco(),
  });
  try {
    const colunas = await prisma.$queryRawUnsafe<{ tabela: string; coluna: string }[]>(
      `select table_name tabela, column_name coluna from information_schema.columns
       where table_schema='public'`);
    const existe = new Set(colunas.map((c) => `${c.tabela}.${c.coluna}`));

    const tabelasNoBanco = new Set(colunas.map((c) => c.tabela));

    const pasta = join(__dirname, 'rls');
    let problemas = 0;
    for (const arq of readdirSync(pasta).filter((a) => a.endsWith('.sql')).sort()) {
      const sql = readFileSync(join(pasta, arq), 'utf8').replace(/^\s*--.*$/gm, '');

      /*
        Toda tabela citada como `public."X"` — em `alter table`, `revoke`,
        `create policy`, `create trigger` ou dentro do corpo de uma política.
        Comentário de bloco sai antes: ele fala de tabelas que já não existem, e
        é texto, não comando.
      */
      const semComentarios = sql.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of semComentarios.matchAll(/public\."(\w+)"/g)) {
        const tabela = m[1]!;
        if (!tabelasNoBanco.has(tabela)) {
          console.log(`  ${arq}: tabela ${tabela} NAO EXISTE`);
          problemas++;
        }
      }
      // Cada `on public."X" for select using ( ... )` e as colunas citadas nele
      for (const m of sql.matchAll(/on public\."(\w+)" for \w+ using \(([\s\S]*?)\);\s*$/gm)) {
        const [, tabela, corpo] = m;
        for (const c of corpo!.matchAll(/(?<!\w\.)"(\w+)"(?!\.)/g)) {
          const nome = c[1]!;
          // Nomes de tabela citados em subconsulta não são coluna.
          if (/^[A-Z]/.test(nome)) continue;
          if (!existe.has(`${tabela}.${nome}`)) {
            console.log(`  ${arq}: ${tabela}.${nome} NAO EXISTE`);
            problemas++;
          }
        }
      }
    }
    console.log(
      problemas === 0
        ? 'Todas as tabelas e colunas citadas existem.'
        : `${problemas} problema(s).`,
    );
    if (problemas > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
void principal();
