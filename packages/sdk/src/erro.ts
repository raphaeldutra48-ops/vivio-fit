import type { CodigoErro } from '@vivio/contracts';

/**
 * Erro vindo da API. O cliente decide o que fazer pelo `codigo`, nunca pelo texto.
 *
 * Exemplo de uso na tela:
 *   catch (e) {
 *     if (e instanceof ErroApi && e.codigo === 'CONSENTIMENTO_AUSENTE') {
 *       mostrarPedidoDeConsentimento(e.detalhes?.escopo);
 *     }
 *   }
 */
export class ErroApi extends Error {
  constructor(
    readonly codigo: CodigoErro | 'ERRO_INTERNO' | 'ERRO_DE_REDE',
    mensagem: string,
    readonly status: number,
    readonly detalhes?: Record<string, unknown>,
  ) {
    super(mensagem);
    this.name = 'ErroApi';
  }

  /** true quando repetir a mesma requisição pode dar certo. */
  get ehTemporario(): boolean {
    return this.status >= 500 || this.codigo === 'ERRO_DE_REDE' || this.status === 429;
  }

  /** true quando o usuário precisa autenticar de novo. */
  get exigeNovoLogin(): boolean {
    return (
      this.codigo === 'NAO_AUTENTICADO' ||
      this.codigo === 'TOKEN_INVALIDO' ||
      this.codigo === 'TOKEN_REUTILIZADO'
    );
  }
}
