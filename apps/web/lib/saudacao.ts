/**
 * "Bom dia", "Boa tarde", "Boa noite".
 *
 * Função pura e num arquivo próprio porque o erro aqui é invisível em teste
 * manual: quem programa às três da tarde nunca vê a virada das 18h, e um `>`
 * onde devia ser `>=` só aparece durante um minuto por dia.
 *
 * As faixas seguem o uso brasileiro: a tarde começa ao meio-dia em ponto e a
 * noite às 18h. "Boa noite" às 17h59 soa errado no Brasil inteiro.
 */
export function saudacao(hora: number): 'Bom dia' | 'Boa tarde' | 'Boa noite' {
  if (hora < 0 || hora > 23 || !Number.isInteger(hora)) {
    // Hora inválida não vira exceção numa saudação: a tela toda cairia por
    // causa de um cumprimento. O período mais neutro é o do meio do dia.
    return 'Boa tarde';
  }
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** "sexta-feira, 21 de agosto" — a data por extenso do cabeçalho. */
export function dataPorExtenso(quando: Date): string {
  return quando.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** "há 12 dias", "ontem", "hoje" — sempre no passado. */
export function haQuantoTempo(dias: number): string {
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  return `há ${dias} dias`;
}
