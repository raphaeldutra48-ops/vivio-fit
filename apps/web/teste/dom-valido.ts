/**
 * A decisão de "isto é HTML inválido?", separada de quem a coleta.
 *
 * A coleta vive no `preparo.ts`, que envolve o `console.error` e roda em toda
 * prova da web. Aqui só mora o critério — e mora separado por uma razão que
 * este projeto já aprendeu três vezes: **checagem sem prova própria é a coisa
 * mais fácil de aprovar tudo para sempre.** Um regex com um byte errado, uma
 * comparação invertida, e o portão passa a abrir para qualquer coisa enquanto o
 * relatório segue verde. "Nada encontrado" é também o que uma checagem
 * quebrada responde.
 *
 * O que é inválido aqui é só a família de validade do DOM. `console.error` de
 * outras naturezas continua passando: há provas que provocam falha de rede de
 * propósito, e reprovar todo erro de console deixaria a suíte vermelha por
 * ruído — que é o jeito mais rápido de ninguém mais olhar para ela.
 */
const PADROES = [
  // "In HTML, <p> cannot be a descendant of <p>."
  /cannot be a descendant of/i,
  // "<p> cannot contain a nested <ul>."
  /cannot contain a nested/i,
  // O nome da função do React, que aparece em versões mais antigas.
  /validateDOMNesting/i,
  // A frase que o React acrescenta, e que é literal: o navegador remonta a
  // árvore de outro jeito e o SSR acusa mismatch.
  /will cause a hydration error/i,
];

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
 * Isso apareceu na própria mutação que eu usei para conferir o portão, e é o
 * tipo de defeito que não reprova nada: o portão fechava certo e a mensagem não
 * servia para achar o culpado. Portão que não diz o quê custa a hora de quem
 * for ler.
 */
export function mensagemDoConsole(args: unknown[]): string {
  const [primeiro, ...resto] = args;
  const texto = (v: unknown): string => (typeof v === 'string' ? v : String(v));
  if (typeof primeiro !== 'string') return args.map(texto).join(' ');

  let i = 0;
  // `%o`/`%O`/`%j` o React usa para objeto; `%c` é estilo e não consome valor
  // visível, mas consumir mesmo assim mantém o alinhamento dos seguintes.
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
 * As mensagens que acusam árvore inválida, uma linha cada.
 *
 * Só a primeira linha de cada: o React anexa a árvore de componentes inteira
 * depois do aviso, e o relatório de falha fica ilegível com ela dentro.
 */
export function avisosDeDomInvalido(mensagens: string[]): string[] {
  const achados = mensagens
    .filter((m) => PADROES.some((p) => p.test(m)))
    .map((m) => m.split('\n')[0]!.trim());
  return [...new Set(achados)];
}
