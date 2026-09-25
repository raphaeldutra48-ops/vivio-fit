/**
 * Endereços públicos do produto.
 *
 * Moram aqui, e não em cada app, porque o aplicativo precisa abrir no navegador
 * a MESMA página que o site serve. Escrito duas vezes, um dos dois envelhece —
 * e o que envelhece manda a pessoa para uma página que não existe mais.
 */
export const ENDERECO_DO_APP = 'https://app.viviofit.com.br';

/** Os documentos que precisam ser legíveis por quem ainda não tem conta. */
export const DOCUMENTOS_LEGAIS = {
  termos: `${ENDERECO_DO_APP}/termos`,
  privacidade: `${ENDERECO_DO_APP}/privacidade`,
} as const;

export type DocumentoLegal = keyof typeof DOCUMENTOS_LEGAIS;
