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

/**
 * Limites de tamanho que as TELAS precisam conhecer.
 *
 * Os schemas sempre tiveram esses números, e as telas os repetiam no
 * `maxLength`. Enquanto os dois coincidem ninguém nota; no dia em que um muda, o
 * campo deixa a pessoa escrever 600 caracteres e o servidor recusa depois de ela
 * ter escrito — que é a pior ordem possível para descobrir um limite.
 *
 * Aqui o número tem um nome e um dono: o schema o usa, a tela o usa, e mudar
 * passa a ser uma edição em um lugar só.
 */
export const LIMITES_DE_TEXTO = {
  /** Nome, título, local de dor: uma linha. */
  curto: 120,
  /** Uma frase: motivo, ajuda de pergunta. */
  frase: 300,
  /** Observação de registro — o que cabe num parágrafo. */
  observacao: 500,
  /** Mensagem de conversa e resposta de anamnese: texto corrido. */
  longo: 4000,
} as const;

/**
 * Até quantos meses uma cobrança se repete.
 *
 * Exportado porque a TELA precisa limitar antes de enviar: o atributo `max` do
 * HTML não impede digitar 99, e o servidor recusaria depois de o formulário
 * estar preenchido.
 */
export const MAXIMO_DE_PARCELAS = 36;

/**
 * Número decimal como se escreve em português: `22,5`, `1.500,75`.
 *
 * O par de `numeroDoCampo`, e existe pelo mesmo motivo. A regra já estava
 * escrita seis vezes no projeto — duas com `toLocaleString('pt-BR')`, quatro
 * com `toFixed(n).replace('.', ',')` — e **faltava em cinco lugares**, todos de
 * exibição: a coluna ANTERIOR da execução de treino devolvia "22.5kg x 10", e as
 * prévias de massa gorda e massa magra da adipometria e da bioimpedância
 * mostravam "12.3 kg".
 *
 * O ponto não é estética. Na tela de treino o app PEDE vírgula — o teclado
 * decimal brasileiro oferece vírgula, e `numeroDoCampo` existe para lê-la — e
 * respondia com ponto, no mesmo campo, na mesma linha. E "12.3" é lido por
 * muita gente como doze mil e trezentos.
 *
 * Feito à mão, e não com `toLocaleString`: o motor do aplicativo (Hermes) pode
 * vir sem a tabela de locales completa, e nesse caso `toLocaleString('pt-BR')`
 * cai calado no formato americano — devolvendo exatamente o defeito que esta
 * função conserta, só que mais difícil de achar.
 */
export function textoDoNumero(valor: number, casas = 1): string {
  const [inteiro, decimal] = valor.toFixed(casas).split('.');
  // Ponto de milhar a cada três dígitos, da direita para a esquerda.
  const comMilhar = (inteiro ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimal ? `${comMilhar},${decimal}` : comMilhar;
}
