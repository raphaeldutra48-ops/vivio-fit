/**
 * A ordem em que as tabelas podem ser restauradas.
 *
 * Exportar é fácil; **restaurar é que tem ordem**. `Consentimento` aponta para
 * `User`, `ItemTreino` aponta para `SessaoTreino` que aponta para `PlanoTreino`:
 * inserir na ordem errada morre em violação de chave estrangeira, e quem está
 * restaurando um banco não é a pessoa com paciência para descobrir a ordem no
 * meio do problema.
 *
 * Por isso a ordem é calculada a partir das chaves estrangeiras do próprio
 * banco, não de uma lista escrita à mão — lista à mão envelhece na primeira
 * tabela nova, e envelhece em silêncio.
 */

export interface Dependencia {
  /** A tabela que aponta. */
  tabela: string;
  /** A tabela apontada. */
  depende: string;
}

export interface Ordenacao {
  /** Pais antes de filhos: dá para restaurar seguindo esta ordem. */
  ordem: string[];
  /**
   * Tabelas que participam de um ciclo de dependência. Elas entram no fim, e
   * restaurá-las exige adiar a conferência das chaves (uma transação com
   * `set constraints all deferred`), porque nenhuma ordem resolve ciclo.
   */
  emCiclo: string[];
}

/**
 * Ordena pais antes de filhos (Kahn), com duas decisões que valem explicação:
 *
 * - **Auto-referência não conta.** `CondicaoSaude.resolvidaPorId` aponta para
 *   `User`, mas uma tabela que aponta para si mesma (hierarquia) não impede a
 *   própria restauração: as linhas entram e se referenciam dentro do mesmo
 *   `insert`.
 * - **Ciclo não é erro, é aviso.** Duas tabelas que se apontam existem em
 *   modelos legítimos; o que não existe é ordem que as resolva. Elas saem
 *   separadas, para quem restaura saber que ali precisa adiar a conferência.
 *
 * O empate é resolvido por nome, para a saída ser igual em duas execuções — um
 * arquivo de backup que muda de ordem sozinho é impossível de comparar.
 */
export function ordenarPorDependencia(tabelas: string[], dependencias: Dependencia[]): Ordenacao {
  const nomes = [...new Set(tabelas)].sort();
  const conhecidas = new Set(nomes);

  const pais = new Map<string, Set<string>>(nomes.map((t) => [t, new Set<string>()]));
  for (const { tabela, depende } of dependencias) {
    if (tabela === depende) continue;
    if (!conhecidas.has(tabela) || !conhecidas.has(depende)) continue;
    pais.get(tabela)!.add(depende);
  }

  const ordem: string[] = [];
  const restantes = new Set(nomes);

  while (restantes.size > 0) {
    const prontas = [...restantes].filter((t) => [...pais.get(t)!].every((p) => !restantes.has(p)));
    if (prontas.length === 0) break; // o que sobrou está em ciclo
    for (const t of prontas.sort()) {
      ordem.push(t);
      restantes.delete(t);
    }
  }

  return { ordem, emCiclo: [...restantes].sort() };
}

/**
 * É um `Decimal` do Prisma?
 *
 * O `numeric` do Postgres não chega como string pelo `$queryRaw`: chega como
 * objeto `Decimal`, cuja forma interna é `{ s, e, d }` (sinal, expoente e
 * dígitos). Serializado sem tratamento, o peso de 68,4 kg virou
 * `{"s":1,"e":1,"d":[68,4000000]}` no arquivo — dado inútil num backup, e
 * justamente o dado clínico. Apareceu ao LER a saída da primeira exportação; não
 * havia erro nenhum no caminho.
 *
 * A checagem é estrutural de propósito: importar o tipo do Prisma aqui acoplaria
 * a serialização ao cliente gerado, e o teste passaria a precisar dele.
 */
function ehDecimal(valor: unknown): boolean {
  if (typeof valor !== 'object' || valor === null) return false;
  const v = valor as Record<string, unknown>;
  return typeof v.toFixed === 'function' && 's' in v && 'e' in v && 'd' in v;
}

/**
 * Valor pronto para JSON, sem perder precisão.
 *
 * `bigint` não tem representação em JSON e `JSON.stringify` LANÇA nele — é o que
 * uma contagem ou um `id` grande devolveria. `numeric` do Postgres chega como
 * string pelo driver e assim tem de ficar: virar `number` é o mesmo erro que o
 * SDK teve com peso corporal, onde "100" < "82.50" era verdadeiro.
 *
 * `Date` vai como ISO com fuso explícito. `Buffer` vira base64 — perder o
 * conteúdo de um arquivo num backup seria o pior tipo de silêncio.
 */
export function paraJson(valor: unknown): unknown {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'bigint') return valor.toString();
  if (valor instanceof Date) return valor.toISOString();
  if (Buffer.isBuffer(valor)) return { base64: valor.toString('base64') };
  /*
    Sem `valor is ...` de propósito: como TODO objeto tem `toString`, um guarda de
    tipo aqui esvaziava o ramo seguinte — o `tsc` passou a dizer que `Array` era
    `never`. A conversão explícita mantém o estreitamento honesto.
  */
  if (ehDecimal(valor)) return (valor as { toString(): string }).toString();
  if (Array.isArray(valor)) return valor.map(paraJson);
  if (typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor as Record<string, unknown>).map(([k, v]) => [k, paraJson(v)]));
  }
  return valor;
}
