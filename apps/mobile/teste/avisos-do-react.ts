/**
 * Os avisos do React que NÃO podem aparecer numa corrida da suíte.
 *
 * O critério, separado de quem o coleta — a coleta vive no `preparo.ts`, que
 * envolve o `console.error`. Mora separado por uma razão que este projeto já
 * aprendeu quatro vezes: **checagem sem prova própria é a coisa mais fácil de
 * aprovar tudo para sempre.** Um regex com um byte errado, uma comparação
 * invertida, e o portão passa a abrir para qualquer coisa enquanto o relatório
 * segue verde. "Nada encontrado" é também o que uma checagem quebrada responde.
 *
 * **Este arquivo existe em duas cópias**, uma por aplicativo, porque as duas
 * suítes têm `setupFiles` próprios e um pacote compartilhado só para sessenta
 * linhas de critério exigiria build, dependência nova e mexer na resolução que
 * o Metro usa. A cópia não é cega: `apps/web/teste/avisos-do-react.spec.ts`
 * compara as duas listas de padrões e reprova se divergirem — a prova mora lá
 * porque lá já existe o costume de varrer o código dos dois aplicativos.
 *
 * ## Por que são estas duas famílias
 *
 * **Validade do DOM.** O React avisa quando a árvore não é HTML válido — `<p>`
 * dentro de `<p>`, `<ul>` dentro de `<p>`, `<div>` dentro de `<button>` — e
 * termina com "This will cause a hydration error". É literal: o navegador fecha
 * o elemento proibido ao encontrar o filho, monta uma árvore diferente da que o
 * React renderizou, e com SSR o Next acusa mismatch. Na prática o conteúdo
 * hasteado para fora perde o estilo do pai. **Isto é defeito de produto.**
 *
 * **Atualização fora de `act`.** Não é defeito de produto: é a prova afirmando
 * enquanto o React ainda atualiza, o que a faz passar por sorte e falhar sob
 * carga. Era a origem dos "Found multiple elements" que apareciam na suíte do
 * aplicativo quando a máquina estava ocupada.
 *
 * O que ficou de fora: todo o resto. Há provas que provocam falha de rede de
 * propósito, e reprovar qualquer `console.error` deixaria a suíte vermelha por
 * ruído — que é o jeito mais rápido de ninguém mais olhar para ela.
 *
 * ## O que isto custou para ser escrito
 *
 * A suíte da web imprimia dois avisos de HTML inválido, e durante semanas
 * ninguém leu — eu inclusive, que filtrava a saída por `Tests` e `FAIL`. A do
 * aplicativo imprimia **440** avisos de `act`. Aviso que não reprova é aviso que
 * não existe: ou vira portão, ou vira ruído que esconde o aviso seguinte.
 */
export const PADROES_PROIBIDOS = [
  // "In HTML, <p> cannot be a descendant of <p>."
  'cannot be a descendant of',
  // "<p> cannot contain a nested <ul>."
  'cannot contain a nested',
  // O nome da função do React, que aparece em versões mais antigas.
  'validateDOMNesting',
  // A frase que o React acrescenta, e que é literal.
  'will cause a hydration error',
  // "An update to Inicio inside a test was not wrapped in act(...)."
  'was not wrapped in act',
] as const;

/**
 * Junta os argumentos de um `console.error` como o console faria.
 *
 * O React **não** manda a frase pronta: manda
 * `('In HTML, %s cannot be a descendant of <%s>.', '<p>', 'p', …)`. Juntar os
 * argumentos com espaço deixa os `%s` crus na frase e joga os valores para o
 * fim — e como só a primeira linha vai para o relatório, a falha saía dizendo
 * literalmente "In HTML, %s cannot be a descendant of <%s>.", sem nomear
 * elemento nenhum.
 *
 * Isso apareceu na própria mutação que eu usei para conferir o portão: ele
 * fechava certo e a mensagem não servia para achar o culpado. Portão que fecha
 * sem dizer o quê custa a hora de quem for ler.
 */
export function mensagemDoConsole(args: unknown[]): string {
  const [primeiro, ...resto] = args;
  const texto = (v: unknown): string => (typeof v === 'string' ? v : String(v));
  if (typeof primeiro !== 'string') return args.map(texto).join(' ');

  let i = 0;
  // `%o`/`%O`/`%j` o React usa para objeto; `%c` é estilo e não imprime valor,
  // mas consome o argumento — consumir mantém o alinhamento dos seguintes.
  const formatado = primeiro.replace(/%[sdifoOjc]/g, (marca) => {
    if (i >= resto.length) return marca;
    const valor = resto[i];
    i += 1;
    return marca === '%c' ? '' : texto(valor);
  });
  const sobra = resto.slice(i).map(texto);
  return [formatado, ...sobra].join(' ').trim();
}

/**
 * As mensagens proibidas, uma linha cada e sem repetir.
 *
 * Só a primeira linha de cada: o React anexa a árvore de componentes inteira
 * depois do aviso, e o relatório de falha fica ilegível com ela dentro. Sem
 * repetir porque o mesmo aviso sai uma vez por elemento — a tela de importar
 * dieta emitia o mesmo em cada item da lista.
 */
export function avisosProibidos(mensagens: string[]): string[] {
  const achados = mensagens
    .filter((m) => PADROES_PROIBIDOS.some((p) => m.toLowerCase().includes(p.toLowerCase())))
    .map((m) => m.split('\n')[0]!.trim());
  return [...new Set(achados)];
}
