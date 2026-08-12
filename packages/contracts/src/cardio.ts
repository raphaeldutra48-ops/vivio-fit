import { z } from 'zod';

/**
 * Atividade cardiovascular e estimativa de gasto calórico.
 *
 * O cardio entra em dois lugares porque acontece em dois: preso a uma sessão
 * de musculação (a esteira depois do treino) ou solto na semana (a corrida de
 * domingo). É o mesmo registro — muda só se tem `execucaoId`.
 */

export const TipoCardio = {
  CAMINHADA: 'CAMINHADA',
  CORRIDA: 'CORRIDA',
  ESTEIRA: 'ESTEIRA',
  BICICLETA: 'BICICLETA',
  ELIPTICO: 'ELIPTICO',
  ESCADA: 'ESCADA',
  NATACAO: 'NATACAO',
  PULAR_CORDA: 'PULAR_CORDA',
  REMO: 'REMO',
  FUNCIONAL: 'FUNCIONAL',
  OUTRO: 'OUTRO',
} as const;
export type TipoCardio = (typeof TipoCardio)[keyof typeof TipoCardio];

export const Intensidade = {
  LEVE: 'LEVE',
  MODERADA: 'MODERADA',
  INTENSA: 'INTENSA',
} as const;
export type Intensidade = (typeof Intensidade)[keyof typeof Intensidade];

export const ROTULO_INTENSIDADE: Record<Intensidade, { titulo: string; ajuda: string }> = {
  LEVE: { titulo: 'Leve', ajuda: 'conseguia conversar normalmente' },
  MODERADA: { titulo: 'Moderada', ajuda: 'falava frases curtas' },
  INTENSA: { titulo: 'Intensa', ajuda: 'mal conseguia falar' },
};

/**
 * MET — quantas vezes o corpo gasta acima do repouso naquela atividade.
 *
 * Os valores vêm do **Compendium of Physical Activities** (Ainsworth et al.),
 * que é a referência usada por prescrição de exercício no mundo todo. Não são
 * chute nem média de internet, e por isso ficam aqui com a fonte declarada: se
 * alguém for revisar um número, precisa saber contra o que comparar.
 *
 * A intensidade muda o MET muito mais do que o tipo da atividade — correr
 * leve gasta menos que pedalar forte. Por isso a tabela é por tipo E
 * intensidade, e não um número por atividade.
 */
export const MET_POR_ATIVIDADE: Record<TipoCardio, Record<Intensidade, number>> = {
  CAMINHADA: { LEVE: 2.8, MODERADA: 3.5, INTENSA: 5.0 },
  CORRIDA: { LEVE: 6.0, MODERADA: 8.3, INTENSA: 11.0 },
  ESTEIRA: { LEVE: 4.5, MODERADA: 7.0, INTENSA: 9.8 },
  BICICLETA: { LEVE: 4.0, MODERADA: 6.8, INTENSA: 10.0 },
  ELIPTICO: { LEVE: 4.6, MODERADA: 5.0, INTENSA: 7.0 },
  ESCADA: { LEVE: 4.0, MODERADA: 8.8, INTENSA: 11.0 },
  NATACAO: { LEVE: 4.8, MODERADA: 5.8, INTENSA: 9.8 },
  PULAR_CORDA: { LEVE: 8.8, MODERADA: 11.8, INTENSA: 12.3 },
  REMO: { LEVE: 4.8, MODERADA: 7.0, INTENSA: 8.5 },
  FUNCIONAL: { LEVE: 3.5, MODERADA: 5.0, INTENSA: 8.0 },
  OUTRO: { LEVE: 3.0, MODERADA: 5.0, INTENSA: 7.0 },
};

export const ROTULO_TIPO_CARDIO: Record<TipoCardio, string> = {
  CAMINHADA: 'Caminhada',
  CORRIDA: 'Corrida',
  ESTEIRA: 'Esteira',
  BICICLETA: 'Bicicleta',
  ELIPTICO: 'Elíptico',
  ESCADA: 'Escada / simulador',
  NATACAO: 'Natação',
  PULAR_CORDA: 'Pular corda',
  REMO: 'Remo',
  FUNCIONAL: 'Funcional / circuito',
  OUTRO: 'Outro',
};

/**
 * MET da musculação.
 *
 * O Compendium trata treino de força como 3,5 (esforço moderado) a 6,0
 * (vigoroso), e esses valores **já contam o descanso entre séries** — é a
 * sessão inteira, não só o tempo sob barra. Por isso a conta usa a duração
 * total do treino sem descontar pausa.
 */
export const MET_MUSCULACAO = { LEVE: 3.5, MODERADA: 5.0, INTENSA: 6.0 } as const;

/**
 * Quilocalorias gastas, pela fórmula do ACSM.
 *
 * `kcal/min = MET × 3,5 × peso(kg) / 200`
 *
 * **Devolve `null` sem o peso, e isso é a decisão mais importante daqui.** Sem
 * peso não existe estimativa — existe chute com aparência de número, e um
 * número na tela é lido como verdade. O aluno que nunca se pesou vê travessão
 * e entende que falta registrar a medida.
 *
 * O arredondamento para dezenas é proposital: a margem real desta conta é de
 * 20% a 30%, e "437 kcal" finge uma precisão que a fisiologia não tem.
 */
export function estimarCalorias(
  met: number,
  minutos: number,
  pesoKg: number | null,
): number | null {
  if (pesoKg === null || pesoKg <= 0 || minutos <= 0) return null;
  const porMinuto = (met * 3.5 * pesoKg) / 200;
  return Math.round((porMinuto * minutos) / 10) * 10;
}

/** O MET de uma atividade, já cruzando tipo e intensidade. */
export function metDe(tipo: TipoCardio, intensidade: Intensidade): number {
  return MET_POR_ATIVIDADE[tipo][intensidade];
}

export const registrarCardioSchema = z.object({
  tipo: z.nativeEnum(TipoCardio),
  intensidade: z.nativeEnum(Intensidade).default('MODERADA'),
  duracaoMin: z.number().int().min(1).max(600),
  /** Opcional: nem toda esteira mostra distância, e nem todo mundo olha. */
  distanciaKm: z.number().min(0).max(500).optional(),
  /** Quando foi. O cliente manda porque o fuso dele não é o do servidor. */
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD'),
  observacao: z.string().max(500).optional(),
  /** Preenchido quando o cardio foi feito junto de uma sessão de musculação. */
  execucaoId: z.string().cuid().optional(),
});
export type RegistrarCardioInput = z.infer<typeof registrarCardioSchema>;

export interface CardioResumo {
  id: string;
  tipo: TipoCardio;
  intensidade: Intensidade;
  duracaoMin: number;
  distanciaKm: number | null;
  data: string;
  observacao: string | null;
  execucaoId: string | null;
  /** `null` quando não havia peso registrado para estimar. */
  caloriasEstimadas: number | null;
  criadoEm: string;
}

export const consultaCardioSchema = z.object({
  dias: z.coerce.number().int().min(1).max(365).default(30),
});
export type ConsultaCardio = z.infer<typeof consultaCardioSchema>;

/**
 * Gasto calórico do período, separado por origem.
 *
 * Separado porque responde a perguntas diferentes: o profissional olha o
 * cardio para saber se o aluno está fazendo o que foi combinado fora da sala,
 * e a musculação para saber se o treino tem o volume que ele prescreveu.
 * Somados num número só, nenhuma das duas dá para responder.
 */
export interface ResumoDeCalorias {
  dias: number;
  /** `null` quando não há peso registrado — a conta inteira depende dele. */
  pesoUsadoKg: number | null;
  musculacao: { sessoes: number; minutos: number; kcal: number | null };
  cardio: { sessoes: number; minutos: number; kcal: number | null };
  totalKcal: number | null;
}
