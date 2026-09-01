import type { TipoSerie } from './execucoes';

/**
 * O treino em andamento, guardado no aparelho.
 *
 * Por que existe: até aqui, as séries que o aluno digitava viviam **só** na
 * memória da tela. O Android encerra aplicativo em segundo plano com
 * frequência — basta responder uma mensagem entre uma série e outra — e o
 * treino inteiro sumia. Quarenta minutos de trabalho perdidos, sem aviso, na
 * tela mais importante do app.
 *
 * O formato mora em `contracts` e não no aplicativo porque é **formato
 * persistido**: um rascunho gravado pela versão de hoje precisa continuar
 * legível pela versão de amanhã. Mudar um campo aqui é mudar dado que já está
 * no aparelho de alguém.
 */

/**
 * Uma série como ela está na tela, e não como vai para o servidor.
 *
 * `repsFeitas` e `cargaKg` são texto de propósito: é o conteúdo do campo, que
 * passa por estados que número nenhum representa — vazio, "1" a caminho de
 * "12", "7," antes do decimal. Converter na hora de gravar apagaria justamente
 * o que o aluno estava digitando quando o app morreu.
 */
export interface SerieEmAndamento {
  chave: string;
  itemTreinoId: string;
  exercicioId: string;
  serieNum: number;
  tipo: TipoSerie;
  repsFeitas: string;
  cargaKg: string;
  concluida: boolean;
}

export interface RascunhoDeTreino {
  sessaoId: string;
  /**
   * O mesmo identificador que iria para a fila de envio.
   *
   * Restaurado junto: é ele que impede o servidor de gravar duas execuções se
   * o treino for enviado, o app morrer antes da confirmação, e a pessoa
   * concluir de novo.
   */
  clienteUuid: string;
  /** Início do treino, em ISO. Sem ele o cronômetro reiniciaria do zero. */
  iniciadoEm: string;
  salvoEm: string;
  series: SerieEmAndamento[];
}

/**
 * Por quantas horas um treino interrompido continua sendo o mesmo treino.
 *
 * Seis horas cobre com folga qualquer sessão real, inclusive a interrompida
 * por um almoço. Passado isso, retomar seria pior que descartar: as séries
 * apareceriam marcadas como feitas hoje, e o horário de início — que vira
 * duração no relatório do personal — estaria errado por horas.
 */
export const HORAS_DE_VALIDADE_DO_RASCUNHO = 6;

const MS_POR_HORA = 3_600_000;

/**
 * Vale retomar este rascunho?
 *
 * Duas condições, e as duas importam. A sessão tem de ser a mesma — retomar
 * séries de peito na tela de perna encheria o treino de exercício que a pessoa
 * não fez. E o rascunho tem de ser recente.
 *
 * Data ilegível conta como vencido: um `salvoEm` corrompido daria `NaN` em
 * qualquer comparação, e `NaN` faz toda condição virar falso — inclusive a que
 * deveria barrar. Melhor descartar de propósito do que por acidente.
 */
export function rascunhoAindaVale(
  rascunho: Pick<RascunhoDeTreino, 'sessaoId' | 'salvoEm'>,
  sessaoId: string,
  agora: Date,
): boolean {
  if (rascunho.sessaoId !== sessaoId) return false;

  const salvo = new Date(rascunho.salvoEm).getTime();
  if (!Number.isFinite(salvo)) return false;

  const horas = (agora.getTime() - salvo) / MS_POR_HORA;
  // Rascunho "do futuro" (relógio do aparelho atrasado e depois corrigido)
  // não é motivo para descartar o trabalho da pessoa.
  if (horas < 0) return true;
  return horas <= HORAS_DE_VALIDADE_DO_RASCUNHO;
}

/**
 * Há trabalho de verdade neste rascunho?
 *
 * A tela nasce com uma série por linha do plano, já preenchida com a carga
 * sugerida pelo personal. Um rascunho nesse estado é idêntico ao que a própria
 * tela montaria sozinha, e anunciar "retomando o treino" ali confundiria quem
 * acabou de abrir.
 *
 * Carga não conta como sinal — ela vem preenchida. Repetição digitada e série
 * marcada contam: as duas só existem se alguém as pôs ali.
 */
export function temAlgoAPreservar(series: SerieEmAndamento[]): boolean {
  return series.some((s) => s.concluida || s.repsFeitas.trim() !== '');
}
