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

  /**
   * Dias desde o último check-in. `null` = nunca fez, ou não autorizou
   * evolução.
   *
   * Entrou porque só "dias sem treinar" deixava passar o caso mais comum de
   * abandono: quem para de registrar antes de parar de aparecer. O check-in
   * some primeiro.
   */
  diasSemCheckin: number | null;
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

/**
 * Limiar do check-in, menor que o do treino de propósito.
 *
 * Ninguém treina todo dia, mas quem está engajado registra com frequência.
 * Uma semana sem check-in é sinal mais cedo que duas semanas sem treinar — e
 * chegar cedo é o ponto de um alerta de adesão.
 */
export const DIAS_SEM_CHECKIN_PARA_ALERTA = 7;

export interface LimiaresDeAtencao {
  diasSemTreinar: number;
  diasSemCheckin: number;
}

export const LIMIARES_PADRAO: LimiaresDeAtencao = {
  diasSemTreinar: DIAS_PARA_ALERTA,
  diasSemCheckin: DIAS_SEM_CHECKIN_PARA_ALERTA,
};

/** O porquê do alerta, para a tela dizer em vez de só pintar de vermelho. */
export type MotivoDeAtencao = 'NUNCA_TREINOU' | 'SUMIU_DO_TREINO' | 'PAROU_DE_REGISTRAR';

export const TEXTO_MOTIVO: Record<MotivoDeAtencao, string> = {
  NUNCA_TREINOU: 'nunca registrou treino',
  SUMIU_DO_TREINO: 'sem treinar há muito tempo',
  PAROU_DE_REGISTRAR: 'parou de fazer check-in',
};

/**
 * Por que este aluno precisa de atenção — ou `null` se não precisa.
 *
 * Devolve o motivo, e não um booleano, porque as três situações pedem
 * conversas diferentes: quem nunca começou precisa de ajuda para começar, quem
 * sumiu precisa ser buscado, e quem parou de registrar talvez esteja treinando
 * e só abandonou o app.
 */
export function motivoDeAtencao(
  linha: LinhaDoRelatorio,
  limiares: LimiaresDeAtencao = LIMIARES_PADRAO,
): MotivoDeAtencao | null {
  if (linha.autorizou.treino) {
    // Nunca treinou é o caso mais urgente, não o menos.
    if (linha.diasSemTreinar === null && linha.treinosNoPeriodo === 0) return 'NUNCA_TREINOU';
    if (linha.diasSemTreinar !== null && linha.diasSemTreinar >= limiares.diasSemTreinar) {
      return 'SUMIU_DO_TREINO';
    }
  }

  /*
    O check-in só acusa quem JÁ registrou alguma vez. Aluno que nunca usou o
    recurso não "parou" — e marcá-lo de vermelho por isso faria o profissional
    cobrar algo que talvez nem tenha sido apresentado.
  */
  if (
    linha.autorizou.evolucao &&
    linha.diasSemCheckin !== null &&
    linha.diasSemCheckin >= limiares.diasSemCheckin
  ) {
    return 'PAROU_DE_REGISTRAR';
  }

  return null;
}

export function precisaDeAtencao(
  linha: LinhaDoRelatorio,
  limiares: LimiaresDeAtencao = LIMIARES_PADRAO,
): boolean {
  return motivoDeAtencao(linha, limiares) !== null;
}
