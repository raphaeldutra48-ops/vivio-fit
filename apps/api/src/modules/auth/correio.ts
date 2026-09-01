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
 * Dez segundos. O envio acontece **dentro** da requisição de cadastro: sem
 * limite, um provedor pendurado deixaria a pessoa olhando para um botão girando
 * até o navegador desistir. Estourar o tempo vira erro registrado no log, e o
 * cadastro — que já está gravado — segue de pé.
 */
const TEMPO_LIMITE_MS = 10_000;

/** Censura a chave em qualquer texto que vá para o log. */
function semAChave(texto: string, chave: string): string {
  return chave ? texto.split(chave).join('***') : texto;
}

/**
 * Entrega pela API HTTP do Resend.
 *
 * Separada da classe porque a ferramenta de teste
 * (`ferramentas/enviar-email-teste.ts`) precisa do mesmo caminho: testar por
 * uma via diferente da que produção usa não prova nada.
 *
 * Devolve o erro em vez de lançar — quem chama decide o que fazer com ele, e
 * as duas decisões são diferentes (produção registra e segue; a ferramenta de
 * teste mostra e sai com código 1).
 */
export async function enviarPelaApiDoResend(
  chave: string,
  remetente: string,
  email: Email,
): Promise<{ id: string | null; erro: string | null }> {
  let resposta: Response;
  try {
    resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${chave}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: remetente,
        to: [email.para],
        subject: email.assunto,
        text: email.texto,
        html: email.html,
      }),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
  } catch (erro) {
    // O texto vem de fora e vai para o log do contêiner, que várias pessoas
    // leem. Se por qualquer motivo ele ecoar a chave — cabeçalho repetido numa
    // exceção de rede, por exemplo — ela sai censurada daqui.
    return {
      id: null,
      erro: `não foi possível falar com a api.resend.com: ${semAChave(String(erro), chave)}`,
    };
  }

  const corpo = (await resposta.json().catch(() => null)) as {
    id?: string;
    name?: string;
    message?: string;
  } | null;

  if (!resposta.ok) {
    // A mensagem do Resend é específica ("domain is not verified", "API key is
    // invalid") e é o que separa um problema do outro. O status sozinho não.
    const detalhe = corpo?.message ?? corpo?.name ?? 'sem detalhe no corpo da resposta';
    return { id: null, erro: `HTTP ${resposta.status} — ${semAChave(detalhe, chave)}` };
  }

  return { id: corpo?.id ?? null, erro: null };
}

/** Driver de produção com Resend. Ver `formaDeEnvio` para por que é HTTP e não SMTP. */
@Injectable()
export class CorreioResend implements Correio {
  private readonly logger = new Logger('Correio');

  constructor(
    private readonly chave: string,
    private readonly remetente: string,
  ) {}

  async enviar(email: Email): Promise<void> {
    const { erro } = await enviarPelaApiDoResend(this.chave, this.remetente, email);
    // Mesma escolha do CorreioSmtp, e mesmo custo: falha de provedor não pode
    // derrubar um cadastro já gravado (pendência 16). Quem não recebeu pede o
    // reenvio na tela de entrada.
    if (erro) this.logger.error(`Falha ao enviar para ${email.para}: ${erro}`);
  }
}

/**
 * Driver para outro provedor, configurado por `SMTP_URL`
 * (ex.: `smtp://usuario:senha@smtp.provedor.com:587`).
 *
 * Atenção: várias plataformas de hospedagem bloqueiam
 * a saída nas portas de SMTP, e a falha aparece como `Connection timeout`.
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
