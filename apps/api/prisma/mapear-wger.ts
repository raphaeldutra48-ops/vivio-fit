import { writeFileSync } from 'node:fs';
import { EXERCICIOS_GLOBAIS } from './exercicios-globais';
import { indiceDeMidia, nomesPorExercicio } from './wger';

/**
 * Gera a lista de candidatos para o mapa `MAPA` de `wger.ts`.
 *
 * **Não escreve nada no banco e não decide nada.** A saída é para conferência
 * humana, e é assim de propósito: casar automático por semelhança de nome
 * colocaria a imagem do movimento errado no exercício, e ninguém desconfia de
 * uma foto — o aluno executa errado achando que está certo.
 *
 *   pnpm --filter @vivio/api exec tsx prisma/mapear-wger.ts
 */

/** Sem acento, sem pontuação, minúsculo — só para comparar. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Palavras que aparecem em quase tudo e só atrapalham a comparação. */
const VAZIAS = new Set([
  'com', 'de', 'do', 'da', 'na', 'no', 'em', 'a', 'o', 'e',
  'with', 'the', 'and', 'on', 'in', 'to', 'for', 'bar', 'barra',
]);

function palavras(texto: string): Set<string> {
  return new Set(
    normalizar(texto)
      .split(' ')
      .filter((p) => p.length > 2 && !VAZIAS.has(p)),
  );
}

/** Jaccard: quanto as duas listas de palavras se sobrepõem, de 0 a 1. */
function semelhanca(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let comuns = 0;
  for (const p of a) if (b.has(p)) comuns += 1;
  return comuns / (a.size + b.size - comuns);
}

async function main(): Promise<void> {
  console.log('Baixando índice do wger…');
  const [midia, nomes] = await Promise.all([indiceDeMidia(), nomesPorExercicio()]);
  console.log(`  ${midia.size} exercícios do wger têm mídia.`);

  // Só interessam os que TÊM mídia: os outros não resolvem nada aqui.
  /*
    Um conjunto de palavras POR NOME, e não um só com todos os idiomas juntos.
    Concatenar inflava o denominador do Jaccard e afundava justamente os
    acertos: "Supino Inclinado com Halteres" tirava 0.21 porque disputava com
    as versões em francês e inglês do mesmo exercício.
  */
  const candidatos = [...midia.keys()].map((id) => ({
    id,
    nomes: nomes.get(id) ?? [],
    porNome: (nomes.get(id) ?? []).map(palavras),
    temImagem: (midia.get(id) ?? []).some((m) => m.tipo === 'IMAGEM'),
    temVideo: (midia.get(id) ?? []).some((m) => m.tipo === 'VIDEO'),
  }));

  const linhas: string[] = [];
  let comCandidatoForte = 0;

  for (const [nome, grupo] of EXERCICIOS_GLOBAIS) {
    const nossas = palavras(nome);
    const melhores = candidatos
      .map((c) => ({
        ...c,
        // O melhor idioma vence: basta UM nome bater bem para ser candidato.
        escore: Math.max(0, ...c.porNome.map((p) => semelhanca(nossas, p))),
      }))
      .filter((c) => c.escore > 0.25)
      .sort((a, b) => b.escore - a.escore)
      .slice(0, 3);

    if (melhores[0] && melhores[0].escore >= 0.4) comCandidatoForte += 1;

    linhas.push(`\n## ${nome}  [${grupo}]`);
    if (melhores.length === 0) {
      linhas.push('   (nenhum candidato)');
      continue;
    }
    for (const c of melhores) {
      const marca = `${c.temImagem ? 'IMG' : '---'}/${c.temVideo ? 'VID' : '---'}`;
      linhas.push(
        `   ${c.escore.toFixed(2)}  ${marca}  id=${c.id}  ${c.nomes.slice(0, 3).join(' | ')}`,
      );
    }
  }

  const saida = `Candidatos wger — conferir à mão antes de virar MAPA
${EXERCICIOS_GLOBAIS.length} exercícios nossos · ${midia.size} do wger com mídia
${comCandidatoForte} com candidato de escore >= 0.40
${linhas.join('\n')}
`;

  writeFileSync('candidatos-wger.txt', saida, 'utf8');
  console.log(`\nEscrito em candidatos-wger.txt (${comCandidatoForte} com candidato forte).`);
}

void main();
