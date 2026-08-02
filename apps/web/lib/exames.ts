import {
  Classificacao,
  ROTULO_SISTEMA,
  SistemaCorporal,
  referenciaDe,
  type Faixa,
  type Fonte,
  type Marcador,
  type MarcadorNoExame,
} from '@vivio/contracts';
import { numeroDoCampo } from './campos';

/**
 * Leitura e apresentação do exame.
 *
 * Mesmo formato das outras telas de formulário: a conversão de texto para
 * número e a validação ficam fora do componente. Aqui a distinção que importa
 * é outra — um marcador em branco não é erro, é marcador que o laboratório não
 * mediu. Só valor DIGITADO e ilegível é problema.
 */

export const COR_DA_CLASSIFICACAO: Record<Classificacao, string> = {
  OTIMO: 'var(--vv-sucesso)',
  ATENCAO: 'var(--vv-alerta)',
  CRITICO: 'var(--vv-erro)',
};

/** Ordem de exibição dos grupos. Segue a leitura clínica, não o alfabeto. */
const ORDEM_DOS_SISTEMAS: SistemaCorporal[] = [
  SistemaCorporal.GLICEMICO,
  SistemaCorporal.LIPIDEOS,
  SistemaCorporal.RENAL,
  SistemaCorporal.TIREOIDE,
  SistemaCorporal.VITAMINAS,
  SistemaCorporal.INFLAMACAO,
  SistemaCorporal.HORMONIOS_SEXUAIS,
];

export interface GrupoDeMarcadores {
  sistema: SistemaCorporal;
  rotulo: string;
  marcadores: MarcadorNoExame[];
}

export function agruparPorSistema(resultados: MarcadorNoExame[]): GrupoDeMarcadores[] {
  return ORDEM_DOS_SISTEMAS.map((sistema) => ({
    sistema,
    rotulo: ROTULO_SISTEMA[sistema],
    marcadores: resultados.filter((r) => r.sistema === sistema),
  })).filter((g) => g.marcadores.length > 0);
}

/** "70 a 99", "até 190", "a partir de 30" — como se lê num laudo. */
export function faixaEmTexto(faixa: Faixa, unidade: string): string {
  const u = unidade ? ` ${unidade}` : '';
  if (faixa.min !== undefined && faixa.max !== undefined) {
    return `${faixa.min} a ${faixa.max}${u}`;
  }
  if (faixa.max !== undefined) return `até ${faixa.max}${u}`;
  if (faixa.min !== undefined) return `a partir de ${faixa.min}${u}`;
  return '—';
}

export function fonteEmTexto(fonte: Fonte): string {
  const partes = [fonte.organizacao, fonte.documento];
  if (fonte.ano) partes.push(String(fonte.ano));
  if (fonte.pmid) partes.push(`PMID ${fonte.pmid}`);
  return partes.join(' · ');
}

// --- Digitação de um exame novo ---------------------------------------------

/** Valores como estão nos campos: texto, e a maioria vazia. */
export type ValoresDigitados = Partial<Record<Marcador, string>>;

/**
 * Mensagem para o campo, ou `null`.
 *
 * Campo em branco NÃO é problema aqui: um exame quase nunca traz os 20
 * marcadores, e cobrar os que faltam transformaria a tela numa lista de
 * reclamações. Só o que foi digitado e não dá para ler é erro.
 */
export function problemaDoMarcador(texto: string | undefined): string | null {
  if ((texto ?? '').trim() === '') return null;
  return numeroDoCampo(texto) === null ? 'use só números' : null;
}

export function problemasDoExame(
  laboratorio: string,
  dataColeta: string,
  valores: ValoresDigitados,
): string[] {
  const problemas: string[] = [];

  if (laboratorio.trim().length < 2) problemas.push('Informe o laboratório.');
  if (dataColeta.trim() === '') problemas.push('Informe a data da coleta.');

  for (const [marcador, texto] of Object.entries(valores) as [Marcador, string][]) {
    const problema = problemaDoMarcador(texto);
    if (problema) problemas.push(`${referenciaDe(marcador).rotulo}: ${problema}.`);
  }

  if (marcadoresPreenchidos(valores).length === 0) {
    problemas.push('Digite ao menos um marcador.');
  }

  return problemas;
}

export function podeSalvarExame(
  laboratorio: string,
  dataColeta: string,
  valores: ValoresDigitados,
): boolean {
  return problemasDoExame(laboratorio, dataColeta, valores).length === 0;
}

/** Só os que têm valor legível — os vazios simplesmente não vão. */
export function marcadoresPreenchidos(
  valores: ValoresDigitados,
): { marcador: Marcador; valor: number }[] {
  return (Object.entries(valores) as [Marcador, string][])
    .map(([marcador, texto]) => ({ marcador, valor: numeroDoCampo(texto) }))
    .filter((r): r is { marcador: Marcador; valor: number } => r.valor !== null);
}
