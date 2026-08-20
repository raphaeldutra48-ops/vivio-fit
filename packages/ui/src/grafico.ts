/**
 * Geometria de gráfico — a matemática, sem a marcação.
 *
 * Existe porque o app do aluno e o painel do profissional precisam do mesmo
 * gráfico e **não podem compartilhar o componente**: um desenha com
 * `react-native-svg`, o outro com `<svg>` do navegador. As tags são diferentes;
 * a conta de escala, o caminho da linha e a escolha dos rótulos são idênticos.
 *
 * O que se ganha separando: a parte que erra fica testável sem montar tela.
 * Divisão por zero em série constante, curva achatada por escala começando no
 * zero, rótulo ilegível por excesso — nada disso se vê num teste de render, e
 * tudo aqui é uma função pura com entrada e saída.
 */

export interface PontoDoGrafico {
  /** ISO curto: "2026-08-14". */
  data: string;
  valor: number;
}

export interface Coordenada {
  x: number;
  y: number;
  ponto: PontoDoGrafico;
}

export interface Margem {
  topo: number;
  base: number;
  esquerda: number;
  direita: number;
}

export const MARGEM_PADRAO: Margem = { topo: 14, base: 22, esquerda: 6, direita: 6 };

export interface Geometria {
  coords: Coordenada[];
  /** `d` do `<path>` da linha. */
  linha: string;
  /** `d` do `<path>` da área sob a linha. */
  area: string;
  minimo: number;
  maximo: number;
  /** Limites da faixa desenhada, já com a folga. */
  baixo: number;
  alto: number;
}

/**
 * A faixa vertical que o gráfico ocupa.
 *
 * **Não começa no zero de propósito.** Peso de 78 a 81 kg num eixo que começa
 * em zero vira uma reta — some justamente a variação que a pessoa quer ver. A
 * folga de 10% impede que o ponto mais alto encoste no topo.
 *
 * Série constante é o caso que quebra: `maximo - minimo` seria zero e toda
 * divisão adiante viraria `NaN`, que no SVG some sem erro. Abre-se então uma
 * faixa artificial proporcional ao valor, e a linha sai no meio.
 */
export function faixaVertical(valores: number[]): { baixo: number; alto: number } {
  if (valores.length === 0) return { baixo: 0, alto: 1 };

  const minimo = Math.min(...valores);
  const maximo = Math.max(...valores);
  const folga =
    maximo === minimo ? Math.max(1, Math.abs(maximo) * 0.05) : (maximo - minimo) * 0.1;

  return { baixo: minimo - folga, alto: maximo + folga };
}

/**
 * Converte os pontos em coordenadas de tela.
 *
 * Ponto único fica no meio horizontal — dividir por `pontos.length - 1` daria
 * divisão por zero, e encostar na borda esquerda pareceria dado cortado.
 */
export function calcularGeometria(
  pontos: PontoDoGrafico[],
  largura: number,
  altura: number,
  margem: Margem = MARGEM_PADRAO,
): Geometria | null {
  if (pontos.length === 0) return null;

  const valores = pontos.map((p) => p.valor);
  const { baixo, alto } = faixaVertical(valores);

  const larguraUtil = Math.max(0, largura - margem.esquerda - margem.direita);
  const alturaUtil = Math.max(0, altura - margem.topo - margem.base);

  const coords: Coordenada[] = pontos.map((p, i) => ({
    x:
      margem.esquerda +
      (pontos.length === 1 ? larguraUtil / 2 : (i / (pontos.length - 1)) * larguraUtil),
    y: margem.topo + alturaUtil - ((p.valor - baixo) / (alto - baixo)) * alturaUtil,
    ponto: p,
  }));

  const linha = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${arredondar(c.x)},${arredondar(c.y)}`).join(' ');
  const baseDaArea = altura - margem.base;
  const primeira = coords[0]!;
  const ultima = coords[coords.length - 1]!;
  const area = `${linha} L${arredondar(ultima.x)},${baseDaArea} L${arredondar(primeira.x)},${baseDaArea} Z`;

  return {
    coords,
    linha,
    area,
    minimo: Math.min(...valores),
    maximo: Math.max(...valores),
    baixo,
    alto,
  };
}

/** Duas casas bastam para um pixel; mais que isso só engorda o atributo `d`. */
function arredondar(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Quais pontos recebem rótulo de data.
 *
 * Doze medições com doze datas embaixo vira borrão. A regra é: primeiro,
 * último, e no máximo `maximo` no meio, distribuídos por igual. Com poucos
 * pontos, todos aparecem.
 */
export function indicesComRotulo(total: number, maximo = 4): number[] {
  if (total <= 0) return [];
  if (total <= maximo) return Array.from({ length: total }, (_, i) => i);

  const passo = (total - 1) / (maximo - 1);
  const indices = Array.from({ length: maximo }, (_, i) => Math.round(i * passo));
  return [...new Set(indices)];
}

/**
 * A variação entre o primeiro e o último ponto, em porcentagem.
 *
 * `null` quando não dá para calcular: menos de dois pontos, ou primeiro valor
 * zero — dividir por zero daria `Infinity`, e "aumentou ∞%" não informa nada.
 */
export function variacaoPercentual(pontos: PontoDoGrafico[]): number | null {
  if (pontos.length < 2) return null;
  const inicio = pontos[0]!.valor;
  const fim = pontos[pontos.length - 1]!.valor;
  if (inicio === 0) return null;
  return ((fim - inicio) / Math.abs(inicio)) * 100;
}

/**
 * Barras de comparação: quanto de cada uma preencher, de 0 a 1.
 *
 * A escala é do MAIOR valor da série, não de cada barra contra a própria meta.
 * Se cada barra fosse normalizada pela própria meta, três barras cheias
 * significariam coisas diferentes e a comparação visual mentiria — que é
 * exatamente o que um gráfico de adesão precisa não fazer.
 */
export function proporcoesDeBarra(valores: number[]): number[] {
  const maior = Math.max(...valores, 0);
  if (maior <= 0) return valores.map(() => 0);
  return valores.map((v) => Math.max(0, v) / maior);
}
