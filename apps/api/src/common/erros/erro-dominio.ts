import { HttpException } from '@nestjs/common';
import { CodigoErro } from '@vivio/contracts';

/**
 * Erro de domínio. Carrega um código estável que o cliente usa para decidir
 * o que fazer — a mensagem é só para humano e pode mudar sem quebrar ninguém.
 */
export class ErroDominio extends HttpException {
  constructor(
    readonly codigo: CodigoErro,
    mensagem: string,
    status: number,
    readonly detalhes?: Record<string, unknown>,
  ) {
    super({ codigo, mensagem, detalhes }, status);
  }

  static naoAutenticado(mensagem = 'Autenticação necessária.'): ErroDominio {
    return new ErroDominio(CodigoErro.NAO_AUTENTICADO, mensagem, 401);
  }

  static tokenInvalido(mensagem = 'Token inválido ou expirado.'): ErroDominio {
    return new ErroDominio(CodigoErro.TOKEN_INVALIDO, mensagem, 401);
  }

  static tokenReutilizado(): ErroDominio {
    return new ErroDominio(
      CodigoErro.TOKEN_REUTILIZADO,
      'Sessão encerrada por segurança: este token já havia sido usado. Faça login novamente.',
      401,
    );
  }

  static credenciaisInvalidas(): ErroDominio {
    return new ErroDominio(CodigoErro.CREDENCIAIS_INVALIDAS, 'E-mail ou senha incorretos.', 401);
  }

  /**
   * 403 e não 401: a credencial está certa, o que falta é a confirmação. O
   * cliente precisa distinguir para oferecer "reenviar e-mail" em vez de
   * pedir a senha de novo.
   */
  static emailNaoVerificado(email: string): ErroDominio {
    return new ErroDominio(
      CodigoErro.EMAIL_NAO_VERIFICADO,
      'Confirme seu e-mail para entrar. Enviamos um link no cadastro.',
      403,
      { email },
    );
  }

  static emailJaCadastrado(): ErroDominio {
    return new ErroDominio(CodigoErro.EMAIL_JA_CADASTRADO, 'Este e-mail já está em uso.', 409);
  }

  static papelNaoAutorizado(mensagem = 'Seu perfil não tem permissão para esta ação.'): ErroDominio {
    return new ErroDominio(CodigoErro.PAPEL_NAO_AUTORIZADO, mensagem, 403);
  }

  static vinculoAusente(): ErroDominio {
    return new ErroDominio(
      CodigoErro.VINCULO_AUSENTE,
      'Você não possui vínculo ativo com este aluno.',
      403,
    );
  }

  static consentimentoAusente(escopo: string): ErroDominio {
    return new ErroDominio(
      CodigoErro.CONSENTIMENTO_AUSENTE,
      'O aluno não autorizou o compartilhamento deste tipo de dado.',
      403,
      { escopo },
    );
  }

  static naoEncontrado(recurso = 'Recurso'): ErroDominio {
    return new ErroDominio(CodigoErro.RECURSO_NAO_ENCONTRADO, `${recurso} não encontrado.`, 404);
  }

  static conflito(mensagem: string, detalhes?: Record<string, unknown>): ErroDominio {
    return new ErroDominio(CodigoErro.CONFLITO, mensagem, 409, detalhes);
  }

  /**
   * A mensagem diz o tempo porque a alternativa é a pessoa tentar de novo na
   * hora, falhar igual e achar que a conta foi bloqueada de vez.
   */
  static limiteExcedido(segundos: number): ErroDominio {
    const minutos = Math.ceil(segundos / 60);
    return new ErroDominio(
      CodigoErro.LIMITE_EXCEDIDO,
      `Muitas tentativas. Aguarde ${minutos === 1 ? 'um minuto' : `${minutos} minutos`} e tente de novo.`,
      429,
      { segundos },
    );
  }
}
