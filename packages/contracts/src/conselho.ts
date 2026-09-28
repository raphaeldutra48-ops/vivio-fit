/**
 * O número de registro no conselho, montado com a sigla certa e uma só vez.
 *
 * A tela pede só o número — o rótulo já diz "Registro no CREF" e o campo mostra
 * `000000` — e o código põe a sigla na frente. O problema é que gente digita o
 * que está acostumada a escrever na carteirinha: "CREF 012345-G". Aí sai
 * **"CREF CREF 012345-G"**, e isso é pior do que parece:
 *
 * - é o campo que o admin confere contra o registro do conselho, e ele passa a
 *   ler um valor que não existe em lugar nenhum;
 * - a unicidade é por `(tipo, registro, UF)`, então "CREF 012345" e
 *   "CREF CREF 012345" convivem como se fossem dois profissionais diferentes.
 *
 * Apareceu numa auditoria de 28/09/2026, ao cadastrar uma conta de prova pela
 * própria tela.
 *
 * ## O que NÃO é limpado, de propósito
 *
 * Só a sigla do conselho ESCOLHIDO sai. Quem seleciona "Personal trainer" e
 * digita "CRN 123" está dizendo duas coisas incompatíveis, e apagar uma delas em
 * silêncio seria decidir por ele qual estava certa. O valor fica como veio, para
 * a verificação humana ver o conflito.
 */
export const SIGLA_DO_CONSELHO = {
  PERSONAL: 'CREF',
  NUTRICIONISTA: 'CRN',
  MEDICO: 'CRM',
} as const;

export type SiglaDeConselho = (typeof SIGLA_DO_CONSELHO)[keyof typeof SIGLA_DO_CONSELHO];

export function registroComConselho(sigla: SiglaDeConselho, digitado: string): string {
  const limpo = digitado
    .trim()
    // A sigla no começo, como a pessoa escreveria: "CREF 012345", "cref-012345",
    // "CREF: 012345". Só no começo, e só a do conselho escolhido.
    .replace(new RegExp(`^${sigla}\\s*[-:.]?\\s*`, 'i'), '')
    // Espaços repetidos no meio viram um só: "012345  -G" é o mesmo registro.
    .replace(/\s+/g, ' ')
    .trim();

  return limpo === '' ? '' : `${sigla} ${limpo}`;
}
