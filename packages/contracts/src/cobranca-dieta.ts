/**
 * A cobrança diária da dieta.
 *
 * O aluno já marca cada refeição como feita ou pulada, e esse registro é o que
 * o nutricionista lê para saber se o plano está sendo seguido. O problema é
 * que ninguém lembra sozinho: sem alguém puxando, o registro acontece na
 * primeira semana e some.
 *
 * Aqui mora a régua do que se cobra. **Não se cobra refeição cuja hora não
 * chegou** — perguntar às 9h sobre o jantar ensina a ignorar o aviso, e um
 * aviso ignorado não cobra mais nada depois.
 */

/** Minutos de tolerância depois do horário antes de considerar atrasada. */
export const TOLERANCIA_APOS_REFEICAO_MIN = 90;

export type UrgenciaDaCobranca = 'NADA' | 'LEMBRETE' | 'ATRASADO';

export interface RefeicaoParaCobranca {
  id: string;
  nome: string;
  /** `HH:MM`. Sem horário, a refeição não entra na cobrança por hora. */
  horarioSugerido: string | null;
}

export interface CobrancaDaDieta {
  urgencia: UrgenciaDaCobranca;
  /** Refeições cujo horário já passou e continuam sem resposta. */
  pendentes: RefeicaoParaCobranca[];
  /** Quantas do dia inteiro já foram respondidas. */
  respondidas: number;
  total: number;
  /** Frase pronta, na voz de quem cobra sem ralhar. */
  mensagem: string;
}

/** `HH:MM` → minutos desde a meia-noite. `null` quando o formato não serve. */
function emMinutos(horario: string | null): number | null {
  if (!horario) return null;
  const [h, m] = horario.split(':').map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * O que cobrar agora, dado o plano do dia e o que já foi respondido.
 *
 * Puro de propósito: é a única regra do app que decide incomodar alguém, e
 * regra que incomoda precisa ser testável sem abrir tela nenhuma.
 *
 * A tolerância existe porque almoçar 12:30 e registrar 12:31 não é como as
 * pessoas vivem. Cobrar no minuto do horário transformaria o lembrete em
 * alarme, e alarme se desliga.
 */
export function cobrancaDaDieta(
  refeicoes: RefeicaoParaCobranca[],
  respondidasIds: string[],
  agora: Date = new Date(),
): CobrancaDaDieta {
  const respondidas = new Set(respondidasIds);
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

  const pendentes = refeicoes.filter((r) => {
    if (respondidas.has(r.id)) return false;
    const horario = emMinutos(r.horarioSugerido);
    /*
      Refeição sem horário definido não é cobrada pelo relógio — só entra no
      resumo do fim do dia. Chutar um horário para ela faria o app cobrar por
      uma hora que o nutricionista nunca prescreveu.
    */
    if (horario === null) return false;
    return minutosAgora >= horario + TOLERANCIA_APOS_REFEICAO_MIN;
  });

  const jaRespondidas = refeicoes.filter((r) => respondidas.has(r.id)).length;

  if (refeicoes.length === 0) {
    return {
      urgencia: 'NADA',
      pendentes: [],
      respondidas: 0,
      total: 0,
      mensagem: '',
    };
  }

  if (jaRespondidas === refeicoes.length) {
    return {
      urgencia: 'NADA',
      pendentes: [],
      respondidas: jaRespondidas,
      total: refeicoes.length,
      mensagem: 'Dieta de hoje toda registrada. É isso que faz o ajuste do próximo plano valer.',
    };
  }

  if (pendentes.length === 0) {
    return {
      urgencia: 'LEMBRETE',
      pendentes: [],
      respondidas: jaRespondidas,
      total: refeicoes.length,
      mensagem: `${jaRespondidas} de ${refeicoes.length} refeições registradas hoje.`,
    };
  }

  /*
    Duas ou mais atrasadas é o sinal de que o dia inteiro vai passar em branco
    — e é aí que vale insistir mais forte, porque amanhã ninguém lembra o que
    comeu hoje.
  */
  const urgencia: UrgenciaDaCobranca = pendentes.length >= 2 ? 'ATRASADO' : 'LEMBRETE';

  const nomes = pendentes.map((p) => p.nome.toLowerCase());
  const lista =
    nomes.length === 1
      ? nomes[0]
      : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;

  return {
    urgencia,
    pendentes,
    respondidas: jaRespondidas,
    total: refeicoes.length,
    // Sem julgamento: "pulei" é uma resposta tão útil quanto "fiz", e quem se
    // sente cobrado por ter pulado passa a não responder nada.
    mensagem:
      pendentes.length === 1
        ? `Faltou dizer como foi o ${lista}. Pulou? Também vale registrar.`
        : `Faltou registrar ${lista}. Mesmo o que você pulou ajuda o nutricionista a ajustar.`,
  };
}
