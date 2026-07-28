import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { CodigoErro } from '@vivio/contracts';

/**
 * Padroniza toda resposta de erro no envelope { erro: { codigo, mensagem, detalhes } }.
 *
 * Erro inesperado (500) nunca vaza a mensagem original: pode conter fragmento de
 * query, e-mail ou dado clínico. Ele vai para o log, não para o cliente.
 */
@Catch()
export class ErroFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErroFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const resposta = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const corpo = exception.getResponse();

      if (typeof corpo === 'object' && corpo !== null && 'codigo' in corpo) {
        const { codigo, mensagem, detalhes } = corpo as {
          codigo: CodigoErro;
          mensagem: string;
          detalhes?: Record<string, unknown>;
        };
        resposta.status(status).json({ erro: { codigo, mensagem, detalhes } });
        return;
      }

      // HttpException lançada pelo próprio Nest (404 de rota, payload inválido...)
      const mensagem =
        typeof corpo === 'string'
          ? corpo
          : ((corpo as { message?: string | string[] }).message ?? exception.message);
      resposta.status(status).json({
        erro: {
          codigo: status === 404 ? CodigoErro.RECURSO_NAO_ENCONTRADO : CodigoErro.DADOS_INVALIDOS,
          mensagem: Array.isArray(mensagem) ? mensagem.join('; ') : mensagem,
        },
      });
      return;
    }

    this.logger.error('Erro não tratado', exception instanceof Error ? exception.stack : exception);
    resposta.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      erro: {
        codigo: 'ERRO_INTERNO',
        mensagem: 'Ocorreu um erro inesperado. Tente novamente.',
      },
    });
  }
}
