/**
 * Leitura de campo numérico digitado por gente.
 *
 * A regra morava em `apps/web/lib/campos.ts`, e por isso o aplicativo não a
 * tinha: cada tela dele reescrevia o `replace(',', '.')` por conta — checkin,
 * cardio, calorimetria, medidas — menos a de EXECUÇÃO DE TREINO, a mais usada
 * de todas. Lá a conversão era `Number(texto || 0)` crua, e o teclado decimal
 * brasileiro oferece VÍRGULA: uma carga de "22,5" virava `NaN`, que o
 * `JSON.stringify` manda como `null` e o schema recusa — o treino inteiro
 * falhava ao salvar, no fim da série, com uma frase genérica.
 *
 * Campo numérico em formulário é sempre texto no estado — precisa ser, senão
 * apagar para redigitar vira zero a cada tecla — e a conversão mora aqui, uma
 * vez, para os dois aplicativos.
 */

/**
 * Texto → número, ou `null` quando não dá para ler.
 *
 * Aceita vírgula: é como se escreve decimal em português. Devolver `null` em
 * vez de `0` é o ponto — quem chama precisa distinguir "o campo está vazio" de
 * "a pessoa digitou zero". Um peso de 0 kg é erro de digitação; um peso ausente
 * é campo que ela não quis preencher, e as duas coisas se tratam diferente.
 */
export function numeroDoCampo(texto: string | undefined): number | null {
  const limpo = (texto ?? '').trim().replace(/,/g, '.');
  if (limpo === '') return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}
