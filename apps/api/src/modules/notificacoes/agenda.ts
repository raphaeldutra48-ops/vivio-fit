/**
 * Cálculo de horário local do aluno.
 *
 * O lembrete é configurado no fuso DELE. Um aluno em Fernando de Noronha e
 * outro em Rio Branco pedem "07:30" e são horários diferentes em UTC — por isso
 * nada aqui usa o relógio do servidor diretamente.
 */

export interface MomentoLocal {
  /** "HH:MM" no fuso do aluno. */
  horario: string;
  /** 1 = segunda ... 7 = domingo. */
  diaDaSemana: number;
  /** "YYYY-MM-DD" no fuso do aluno. */
  data: string;
}

const DIA_PARA_NUMERO: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export function momentoLocal(agora: Date, timezone: string): MomentoLocal {
  const formatador = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });

  const partes = Object.fromEntries(
    formatador.formatToParts(agora).map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  // Intl devolve "24" para meia-noite em alguns runtimes.
  const hora = partes.hour === '24' ? '00' : partes.hour;

  return {
    horario: `${hora}:${partes.minute}`,
    diaDaSemana: DIA_PARA_NUMERO[partes.weekday ?? 'Mon'] ?? 1,
    data: `${partes.year}-${partes.month}-${partes.day}`,
  };
}

/**
 * Um lembrete é devido se o horário local bate e o dia da semana está na lista.
 * Lista de dias vazia significa "todos os dias".
 */
export function estaNaHora(
  momento: MomentoLocal,
  horarios: string[],
  diasDaSemana: number[],
): boolean {
  if (!horarios.includes(momento.horario)) return false;
  if (diasDaSemana.length === 0) return true;
  return diasDaSemana.includes(momento.diaDaSemana);
}
