/**
 * Endereços públicos do produto.
 *
 * Moram aqui, e não em cada app, porque o aplicativo precisa abrir no navegador
 * a MESMA página que o site serve. Escrito duas vezes, um dos dois envelhece —
 * e o que envelhece manda a pessoa para uma página que não existe mais.
 */
export const ENDERECO_DO_APP = 'https://app.viviofit.com.br';

/**
 * Os documentos que precisam ser legíveis por quem ainda não tem conta.
 *
 * `exclusaoDeConta` é a página que o aplicativo abre no botão "Excluir minha
 * conta" — e o endereço que a Google Play pede para app que cria conta. Pública
 * pelo mesmo motivo das outras duas: quem perdeu o acesso à conta também
 * precisa conseguir pedir.
 */
export const DOCUMENTOS_LEGAIS = {
  termos: `${ENDERECO_DO_APP}/termos`,
  privacidade: `${ENDERECO_DO_APP}/privacidade`,
  exclusaoDeConta: `${ENDERECO_DO_APP}/excluir-conta`,
} as const;

export type DocumentoLegal = keyof typeof DOCUMENTOS_LEGAIS;

/**
 * O e-mail por onde o titular exerce os direitos da LGPD — inclusive pedir a
 * exclusão da conta.
 *
 * Um lugar só para três telas: a política de privacidade, a página de exclusão
 * e o botão do aplicativo. Preencher aqui preenche as três. Enquanto for
 * `[PREENCHER]`, as páginas mostram o aviso de rascunho e NENHUMA monta link de
 * e-mail: um `mailto:` para "[PREENCHER…]" abriria o programa de e-mail com um
 * destinatário inválido, e a pessoa acharia que pediu.
 */
export const CONTATO_DE_PRIVACIDADE = '[PREENCHER: e-mail de contato do encarregado]';

/**
 * O link que abre o e-mail do pedido de exclusão, já com assunto e texto — ou
 * `null` enquanto o contato não for um endereço de verdade.
 */
export function pedidoDeExclusaoPorEmail(contato: string): string | null {
  if (!/^[^\s@[\]<>]+@[^\s@[\]<>]+\.[A-Za-z]{2,}$/.test(contato)) return null;
  const assunto = encodeURIComponent('Excluir minha conta');
  const corpo = encodeURIComponent(
    'Peço a exclusão da minha conta no Vívio Fit. Estou escrevendo do e-mail cadastrado nela.',
  );
  return `mailto:${contato}?subject=${assunto}&body=${corpo}`;
}
