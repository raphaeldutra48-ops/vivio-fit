/**
 * Importação de imagens e vídeos do wger.
 *
 * O wger é uma base aberta com 834 exercícios, mas só **264 têm imagem** e
 * **46 têm vídeo** — ele preenche uma parte da nossa biblioteca, não toda. O
 * resto fica para gravação própria.
 *
 * ## O problema difícil aqui não é baixar, é casar
 *
 * Nossos nomes são em português e escritos por nós; os do wger vêm de várias
 * traduções colaborativas. Casar por semelhança é tentador e é exatamente o
 * que não se pode fazer: uma imagem **errada** é pior que imagem nenhuma —
 * ninguém desconfia de uma foto, e o aluno executa o movimento errado achando
 * que está certo.
 *
 * Por isso o casamento é por **mapa escrito à mão** (`MAPA`), nunca por
 * adivinhação. O que não está no mapa fica sem imagem, e isso é um resultado
 * aceitável.
 */

export interface MidiaDoWger {
  /** URL do arquivo no wger. */
  url: string;
  /** Crédito pronto para exibir — a licença aberta exige que apareça. */
  credito: string;
  /** Página do exercício no wger, para quem quiser conferir a origem. */
  origemUrl: string;
  tipo: 'IMAGEM' | 'VIDEO';
}

const BASE = 'https://wger.de/api/v2';

/**
 * Nome nosso → id da base de exercício no wger.
 *
 * Preenchido por conferência manual: cada linha foi olhada uma vez. Linha
 * ausente é decisão, não esquecimento — vários exercícios nossos não existem
 * lá, e vários dos que existem não têm imagem.
 */
export const MAPA: Readonly<Record<string, number>> = {
  // --- peito ---------------------------------------------------------------
  'Supino reto com barra': 73, // "Bankdrücken LH" — LH = Langhantel, barra
  'Supino reto com halteres': 75,
  'Supino inclinado com halteres': 537,
  'Peck deck (voador)': 135, // "Aperturas en máquina | Butterfly"
  Pullover: 161, // EN e DE dizem pullover; o nome italiano diverge, mas 2 de 3 fecham
  // --- costas --------------------------------------------------------------
  'Remada curvada com barra': 83,
  'Remada baixa': 394,
  'Levantamento terra': 184,
  'Encolhimento de ombros': 570,
  'Face pull': 222, // só vídeo, sem imagem
  'Good morning': 1392,
  // --- ombro ---------------------------------------------------------------
  'Elevação lateral': 348, // "com mancuernas" — halteres, como o nosso
  'Face pull para ombro': 222, // mesmo movimento do de costas, de propósito
  // --- bíceps --------------------------------------------------------------
  'Rosca direta com barra': 91,
  'Rosca martelo': 272,
  'Rosca 21': 91, // é rosca com barra; o 21 é o esquema de repetição
  // --- tríceps -------------------------------------------------------------
  'Tríceps na polia com corda': 1185, // "en polea con cuerda"
  'Tríceps testa': 50, // "Barbell Triceps Extension"
  // --- perna ---------------------------------------------------------------
  'Agachamento frontal': 257,
  'Leg press 45': 371,
  'Hack machine': 375, // "Hackenschmidtmaschine" é exatamente o hack
  'Levantamento terra sumô': 630,
  'Agachamento pistol': 456,
  // --- glúteo --------------------------------------------------------------
  'Elevação pélvica': 294, // "Beckenheben | Hip Thrust" — só vídeo
  // --- panturrilha ---------------------------------------------------------
  'Panturrilha no leg press': 146, // "Calf Press Using Leg Press Machine"
  // --- abdômen -------------------------------------------------------------
  'Prancha abdominal': 458, // "Onderarmplanken" — prancha de antebraço
  'Abdominal supra': 167,
  'Russian twist': 1193,
  'Ab wheel': 1573,
  'Bird dog': 1572,
  'Hollow hold': 297,
  // --- corpo inteiro -------------------------------------------------------
  'Kettlebell swing': 960,
  'Wall ball': 1100,
};

/*
  ## O que foi RECUSADO, e por quê

  Fica registrado porque a recusa é a parte que se perde: quem reabrir isto
  daqui a um ano vai encontrar os mesmos candidatos de nota alta e refazer o
  mesmo trabalho para chegar à mesma conclusão.

  **Equipamento diferente do nosso** — a foto mostraria outro aparelho:
  - "Supino inclinado com barra" (0.67) casava com o de HALTERES
  - "Elevação lateral na polia" e "inclinada" (0.50) casavam com o de MÁQUINA
  - "Leg press horizontal" (0.67) casava com o leg press 45
  - "Rosca direta com halteres" (0.50) casava com o de BARRA
  - "Desenvolvimento militar" casava com a versão de barra W

  **Movimento diferente, apesar do nome parecido:**
  - "Levantamento terra romeno" (0.67) casava com o terra CONVENCIONAL —
    são exercícios distintos, não variações de foto
  - "Agachamento sumô" casava com "Sumo Deadlift", que é levantamento terra
  - "Puxada frontal" casava com "Front Squats"
  - "Tríceps coice" (0.50) casava com "Contraccolpi in ginocchio" — coice de
    GLÚTEO ajoelhado, outro músculo
  - "Rosca no banco inclinado" (0.50) casava com abdominal em banco inclinado
  - "Remo ergômetro" (0.50) casava com remada T de costas

  **Tradução errada no próprio wger:**
  - "Flexão de braço" casava com id=475, cujo nome em português é "Flexões de
    braço" mas cujo nome em espanhol e alemão é "Dominadas"/"Klimmzüge" —
    barra fixa. O nome PT está errado lá, e confiar nele traria a foto de uma
    barra fixa para uma flexão de solo.

  Os 123 restantes ficam sem mídia do wger e são candidatos naturais à
  gravação própria — começando pelos mais usados.
*/

/** Licenças do wger, pelo id que a API devolve. */
const LICENCAS: Readonly<Record<number, string>> = {
  1: 'CC-BY-SA 3.0',
  2: 'CC-BY 4.0',
  3: 'CC-BY-SA 4.0',
  4: 'CC0 1.0',
  5: 'ODbL',
};

function creditoDe(autor: string | null, licencaId: number): string {
  const licenca = LICENCAS[licencaId] ?? `licença ${licencaId}`;
  const quem = autor?.trim() || 'wger';
  return `${quem} — ${licenca} (via wger)`;
}

async function json<T>(caminho: string): Promise<T> {
  const r = await fetch(`${BASE}${caminho}`, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`wger ${caminho}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

interface RespostaPaginada<T> {
  next: string | null;
  results: T[];
}

interface ImagemWger {
  exercise: number;
  image: string;
  is_main: boolean;
  license: number;
  license_author: string | null;
}

interface VideoWger {
  exercise: number;
  video: string;
  license: number;
  license_author: string | null;
}

/**
 * Baixa o índice de mídia do wger de uma vez.
 *
 * São ~360 imagens e 78 vídeos: cabe na memória com folga, e uma consulta por
 * exercício seriam 156 requisições contra um serviço gratuito de terceiro.
 */
export async function indiceDeMidia(): Promise<Map<number, MidiaDoWger[]>> {
  const porExercicio = new Map<number, MidiaDoWger[]>();

  const guardar = (exercicio: number, midia: MidiaDoWger) => {
    const atual = porExercicio.get(exercicio) ?? [];
    atual.push(midia);
    porExercicio.set(exercicio, atual);
  };

  let caminho: string | null = '/exerciseimage/?format=json&limit=200';
  while (caminho) {
    const p: RespostaPaginada<ImagemWger> = await json(caminho);
    for (const i of p.results) {
      guardar(i.exercise, {
        url: i.image,
        credito: creditoDe(i.license_author, i.license),
        origemUrl: `https://wger.de/en/exercise/${i.exercise}/view/`,
        tipo: 'IMAGEM',
      });
    }
    caminho = p.next ? p.next.replace(BASE, '') : null;
  }

  let v: string | null = '/video/?format=json&limit=100';
  while (v) {
    const p: RespostaPaginada<VideoWger> = await json(v);
    for (const i of p.results) {
      guardar(i.exercise, {
        url: i.video,
        credito: creditoDe(i.license_author, i.license),
        origemUrl: `https://wger.de/en/exercise/${i.exercise}/view/`,
        tipo: 'VIDEO',
      });
    }
    v = p.next ? p.next.replace(BASE, '') : null;
  }

  return porExercicio;
}

/** Nomes do wger (todas as traduções) por id de exercício — usado no mapeamento. */
export async function nomesPorExercicio(): Promise<Map<number, string[]>> {
  const nomes = new Map<number, string[]>();
  let caminho: string | null = '/exercise-translation/?format=json&limit=500';

  while (caminho) {
    const p: RespostaPaginada<{ exercise: number; name: string; language: number }> =
      await json(caminho);
    for (const t of p.results) {
      const atual = nomes.get(t.exercise) ?? [];
      // Português (7) primeiro na lista: é o que ajuda a conferência humana.
      if (t.language === 7) atual.unshift(t.name);
      else atual.push(t.name);
      nomes.set(t.exercise, atual);
    }
    caminho = p.next ? p.next.replace(BASE, '') : null;
  }

  return nomes;
}
