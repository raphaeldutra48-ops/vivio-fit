import type { SalvarReceitaInput, SalvarRefeicaoInput } from '@vivio/contracts';
import { numeroDoCampo, problemaDeFaixa } from './campos';

/**
 * Leitura e validação das telas de receita e de refeição salva.
 *
 * O defeito que isto corrige é a última variação da mesma família: em vez de
 * `Number(texto) || 0` na hora de enviar, estas telas guardavam
 * `Number(e.target.value)` **direto no estado**. Apagar o campo para redigitar
 * estacionava um `0` ali — um zero que ninguém digitou, visível na tela, que a
 * pessoa precisa apagar antes de escrever o número certo. E o botão de salvar
 * ficava desabilitado sem dizer por quê.
 *
 * A saída é a mesma das outras telas: o estado guarda TEXTO, a conversão
 * acontece aqui, e campo em branco é ausência — não zero.
 */

/** Espelham `salvarReceitaSchema` e `itemRefeicaoSalvaSchema`. */
const LIMITE = {
  gramas: { min: 0.001, max: 100000 },
  porcoes: { min: 0.001, max: 100 },
  rendimento: { min: 0.001, max: 200 },
  tempo: { min: 1, max: 1440 },
} as const;

// --- receita -----------------------------------------------------------------

export interface IngredienteDigitado {
  alimentoId: string;
  nome: string;
  /** Texto cru do campo. */
  quantidadeG: string;
}

/**
 * Mensagens com o limite arredondado: dizer "entre 0.001 e 100000 g" é
 * tecnicamente correto e humanamente inútil.
 */
export function problemaDasGramas(texto: string | undefined): string | null {
  const n = numeroDoCampo(texto);
  if (n === null) return (texto ?? '').trim() === '' ? 'informe as gramas' : 'use só números';
  if (n <= 0) return 'precisa ser maior que zero';
  if (n > LIMITE.gramas.max) return `no máximo ${LIMITE.gramas.max} g`;
  return null;
}

export function problemaDasPorcoes(texto: string | undefined): string | null {
  const n = numeroDoCampo(texto);
  if (n === null) return (texto ?? '').trim() === '' ? 'informe as porções' : 'use só números';
  if (n <= 0) return 'precisa ser maior que zero';
  if (n > LIMITE.porcoes.max) return `no máximo ${LIMITE.porcoes.max} porções`;
  return null;
}

/**
 * O rendimento é DIVISOR do cálculo por porção. Zero aqui não é só recusado
 * pelo schema — quebraria a conta de macros por porção.
 */
export function problemaDoRendimento(texto: string): string | null {
  const n = numeroDoCampo(texto);
  if (n === null) return (texto ?? '').trim() === '' ? 'informe o rendimento' : 'use só números';
  if (n <= 0) return 'precisa ser maior que zero — é o divisor dos macros por porção';
  if (n > LIMITE.rendimento.max) return `no máximo ${LIMITE.rendimento.max} porções`;
  return null;
}

/** Opcional: em branco não é problema. Inteiro, porque o schema exige. */
export function problemaDoTempo(texto: string): string | null {
  if (texto.trim() === '') return null;
  return problemaDeFaixa(texto, LIMITE.tempo, 'minutos', { inteiro: true });
}

export function problemasDaReceita(
  nome: string,
  rendePorcoes: string,
  tempoMinutos: string,
  ingredientes: IngredienteDigitado[],
): string[] {
  const problemas: string[] = [];

  if (nome.trim().length < 2) problemas.push('Dê um nome à receita (ao menos 2 letras).');

  const rendimento = problemaDoRendimento(rendePorcoes);
  if (rendimento) problemas.push(`Rende quantas porções: ${rendimento}.`);

  const tempo = problemaDoTempo(tempoMinutos);
  if (tempo) problemas.push(`Tempo de preparo: ${tempo}.`);

  if (ingredientes.length === 0) problemas.push('Adicione ao menos um ingrediente.');

  for (const i of ingredientes) {
    const problema = problemaDasGramas(i.quantidadeG);
    if (problema) problemas.push(`${i.nome}: ${problema}.`);
  }

  return problemas;
}

export function podeSalvarReceita(
  nome: string,
  rendePorcoes: string,
  tempoMinutos: string,
  ingredientes: IngredienteDigitado[],
): boolean {
  return problemasDaReceita(nome, rendePorcoes, tempoMinutos, ingredientes).length === 0;
}

export function corpoDaReceita(
  nome: string,
  modoPreparo: string,
  rendePorcoes: string,
  nomeDaPorcao: string,
  tempoMinutos: string,
  ingredientes: IngredienteDigitado[],
): SalvarReceitaInput {
  return {
    nome: nome.trim(),
    modoPreparo: modoPreparo.trim() || undefined,
    rendePorcoes: numeroDoCampo(rendePorcoes) ?? 1,
    nomeDaPorcao: nomeDaPorcao.trim() || undefined,
    tempoMinutos: numeroDoCampo(tempoMinutos) ?? undefined,
    ingredientes: ingredientes.map((i) => ({
      alimentoId: i.alimentoId,
      quantidadeG: numeroDoCampo(i.quantidadeG) ?? 0,
    })),
  };
}

// --- refeição salva ----------------------------------------------------------

/**
 * Alimento vai em gramas; receita vai em porções — nunca os dois. É como a
 * pessoa pensa ("duas conchas de feijão", não "310 g de feijão pronto"), e o
 * schema recusa quem mandar os dois.
 */
export interface ItemDigitado {
  chave: string;
  nome: string;
  ehReceita: boolean;
  alimentoId?: string;
  receitaId?: string;
  /** Texto cru: gramas quando é alimento, porções quando é receita. */
  quantidade: string;
}

export function problemaDoItem(item: ItemDigitado): string | null {
  return item.ehReceita ? problemaDasPorcoes(item.quantidade) : problemaDasGramas(item.quantidade);
}

/** O schema aceita ausência, mas exige HH:MM quando vem preenchido. */
export function problemaDoHorario(texto: string): string | null {
  if (texto.trim() === '') return null;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(texto.trim()) ? null : 'use o formato HH:MM';
}

export function problemasDaRefeicao(
  nome: string,
  horario: string,
  itens: ItemDigitado[],
): string[] {
  const problemas: string[] = [];

  if (nome.trim().length < 2) problemas.push('Dê um nome à refeição (ao menos 2 letras).');

  const horarioInvalido = problemaDoHorario(horario);
  if (horarioInvalido) problemas.push(`Horário sugerido: ${horarioInvalido}.`);

  if (itens.length === 0) problemas.push('Adicione ao menos um item.');

  for (const item of itens) {
    const problema = problemaDoItem(item);
    if (problema) problemas.push(`${item.nome}: ${problema}.`);
  }

  return problemas;
}

export function podeSalvarRefeicao(
  nome: string,
  horario: string,
  itens: ItemDigitado[],
): boolean {
  return problemasDaRefeicao(nome, horario, itens).length === 0;
}

export function corpoDaRefeicao(
  nome: string,
  horario: string,
  observacao: string,
  itens: ItemDigitado[],
): SalvarRefeicaoInput {
  return {
    nome: nome.trim(),
    horarioSugerido: horario.trim() || undefined,
    observacao: observacao.trim() || undefined,
    itens: itens.map((i) => {
      const valor = numeroDoCampo(i.quantidade) ?? 0;
      // Um lado OU o outro, nunca os dois: o schema tem um refine para isso.
      return i.ehReceita
        ? { receitaId: i.receitaId, porcoes: valor }
        : { alimentoId: i.alimentoId, quantidadeG: valor };
    }),
  };
}
