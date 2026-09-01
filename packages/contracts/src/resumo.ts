import { EscopoDado } from './enums';

/**
 * O resumo do profissional — a tela que responde "quem precisa de mim hoje?".
 *
 * É a diferença deliberada em relação aos concorrentes. O painel do Prime
 * Coaching, do MFit e do Trainer Club responde "quanto eu faturei": vendas,
 * ticket médio, LTV, taxa de renovação. São bons produtos e a pergunta é
 * legítima — mas quem abre o app às sete da manhã antes do primeiro
 * atendimento não está decidindo sobre faturamento, está decidindo a quem
 * escrever.
 *
 * Três regras que o resto do arquivo obedece:
 *
 * 1. **Nada aparece sem consentimento.** Um aluno que não autorizou TREINO não
 *    entra na lista de sumidos, porque não há como saber se ele sumiu. Entra na
 *    lista de pendências de autorização, que é informação diferente e mais útil.
 *
 * 2. **"Nunca treinou" não é "sumiu".** Quem se vinculou ontem e ainda não
 *    treinou não é caso de cobrança; quem se vinculou há dois meses é. Por isso
 *    a conta usa o início do vínculo quando não há treino nenhum.
 *
 * 3. **Zero e ausência são coisas diferentes** — a regra que atravessa o app
 *    inteiro. `null` em `diasSemTreinar` quer dizer "nenhum registro", não
 *    "treinou hoje".
 */

/** A partir de quantos dias sem registro o aluno entra na lista de atenção. */
export const DIAS_PARA_ATENCAO = 7;

/**
 * Há quantos dias este aluno não dá sinal.
 *
 * `diasSemTreinar` nulo significa que nunca houve registro nenhum — e aí a
 * régua passa a ser o tempo de vínculo. Sem isso, um aluno novo apareceria
 * como sumido no dia seguinte ao aceite, e a lista de atenção viraria ruído
 * que o profissional aprende a ignorar.
 */
export function diasSemSinal(
  diasSemTreinar: number | null,
  diasDeVinculo: number,
): number {
  return diasSemTreinar ?? diasDeVinculo;
}

/** Passou do limiar sem registrar treino. */
export function estaSumido(diasSemTreinar: number | null, diasDeVinculo: number): boolean {
  return diasSemSinal(diasSemTreinar, diasDeVinculo) >= DIAS_PARA_ATENCAO;
}

export interface AlunoSumido {
  alunoId: string;
  nome: string;
  /** `null` = nunca registrou treino nenhum. */
  diasSemTreinar: number | null;
  /** Dias desde o vínculo virar ativo — o que dá contexto ao `null` acima. */
  diasDeVinculo: number;
}

export interface AlertaNoResumo {
  alertaId: string;
  alunoId: string;
  alunoNome: string;
  titulo: string;
  severidade: string;
  criadoEm: string;
}

/**
 * O que está travado esperando uma decisão do aluno.
 *
 * Nenhum concorrente tem esta linha, porque nenhum deles tem consentimento por
 * escopo. Sem ela, o profissional descobre que está bloqueado só ao abrir a
 * ficha e encontrar o botão desligado — e conclui que o app está quebrado.
 */
export interface AutorizacaoPendente {
  alunoId: string;
  nome: string;
  /** Escopos que ele ainda não autorizou, entre os que o meu papel precisa. */
  faltando: EscopoDado[];
}

export interface CompromissoDeHoje {
  id: string;
  alunoNome: string;
  inicioEm: string;
  tipo: string;
  status: string;
}

export interface ResumoDoProfissional {
  /** Vínculos ativos. */
  alunosAtivos: number;
  /** Convites enviados e ainda não respondidos pelo aluno. */
  convitesPendentes: number;
  /** Sem registro de treino há `DIAS_PARA_ATENCAO` dias ou mais, mais antigo primeiro. */
  sumidos: AlunoSumido[];
  /** Alertas clínicos endereçados ao meu papel e ainda não reconhecidos. */
  alertas: AlertaNoResumo[];
  /** Alunos cujo trabalho está travado por falta de autorização. */
  autorizacoesPendentes: AutorizacaoPendente[];
  agendaDeHoje: CompromissoDeHoje[];
}

/**
 * Os escopos sem os quais cada papel não consegue trabalhar.
 *
 * Não é a lista do que seria bom ter: é a do que trava. O personal sem TREINO
 * não monta plano nenhum; o nutricionista sem NUTRICAO não prescreve dieta.
 * EVOLUCAO fica de fora de propósito — dá para prescrever sem ver a evolução,
 * e transformar tudo em pendência faria o profissional parar de ler a lista.
 */
export const ESCOPOS_ESSENCIAIS: Record<string, EscopoDado[]> = {
  PERSONAL: [EscopoDado.TREINO],
  NUTRICIONISTA: [EscopoDado.NUTRICAO],
  MEDICO: [EscopoDado.CLINICO],
  ADMIN: [],
};
