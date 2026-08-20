import type { ExecucaoResumo } from '@vivio/contracts';
// PontoDoGrafico vive em @vivio/ui, junto da matematica que o consome.
import type { PontoDoGrafico } from '@vivio/ui';

/**
 * Transformações de dado do servidor em série de gráfico.
 *
 * Fora do componente porque é lógica com casos de borda — semana sem treino,
 * fuso empurrando a data — e porque assim dá para testar sem montar tela.
 */

/** ISO local (YYYY-MM-DD) da data, sem deixar o fuso empurrar para o dia anterior. */
function diaLocal(iso: string): string {
  const d = new Date(iso);
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** Segunda-feira da semana daquela data — o rótulo da barra. */
export function inicioDaSemana(iso: string): string {
  const d = new Date(`${diaLocal(iso)}T12:00:00`);
  // getDay(): 0 = domingo. Queremos segunda como início, então domingo recua 6.
  const recuo = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - recuo);
  return diaLocal(d.toISOString());
}

export interface SemanaDeTreino {
  /** Segunda-feira da semana, em ISO. */
  semana: string;
  treinos: number;
}

/**
 * Treinos por semana, do mais antigo para o mais recente.
 *
 * **Semanas sem treino aparecem com zero.** Sem isso o gráfico mentiria: quatro
 * barras iguais dariam a impressão de constância quando houve um mês de sumiço
 * entre a segunda e a terceira. A ausência é o dado que interessa a quem
 * acompanha.
 */
export function treinosPorSemana(
  execucoes: ExecucaoResumo[],
  semanas: number,
): SemanaDeTreino[] {
  if (semanas <= 0) return [];

  const contagem = new Map<string, number>();
  for (const e of execucoes) {
    const semana = inicioDaSemana(e.iniciadoEm);
    contagem.set(semana, (contagem.get(semana) ?? 0) + 1);
  }

  const hoje = new Date();
  const semanaAtual = new Date(`${inicioDaSemana(hoje.toISOString())}T12:00:00`);

  const resultado: SemanaDeTreino[] = [];
  for (let i = semanas - 1; i >= 0; i -= 1) {
    const d = new Date(semanaAtual);
    d.setDate(d.getDate() - i * 7);
    const chave = diaLocal(d.toISOString());
    resultado.push({ semana: chave, treinos: contagem.get(chave) ?? 0 });
  }
  return resultado;
}

/** "11 ago" — o rótulo curto da semana. */
export function rotuloDaSemana(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  });
}

export interface MacroNaTela {
  rotulo: string;
  gramas: number;
  meta: number | null;
}

/**
 * Barras de macro só com o que tem meta.
 *
 * Macro sem alvo prescrito não vira barra: sem referência, o comprimento não
 * significa nada e a pessoa compara proteína com carboidrato, que é comparação
 * sem sentido. Vira número na tabela ao lado.
 */
export function macrosComparaveis(macros: MacroNaTela[]): MacroNaTela[] {
  return macros.filter((m) => m.meta !== null && m.meta > 0);
}

/** Ponto de gráfico a partir de qualquer série com data e valor. */
export function comoPontos(
  itens: Array<{ data: string; valor: number }>,
): PontoDoGrafico[] {
  return itens.map((i) => ({ data: i.data, valor: i.valor }));
}
