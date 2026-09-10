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

  /**
   * Os bytes do arquivo, para o servidor processar.
   *
   * Existe por causa da leitura de dieta: o documento precisa chegar ao modelo,
   * e mandá-lo buscar o link assinado seria dar a volta pela rede para pegar um
   * arquivo que já está do nosso lado. Continua sem abrir nada para fora — este
   * caminho é servidor a servidor, e o cliente segue recebendo só link assinado.
   */
  ler(chave: string): Promise<Buffer>;

  remover(chave: string): Promise<void>;

  /**
   * Grava bytes que o SERVIDOR já tem nas mãos.
   *
   * Não é caminho de upload de usuário — esse continua sendo `autorizarUpload`,
   * direto do aparelho para o armazenamento. É para o que nasce do nosso lado:
   * a mídia do catálogo, baixada de acervo aberto.
   *
   * Existe porque o importador do wger gravava com `writeFile` direto na pasta
   * de mídia, por fora desta interface. Com a mídia no volume do Railway dava
   * na mesma; com o R2 ligado, o arquivo ficaria no disco e a API o procuraria
   * no bucket — a importação "funcionaria" e a imagem nunca apareceria.
   */
  gravar(chave: string, conteudo: Buffer, mimeType: string): Promise<void>;

  /**
   * O arquivo está lá?
   *
   * A coluna preenchida no banco não responde a isso: ela diz que o arquivo foi
   * gravado um dia, não que ainda existe. É a diferença entre um importador que
   * pula o que "já tem" e um que conserta o que perdeu.
   */
  existe(chave: string): Promise<boolean>;
}

export const ARMAZENAMENTO = Symbol('ARMAZENAMENTO');
