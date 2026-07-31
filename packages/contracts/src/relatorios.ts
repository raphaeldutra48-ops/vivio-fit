import { z } from 'zod';

export const consultaRelatorioSchema = z.object({
  /** Janela de análise. 30 dias cobre o ciclo típico de acompanhamento. */
  dias: z.coerce.number().int().min(7).max(365).default(30),
});
export type ConsultaRelatorio = z.infer<typeof consultaRelatorioSchema>;

/**
 * Linha do relatório de um aluno.
 *
 * Campos vêm `null` quando o aluno não autorizou aquele escopo — o relatório
 * respeita o consentimento igual ao resto do app. `null` aqui significa "não
 * posso ver", e a tela precisa dizer isso em vez de mostrar zero.
 */
export interface LinhaDoRelatorio {
  alunoId: string;
  nome: string;
  /** Escopos que este aluno autorizou a este profissional. */
  autorizou: { treino: boolean; evolucao: boolean; nutricao: boolean };

  treinosNoPeriodo: number | null;
  ultimoTreinoEm: string | null;
  /** Dias desde o último treino. `null` = nunca treinou ou sem autorização. */
  diasSemTreinar: number | null;

  pesoInicialKg: number | null;
  pesoAtualKg: number | null;
  variacaoPesoKg: number | null;

  /** Percentual de refeições marcadas como feitas no período. */
  adesaoDietaPercentual: number | null;
}

export interface RelatorioDaCarteira {
  dias: number;
  de: string;
  ate: string;
  totalAlunos: number;
  /** Alunos que registraram ao menos um treino no período. */
  alunosQueTreinaram: number;
  treinosNoPeriodo: number;
  /** Média de treinos por aluno que autorizou ver treino. */
  mediaTreinosPorAluno: number;
  linhas: LinhaDoRelatorio[];
}

/**
 * Quantos dias sem treinar já pedem uma conversa.
 *
 * Não é regra de negócio do app — é um limiar de atenção. Duas semanas sem
 * aparecer é o ponto em que a maioria desiste sem avisar.
 */
export const DIAS_PARA_ALERTA = 14;

export function precisaDeAtencao(linha: LinhaDoRelatorio): boolean {
  if (!linha.autorizou.treino) return false;
  // Nunca treinou é o caso mais urgente, não o menos.
  if (linha.diasSemTreinar === null) return linha.treinosNoPeriodo === 0;
  return linha.diasSemTreinar >= DIAS_PARA_ALERTA;
}
