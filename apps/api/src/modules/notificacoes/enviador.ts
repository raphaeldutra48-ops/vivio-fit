import { Injectable, Logger } from '@nestjs/common';

export interface MensagemPush {
  tokens: string[];
  titulo: string;
  corpo: string;
  deeplink?: string;
}

export interface ResultadoEnvio {
  entregues: number;
  /** Tokens que o provedor recusou de forma definitiva — devem ser desativados. */
  tokensInvalidos: string[];
}

/**
 * Contrato de envio de push.
 *
 * Duas implementações previstas: `EnviadorDeLog` (desenvolvimento) e FCM
 * (produção). Trocar é substituir o provider — nenhuma regra de agendamento
 * muda, porque agendar e entregar são responsabilidades separadas.
 */
export interface Enviador {
  enviar(mensagem: MensagemPush): Promise<ResultadoEnvio>;
}

export const ENVIADOR = Symbol('ENVIADOR');

/**
 * Driver de desenvolvimento: registra no log em vez de entregar.
 *
 * Permite testar todo o agendamento — horário, timezone, deduplicação, "só
 * lembra quem ainda não treinou" — sem depender de credencial do Firebase.
 */
@Injectable()
export class EnviadorDeLog implements Enviador {
  private readonly logger = new Logger('Push');

  async enviar(mensagem: MensagemPush): Promise<ResultadoEnvio> {
    this.logger.log(
      `[simulado] "${mensagem.titulo}" -> ${mensagem.tokens.length} dispositivo(s): ${mensagem.corpo}`,
    );
    return { entregues: mensagem.tokens.length, tokensInvalidos: [] };
  }
}
