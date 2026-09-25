/**
 * As decisões do diagnóstico, separadas da coleta.
 *
 * O `rodar.ts` fala com a rede e com o banco; aqui só se decide o que os
 * números significam. A separação existe por um motivo prático: regra que só
 * roda contra produção não tem teste, e diagnóstico sem teste é a coisa mais
 * fácil de aprovar tudo para sempre — basta uma comparação invertida.
 */

export interface Checagem {
  nome: string;
  ok: boolean;
  detalhe: string;
  /** Informativo aparece no relatório e NÃO reprova. */
  informativo?: boolean;
}

/** Os cabeçalhos de segurança que o site tem de mandar. */
export const CABECALHOS_ESPERADOS = [
  'strict-transport-security',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
  'content-security-policy',
] as const;

export function avaliarCabecalhos(recebidos: Record<string, string>): Checagem {
  const presentes = Object.keys(recebidos).map((h) => h.toLowerCase());
  const faltando = CABECALHOS_ESPERADOS.filter((h) => !presentes.includes(h));
  return {
    nome: 'cabeçalhos de segurança do site',
    ok: faltando.length === 0,
    detalhe:
      faltando.length === 0
        ? `os ${CABECALHOS_ESPERADOS.length} presentes`
        : `faltando: ${faltando.join(', ')}`,
  };
}

/**
 * A função de borda publicada responde **401** sem sessão — não 404.
 *
 * A diferença é o diagnóstico inteiro: 404 significa que ela não existe no
 * projeto (foi o estado real por duas semanas, com a tela dizendo que a leitura
 * automática não estava configurada), e 401 significa que existe e exige login.
 */
export function avaliarFuncaoDeBorda(nome: string, status: number): Checagem {
  return {
    nome: `função de borda ${nome}`,
    ok: status === 401,
    detalhe:
      status === 404
        ? 'não publicada (404) — publique com `supabase functions deploy`'
        : status === 401
          ? 'publicada e exigindo sessão (401)'
          : `resposta inesperada: ${status}`,
  };
}

/**
 * A rotina do banco rodou há pouco, e rodou bem.
 *
 * Cron que existe e está `active` não prova nada: o que prova é execução recente
 * com `succeeded`. Três minutos de folga para uma rotina de um minuto absorve
 * atraso de agendador sem deixar passar uma rotina morta.
 */
export function avaliarRotina(
  nome: string,
  ultima: { status: string; quando: Date } | null,
  agora: Date,
  folgaMinutos = 3,
): Checagem {
  if (!ultima) {
    return { nome: `rotina ${nome}`, ok: false, detalhe: 'nunca executou' };
  }
  const minutos = (agora.getTime() - ultima.quando.getTime()) / 60_000;
  if (ultima.status !== 'succeeded') {
    return { nome: `rotina ${nome}`, ok: false, detalhe: `última execução: ${ultima.status}` };
  }
  return {
    nome: `rotina ${nome}`,
    ok: minutos <= folgaMinutos,
    detalhe:
      minutos <= folgaMinutos
        ? `última execução há ${minutos.toFixed(1)} min, com sucesso`
        : `parada: última execução há ${minutos.toFixed(0)} min`,
  };
}

/**
 * Chave de mídia no banco sem arquivo no armazenamento é figura quebrada na
 * tela do aluno, e não aparece em lugar nenhum até alguém abrir a evolução.
 *
 * O contrário — arquivo sem dono no banco — é informativo: é sobra de upload
 * interrompido, ocupa espaço e não quebra nada. Apagar por conta própria é o
 * risco que não vale (pendência 23).
 */
export function avaliarMidia(
  chavesNoBanco: string[],
  arquivosNoArmazenamento: string[],
): Checagem[] {
  const arquivos = new Set(arquivosNoArmazenamento);
  const chaves = new Set(chavesNoBanco);
  const semArquivo = chavesNoBanco.filter((c) => !arquivos.has(c));
  const semDono = arquivosNoArmazenamento.filter(
    (a) => !chaves.has(a) && !a.startsWith('catalogo/'),
  );
  return [
    {
      nome: 'chaves de mídia com arquivo',
      ok: semArquivo.length === 0,
      detalhe:
        semArquivo.length === 0
          ? `${chavesNoBanco.length} chaves, todas com arquivo`
          : `${semArquivo.length} apontam para arquivo ausente: ${semArquivo.slice(0, 3).join(', ')}`,
    },
    {
      nome: 'arquivos sem dono no banco',
      ok: semDono.length === 0,
      informativo: true,
      detalhe: semDono.length === 0 ? 'nenhum' : `${semDono.length}: ${semDono.slice(0, 3).join(', ')}`,
    },
  ];
}

/** Contas de gente de verdade no banco mudam o que é seguro fazer com ele. */
export function avaliarContas(emails: string[]): Checagem[] {
  const deMentira = [/@viviofit\.com\.br$/i, /@exemplo\.com$/i, /@teste\.com$/i, /^prova-/i];
  const reais = emails.filter((e) => !deMentira.some((p) => p.test(e)));
  const sobras = emails.filter((e) => /@teste\.com$/i.test(e) || /^prova-/i.test(e));
  return [
    {
      nome: 'sobras de execução de teste',
      ok: sobras.length === 0,
      detalhe: sobras.length === 0 ? 'nenhuma' : `${sobras.length}: ${sobras.slice(0, 3).join(', ')}`,
    },
    {
      /*
        Não é falha: é o aviso de que a suíte não pode mais rodar contra este
        banco, porque ela cria e APAGA contas (pendência 12). O guarda de
        produção recusa sozinho, mas quem lê o diagnóstico precisa saber antes.
      */
      nome: 'contas de pessoas reais',
      ok: true,
      informativo: true,
      detalhe:
        reais.length === 0
          ? 'nenhuma — a suíte ainda pode rodar contra este banco'
          : `${reais.length}: a suíte NÃO pode mais rodar aqui; aponte DATABASE_URL_TEST para outro projeto`,
    },
  ];
}

/** O relatório inteiro: o que reprova é o que não é informativo. */
export function resumir(checagens: Checagem[]): {
  reprovadas: Checagem[];
  avisos: Checagem[];
  codigoDeSaida: 0 | 1;
} {
  const reprovadas = checagens.filter((c) => !c.ok && c.informativo !== true);
  const avisos = checagens.filter((c) => !c.ok && c.informativo === true);
  return { reprovadas, avisos, codigoDeSaida: reprovadas.length === 0 ? 0 : 1 };
}
