/**
 * As decisões puras da auditoria de políticas, fora do script que fala com o
 * banco.
 *
 * Mesmo desenho de `diagnostico/regras.ts`, pelo mesmo motivo: o script lê o
 * Postgres e não dá para rodar sem credencial, mas a REGRA que ele aplica é
 * uma função de texto para booleano — e essa tem de ter prova, senão a
 * auditoria vira uma opinião que ninguém confere.
 *
 * O custo de não ter: em 02/10/2026 a conferência de "quem preenche esta
 * coluna" nasceu com uma expressão regular escrita dentro de um template
 * literal — onde `\.` vira `.` e `\s` vira `s`. Ela não casava com nada, e a
 * auditoria reprovou 22 colunas afirmando que nenhum gatilho as preenchia.
 * Nenhuma delas era problema de verdade. Uma auditoria que grita errado é pior
 * que uma que cala: na próxima vez ninguém lê.
 */

/**
 * A coluna NOT NULL sem default tem quem a preencha antes do INSERT?
 *
 * `evidencias` são os textos do banco sobre os gatilhos de `before insert`
 * daquela tabela: a fonte de cada função (`pg_get_functiondef`) e a declaração
 * de cada gatilho (`pg_get_triggerdef`). A segunda importa porque gatilho pode
 * receber o nome da coluna como ARGUMENTO.
 *
 * Três idiomas aparecem neste banco, e os três contam:
 *
 * 1. **Atribuição direta** — `new."atualizadoEm" := now()`. É o caso da maioria
 *    das tabelas, cada uma com o gatilho `governar_<tabela>` dela.
 * 2. **Caminho jsonb literal** — `jsonb_set(novo, '{atualizadoEm}', ...)`, usado
 *    pelos gatilhos que remontam a linha inteira em vez de campo a campo.
 * 3. **Nome da coluna como argumento** — `execute function
 *    governar_conteudo('autorId')`. O gatilho é genérico e serve quatro tabelas
 *    com nomes de dono diferentes (`autorId`, `profissionalId`, `prescritorId`);
 *    a coluna que ele governa só aparece na declaração.
 *
 * O terceiro é o mais frouxo dos três, e é de propósito: um gatilho declarado
 * com `'autorId'` está literalmente dizendo qual coluna governa. Aceitar menos
 * que isso exigiria interpretar plpgsql, e interpretar errado foi o que acabou
 * de acontecer.
 */
export function colunaTemQuemPreencha(coluna: string, evidencias: readonly string[]): boolean {
  if (evidencias.length === 0) return false;

  const atribuicaoDireta = [`new."${coluna}" :=`, `new."${coluna}":=`];
  const caminhoJsonb = `'{${coluna}}'`;
  const argumentoDoGatilho = `'${coluna}'`;

  return evidencias.some(
    (texto) =>
      atribuicaoDireta.some((forma) => texto.includes(forma)) ||
      texto.includes(caminhoJsonb) ||
      texto.includes(argumentoDoGatilho),
  );
}
