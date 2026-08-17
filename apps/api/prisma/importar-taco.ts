/**
 * Importa a Tabela Brasileira de Composição de Alimentos (TACO) para o catálogo.
 *
 * Por que isto existe: o catálogo curado tem 45 alimentos, e uma dieta
 * brasileira comum estoura esse limite na primeira refeição — não havia ovo nem
 * alface. Na leitura automática de dieta, o item que não existe no catálogo vira
 * trabalho manual, e o gargalo passou a ser a tabela, não o código.
 *
 * A TACO é da UNICAMP (NEPA) e traz valores por 100 g de alimento in natura ou
 * preparado. **Não traz medida caseira** — "1 concha", "4 colheres" são do
 * catálogo curado, escritos à mão, e é por isso que os 45 originais não são
 * substituídos: eles são melhores para o aluno, que pensa em concha e não em
 * grama. Os importados entram com `medidaCaseira` nula, e a tela lida com isso.
 *
 * Também não traz suplemento: whey, creatina e afins não são alimento e ficam
 * na curadoria.
 *
 * Idempotente: alimento com o mesmo nome normalizado é pulado, não duplicado.
 * Rodar de novo depois de acrescentar itens à mão não desfaz nada.
 *
 * Uso: `pnpm importar-taco` (usa prisma/dados/taco.json) ou
 *      `pnpm importar-taco <outro-arquivo.json>`
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface LinhaTaco {
  description: string;
  category: string;
  energy_kcal: number | string;
  protein_g: number | string;
  lipid_g: number | string;
  carbohydrate_g: number | string;
  fiber_g: number | string;
  sodium_mg: number | string;
}

/**
 * Da taxonomia da TACO para a do app.
 *
 * A do app é por papel na dieta — o que o profissional pensa ao montar uma
 * refeição — e não por origem biológica. Por isso "Pescados" e "Carnes" caem
 * ambos em PROTEINA, e "Nozes e sementes" em GORDURA: castanha entra na dieta
 * como fonte de gordura, não como semente.
 */
const GRUPO_POR_CATEGORIA: Record<string, string> = {
  'Carnes e derivados': 'PROTEINA',
  'Pescados e frutos do mar': 'PROTEINA',
  'Ovos e derivados': 'PROTEINA',
  'Leite e derivados': 'LATICINIO',
  'Leguminosas e derivados': 'LEGUMINOSA',
  'Cereais e derivados': 'CARBOIDRATO',
  'Frutas e derivados': 'FRUTA',
  'Verduras, hortaliças e derivados': 'VEGETAL',
  'Gorduras e óleos': 'GORDURA',
  'Nozes e sementes': 'GORDURA',
  'Produtos açucarados': 'CARBOIDRATO',
  'Alimentos preparados': 'PREPARADO',
  'Bebidas (alcoólicas e não alcoólicas)': 'BEBIDA',
  Miscelâneas: 'OUTRO',
  'Outros alimentos industrializados': 'OUTRO',
};

/**
 * A TACO marca o que não foi medido: `NA` (não analisado), `Tr` (traço, abaixo
 * do limite de detecção) e vazio. Nenhum dos três é zero.
 *
 * `Tr` vira 0 porque traço é "existe mas é desprezível" — somar zero na dieta
 * está certo. `NA` e vazio viram `null`: não foi medido, e escrever 0 ali
 * afirmaria ausência que ninguém verificou.
 */
function numero(v: number | string | undefined): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v === 'Tr') return 0;
  return null;
}

/** Duas grafias do mesmo alimento têm de colidir, senão a tabela duplica. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * "Arroz, integral, cozido" → "Arroz integral cozido".
 *
 * A TACO separa qualificadores por vírgula, o que é ótimo para tabela impressa
 * e ruim para uma lista onde a pessoa procura digitando. O nome fica com a
 * mesma cara dos 45 curados.
 */
function nomeLegivel(descricao: string): string {
  const limpo = descricao
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return limpo.charAt(0).toUpperCase() + limpo.slice(1);
}

async function principal(): Promise<void> {
  // Sem argumento, usa o arquivo versionado: e assim que roda em producao,
  // onde nao ha ninguem para digitar caminho.
  const caminho = process.argv[2] ?? join(__dirname, 'dados', 'taco.json');

  const prisma = new PrismaClient();
  try {
    const bruto: unknown = JSON.parse(readFileSync(caminho, 'utf8'));
    const linhas = (Array.isArray(bruto) ? bruto : []) as LinhaTaco[];
    if (linhas.length === 0) throw new Error('Arquivo sem registros no formato esperado.');

    const existentes = await prisma.alimento.findMany({ select: { nome: true } });
    const jaTem = new Set(existentes.map((a) => normalizar(a.nome)));

    let inseridos = 0;
    let pulados = 0;
    let semEnergia = 0;

    for (const linha of linhas) {
      const kcal = numero(linha.energy_kcal);
      /*
        Sem energia o alimento não serve para montar dieta — a conta de
        caloria é o motivo de a tabela existir. Melhor ficar de fora do que
        aparecer na busca e somar nada.
      */
      if (kcal === null) {
        semEnergia += 1;
        continue;
      }

      const nome = nomeLegivel(linha.description);
      if (jaTem.has(normalizar(nome))) {
        pulados += 1;
        continue;
      }
      jaTem.add(normalizar(nome));

      await prisma.alimento.create({
        data: {
          nome,
          grupo: GRUPO_POR_CATEGORIA[linha.category] ?? 'OUTRO',
          kcal,
          proteinaG: numero(linha.protein_g) ?? 0,
          carboidratoG: numero(linha.carbohydrate_g) ?? 0,
          gorduraG: numero(linha.lipid_g) ?? 0,
          fibraG: numero(linha.fiber_g),
          sodioMg: numero(linha.sodium_mg),
          // A TACO não tem medida caseira. Nula é honesto; inventar "1 porção"
          // colocaria um número na tela que ninguém mediu.
          medidaCaseira: null,
          medidaGramas: null,
          fonte: 'TACO',
        },
      });
      inseridos += 1;
    }

    const total = await prisma.alimento.count();
    console.log(`inseridos: ${inseridos}`);
    console.log(`pulados  : ${pulados} (já existiam, curados ou de execução anterior)`);
    console.log(`sem kcal : ${semEnergia} (fora da tabela de propósito)`);
    console.log(`catálogo : ${total} alimentos`);
  } finally {
    await prisma.$disconnect();
  }
}

void principal();
