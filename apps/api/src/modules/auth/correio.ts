import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

export interface Email {
  para: string;
  assunto: string;
  texto: string;
  html: string;
}

/**
 * Contrato de envio de e-mail.
 *
 * Mesmo desenho do `Enviador` de push: o serviço monta a mensagem, o driver
 * entrega. Em desenvolvimento o driver imprime no log; em produção usa SMTP.
 */
export interface Correio {
  enviar(email: Email): Promise<void>;
}

export const CORREIO = Symbol('CORREIO');

/**
 * Driver de desenvolvimento: imprime o e-mail no log em vez de entregar.
 *
 * O link de verificação sai inteiro no console — é assim que se confirma uma
 * conta em dev sem depender de credencial de SMTP.
 */
@Injectable()
export class CorreioDeLog implements Correio {
  private readonly logger = new Logger('Correio');

  async enviar(email: Email): Promise<void> {
    this.logger.log(`[simulado] para ${email.para} — ${email.assunto}\n${email.texto}`);
  }
}

/**
 * Driver de produção. Configurado por `SMTP_URL`
 * (ex.: `smtp://usuario:senha@smtp.provedor.com:587`).
 */
@Injectable()
export class CorreioSmtp implements Correio {
  private readonly logger = new Logger('Correio');
  private readonly transporte: Transporter;

  constructor(
    url: string,
    private readonly remetente: string,
  ) {
    this.transporte = createTransport(url);
  }

  async enviar(email: Email): Promise<void> {
    try {
      await this.transporte.sendMail({
        from: this.remetente,
        to: email.para,
        subject: email.assunto,
        text: email.texto,
        html: email.html,
      });
    } catch (erro) {
      // Não propaga: falha de SMTP não pode derrubar um cadastro que já foi
      // gravado. Quem não recebeu pede o reenvio.
      this.logger.error(`Falha ao enviar para ${email.para}: ${String(erro)}`);
    }
  }
}
