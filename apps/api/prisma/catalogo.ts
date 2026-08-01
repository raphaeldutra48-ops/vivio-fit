import type { PrismaClient } from '@prisma/client';

/**
 * Catálogo que a aplicação precisa para ser usável: biblioteca global de
 * exercícios e tabela de composição de alimentos.
 *
 * Mora fora do `seed.ts` porque não é dado de demonstração — é conteúdo do
 * produto. O seed de desenvolvimento chama daqui; em produção o mesmo catálogo
 * entra por `semear-catalogo.ts`, sem Ana, Bruno nem a equipe de exemplo junto.
 *
 * Idempotente: cada item só é criado se ainda não existir, então rodar de novo
 * depois de acrescentar linhas insere só as novas.
 */
export async function semearCatalogo(
  prisma: PrismaClient,
  /** Autor dos exercícios globais — o admin da instalação. */
  criadoPorId: string,
): Promise<{ exercicios: number; alimentos: number }> {
  // --- Biblioteca global de exercícios ------------------------------------
  const exerciciosGlobais = [
    ['Supino reto com barra', 'PEITO', 'Barra', 'Escápulas retraídas, barra na linha do mamilo.'],
    ['Supino inclinado com halteres', 'PEITO', 'Halteres', 'Banco a 30-45 graus.'],
    ['Crucifixo na polia', 'PEITO', 'Polia', 'Cotovelos levemente flexionados e fixos.'],
    ['Puxada frontal', 'COSTAS', 'Polia alta', 'Puxar com os cotovelos, não com as mãos.'],
    ['Remada curvada', 'COSTAS', 'Barra', 'Coluna neutra, tronco a 45 graus.'],
    ['Remada unilateral', 'COSTAS', 'Haltere', 'Apoiar o joelho e a mão no banco.'],
    ['Desenvolvimento militar', 'OMBRO', 'Barra', 'Não hiperestender a lombar.'],
    ['Elevação lateral', 'OMBRO', 'Halteres', 'Subir até a linha do ombro, sem balanço.'],
    ['Rosca direta', 'BICEPS', 'Barra', 'Cotovelos junto ao tronco.'],
    ['Rosca martelo', 'BICEPS', 'Halteres', 'Pegada neutra durante todo o movimento.'],
    ['Tríceps na polia', 'TRICEPS', 'Polia alta', 'Cotovelos fixos ao lado do corpo.'],
    ['Tríceps testa', 'TRICEPS', 'Barra W', 'Descer a barra até a testa, cotovelos parados.'],
    ['Agachamento livre', 'PERNA', 'Barra', 'Joelhos alinhados aos pés, descer até paralela.'],
    ['Leg press 45', 'PERNA', 'Máquina', 'Não travar o joelho na extensão.'],
    ['Cadeira extensora', 'PERNA', 'Máquina', 'Controlar a fase excêntrica.'],
    ['Mesa flexora', 'PERNA', 'Máquina', 'Quadril apoiado, sem tirar do banco.'],
    ['Levantamento terra', 'COSTAS', 'Barra', 'Coluna neutra; barra rente às pernas.'],
    ['Elevação pélvica', 'GLUTEO', 'Barra', 'Contrair o glúteo no topo por 1 segundo.'],
    ['Panturrilha em pé', 'PANTURRILHA', 'Máquina', 'Amplitude completa, pausa embaixo.'],
    ['Prancha abdominal', 'ABDOMEN', 'Peso corporal', 'Quadril alinhado, sem elevar.'],
    ['Abdominal supra', 'ABDOMEN', 'Peso corporal', 'Sem puxar o pescoço.'],
    ['Esteira — caminhada inclinada', 'CARDIO', 'Esteira', 'Inclinação 8-12%, sem se apoiar.'],
    ['Burpee', 'CORPO_INTEIRO', 'Peso corporal', 'Movimento contínuo e controlado.'],
  ] as const;

  for (const [nome, grupoMuscular, equipamento, instrucoes] of exerciciosGlobais) {
    const existente = await prisma.exercicio.findFirst({
      where: { nome, escopo: 'GLOBAL' },
    });
    if (!existente) {
      await prisma.exercicio.create({
        data: {
          nome,
          grupoMuscular,
          equipamento,
          instrucoes,
          escopo: 'GLOBAL',
          criadoPorId,
        },
      });
    }
  }

  // --- Tabela de alimentos (valores por 100 g) ----------------------------
  // Subconjunto da TACO/IBGE para desenvolvimento. Confirmar licença de uso
  // comercial antes do lançamento (ver docs/PROMPT-BUILD.md, seção 11).
  const alimentos = [
    // nome, grupo, kcal, prot, carbo, gord, fibra, medida caseira, gramas
    ['Peito de frango grelhado', 'PROTEINA', 159, 32.0, 0, 2.5, 0, '1 filé médio', 100],
    ['Patinho bovino grelhado', 'PROTEINA', 219, 35.9, 0, 7.3, 0, '1 bife médio', 100],
    ['Tilápia grelhada', 'PROTEINA', 128, 26.1, 0, 2.0, 0, '1 filé', 120],
    ['Salmão grelhado', 'PROTEINA', 232, 23.8, 0, 15.0, 0, '1 posta', 130],
    ['Ovo de galinha cozido', 'PROTEINA', 146, 13.3, 0.6, 9.5, 0, '2 unidades', 100],
    ['Clara de ovo cozida', 'PROTEINA', 59, 13.4, 0, 0.1, 0, '4 claras', 130],
    ['Whey protein concentrado', 'PROTEINA', 400, 80.0, 8.0, 5.0, 0, '1 scoop', 30],
    ['Queijo cottage', 'PROTEINA', 98, 11.1, 3.4, 4.3, 0, '3 colheres de sopa', 60],
    ['Atum em água', 'PROTEINA', 116, 25.5, 0, 1.0, 0, '1 lata drenada', 120],
    ['Carne suína lombo assado', 'PROTEINA', 210, 29.0, 0, 10.0, 0, '1 fatia', 100],

    ['Arroz branco cozido', 'CARBOIDRATO', 128, 2.5, 28.1, 0.2, 1.6, '4 colheres de sopa', 100],
    ['Arroz integral cozido', 'CARBOIDRATO', 124, 2.6, 25.8, 1.0, 2.7, '4 colheres de sopa', 100],
    ['Batata doce cozida', 'CARBOIDRATO', 77, 0.6, 18.4, 0.1, 2.2, '1 unidade pequena', 100],
    ['Batata inglesa cozida', 'CARBOIDRATO', 52, 1.2, 11.9, 0, 1.3, '1 unidade média', 100],
    ['Mandioca cozida', 'CARBOIDRATO', 125, 0.6, 30.1, 0.3, 1.6, '1 pedaço', 100],
    ['Macarrão cozido', 'CARBOIDRATO', 111, 3.9, 22.0, 1.0, 1.5, '1 pegador', 100],
    ['Pão francês', 'CARBOIDRATO', 300, 8.0, 58.6, 3.1, 2.3, '1 unidade', 50],
    ['Pão integral', 'CARBOIDRATO', 253, 9.4, 49.9, 3.4, 6.9, '2 fatias', 50],
    ['Aveia em flocos', 'CARBOIDRATO', 394, 13.9, 66.6, 8.5, 9.1, '3 colheres de sopa', 30],
    ['Tapioca goma', 'CARBOIDRATO', 240, 0, 60.0, 0, 0, '1 unidade média', 60],
    ['Cuscuz de milho cozido', 'CARBOIDRATO', 113, 2.4, 25.3, 0.5, 1.4, '1 fatia', 100],

    ['Feijão carioca cozido', 'LEGUMINOSA', 76, 4.8, 13.6, 0.5, 8.5, '1 concha', 80],
    ['Feijão preto cozido', 'LEGUMINOSA', 77, 4.5, 14.0, 0.5, 8.4, '1 concha', 80],
    ['Lentilha cozida', 'LEGUMINOSA', 93, 6.3, 16.3, 0.5, 7.9, '1 concha', 80],
    ['Grão de bico cozido', 'LEGUMINOSA', 130, 8.4, 21.2, 2.1, 5.4, '1 concha', 80],

    ['Brócolis cozido', 'VEGETAL', 25, 2.1, 4.4, 0.5, 3.4, '1 pires', 80],
    ['Abobrinha refogada', 'VEGETAL', 25, 1.1, 4.3, 0.6, 1.6, '3 colheres de sopa', 80],
    ['Cenoura crua', 'VEGETAL', 34, 1.3, 7.7, 0.2, 3.2, '1 unidade média', 80],
    ['Alface crespa', 'VEGETAL', 11, 1.3, 1.7, 0.2, 1.8, '4 folhas', 40],
    ['Tomate cru', 'VEGETAL', 15, 1.1, 3.1, 0.2, 1.2, '1 unidade média', 100],
    ['Couve refogada', 'VEGETAL', 90, 1.7, 3.5, 7.9, 3.1, '2 colheres de sopa', 40],

    ['Banana prata', 'FRUTA', 98, 1.3, 26.0, 0.1, 2.0, '1 unidade média', 70],
    ['Maçã com casca', 'FRUTA', 56, 0.3, 15.2, 0, 1.3, '1 unidade média', 130],
    ['Mamão papaia', 'FRUTA', 40, 0.5, 10.4, 0.1, 1.0, '1 fatia', 100],
    ['Laranja pera', 'FRUTA', 37, 1.0, 8.9, 0.1, 0.8, '1 unidade', 130],
    ['Morango', 'FRUTA', 30, 0.9, 6.8, 0.3, 1.7, '1 xícara', 150],
    ['Abacate', 'FRUTA', 96, 1.2, 6.0, 8.4, 6.3, '3 colheres de sopa', 60],

    ['Azeite de oliva', 'GORDURA', 884, 0, 0, 100.0, 0, '1 colher de sopa', 13],
    ['Castanha do Pará', 'GORDURA', 643, 14.5, 15.1, 63.5, 7.9, '3 unidades', 15],
    ['Amendoim torrado', 'GORDURA', 544, 27.4, 20.3, 43.9, 8.0, '1 punhado', 30],
    ['Pasta de amendoim integral', 'GORDURA', 588, 25.0, 20.0, 50.0, 6.0, '1 colher de sopa', 20],

    ['Leite integral', 'LATICINIO', 61, 2.9, 4.3, 3.2, 0, '1 copo', 200],
    ['Leite desnatado', 'LATICINIO', 35, 3.4, 4.9, 0.2, 0, '1 copo', 200],
    ['Iogurte natural integral', 'LATICINIO', 61, 3.5, 4.7, 3.3, 0, '1 pote', 170],
    ['Queijo minas frescal', 'LATICINIO', 264, 17.4, 3.2, 20.2, 0, '1 fatia', 30],
  ] as const;

  for (const [nome, grupo, kcal, prot, carbo, gord, fibra, medida, gramas] of alimentos) {
    const existente = await prisma.alimento.findFirst({ where: { nome } });
    if (!existente) {
      await prisma.alimento.create({
        data: {
          nome,
          grupo,
          kcal,
          proteinaG: prot,
          carboidratoG: carbo,
          gorduraG: gord,
          fibraG: fibra,
          medidaCaseira: medida,
          medidaGramas: gramas,
          fonte: 'TACO',
        },
      });
    }
  }
  return { exercicios: exerciciosGlobais.length, alimentos: alimentos.length };
}
