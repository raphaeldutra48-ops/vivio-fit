/**
 * Contrato de armazenamento de mídia.
 *
 * Duas implementações: disco local (desenvolvimento) e S3 (produção). A regra
 * que vale para as duas: **arquivo nunca é público**. A entrega é sempre por
 * link assinado de curta duração, porque foto de evolução e vídeo de treino são
 * dados do aluno, não conteúdo aberto.
 */
export interface Armazenamento {
  /** Autoriza o cliente a enviar o arquivo direto, sem passar pela API. */
  autorizarUpload(
    chave: string,
    mimeType: string,
    validadeSeg: number,
  ): Promise<{ url: string; cabecalhos: Record<string, string>; expiraEm: Date }>;

  /** Link temporário de leitura. */
  urlDeLeitura(chave: string, validadeSeg: number): Promise<{ url: string; expiraEm: Date }>;

  remover(chave: string): Promise<void>;
}

export const ARMAZENAMENTO = Symbol('ARMAZENAMENTO');
