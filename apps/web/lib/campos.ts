/**
 * Leitura de campo numérico de formulário.
 *
 * Existe porque a mesma regra já foi escrita três vezes — plano alimentar,
 * adipometria e bioimpedância — e é a regra que erra em silêncio: `Number('')`
 * é `0`, e `Number('abc')` é `NaN`, que o `JSON.stringify` manda como `null`.
 * Nos três casos o servidor recusava com 400 e a tela traduzia como uma frase
 * genérica, depois de o formulário inteiro estar preenchido.
 *
 * Campo numérico em formulário é sempre texto no estado — precisa ser, senão
 * apagar para redigitar vira zero a cada tecla — e a conversão mora em
 * `@vivio/contracts`, de onde os dois aplicativos a leem.
 */

/*
  A conversão em si mudou de casa: virou `numeroDoCampo` em `@vivio/contracts`,
  porque o APLICATIVO precisava da mesma regra e não podia importar de `apps/web`
  — e foi justamente por isso que a tela de execução de treino ficou sem ela,
  convertendo "22,5" em NaN. Reexportada aqui para os chamadores da web não
  mudarem de import.
*/
import { numeroDoCampo } from '@vivio/contracts';

export { numeroDoCampo };

export interface Faixa {
  min: number;
  max: number;
}

/** Mensagem para um campo obrigatório dentro de uma faixa, ou `null`. */
export function problemaDeFaixa(
  texto: string | undefined,
  faixa: Faixa,
  unidade: string,
  opcoes: { inteiro?: boolean } = {},
): string | null {
  const n = numeroDoCampo(texto);
  // Duas mensagens diferentes de propósito: "preencha" para o campo vazio, e
  // "use só números" para quem digitou algo que não dá para ler. Dizer
  // "preencha este campo" a quem acabou de escrever nele é confuso, e é o que
  // acontecia com campo opcional que recebia texto.
  if (n === null) return (texto ?? '').trim() === '' ? 'preencha este campo' : 'use só números';
  if (opcoes.inteiro && !Number.isInteger(n)) return 'use um número inteiro';
  if (n < faixa.min || n > faixa.max) return `entre ${faixa.min} e ${faixa.max} ${unidade}`;
  return null;
}

/** Igual, mas em branco não é problema — para campo opcional. */
export function problemaDeFaixaOpcional(
  texto: string | undefined,
  faixa: Faixa,
  unidade: string,
  opcoes: { inteiro?: boolean } = {},
): string | null {
  if ((texto ?? '').trim() === '') return null;
  return problemaDeFaixa(texto, faixa, unidade, opcoes);
}

/**
 * O que pintar de vermelho no campo.
 *
 * Campo em branco ainda não é erro de ninguém — o formulário abre vazio, e
 * recebê-lo já todo vermelho é ranzinza sem informar nada. Quem cobra o que
 * falta é a lista acima do botão; o campo só reclama depois que alguém digitou
 * algo que não serve.
 */
export function erroVisivel(
  texto: string | undefined,
  problema: string | null,
): string | undefined {
  if ((texto ?? '').trim() === '') return undefined;
  return problema ?? undefined;
}

export const arredondar = (v: number, casas = 2): number => {
  const fator = 10 ** casas;
  return Math.round(v * fator) / fator;
};
