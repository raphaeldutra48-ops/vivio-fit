/** Utilitários de contraste (WCAG 2.1). Usados pelo teste que trava a paleta. */

function canalLinear(valor: number): number {
  const v = valor / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function luminancia(hex: string): number {
  const partes = hex.replace('#', '').match(/../g);
  if (!partes || partes.length < 3) throw new Error(`Cor inválida: ${hex}`);
  const [r, g, b] = partes.map((h) => canalLinear(parseInt(h, 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Razão de contraste entre duas cores. 1 = idênticas, 21 = preto sobre branco. */
export function razaoDeContraste(corA: string, corB: string): number {
  const a = luminancia(corA);
  const b = luminancia(corB);
  const [claro, escuro] = a > b ? [a, b] : [b, a];
  return (claro + 0.05) / (escuro + 0.05);
}

export const AA_TEXTO_NORMAL = 4.5;
export const AA_TEXTO_GRANDE = 3;
