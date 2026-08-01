import { SetMetadata } from '@nestjs/common';

export const CHAVE_LIMITE = 'limite_de_tentativas';

export interface OpcoesDeLimite {
  /**
   * O que conta.
   *
   * `falhas` — só tentativa recusada entra na conta. É o certo para login:
   * quem acerta a senha nunca é penalizado, e força bruta é feita de erro.
   *
   * `todas` — toda requisição conta. Para rota que responde 2xx mesmo quando
   * não faz nada (o reenvio de verificação responde 204 sempre, de propósito,
   * para não revelar quais e-mails existem) e por isso nunca produz "falha".
   */
  conta: 'falhas' | 'todas';
  /** Tentativas por IP dentro da janela. */
  porIp: number;
  /**
   * Tentativas por identificador (IP + valor do campo), quando o corpo traz um.
   * Mais apertado que `porIp`: protege uma conta específica sem trancar todo
   * mundo que sai pelo mesmo NAT.
   */
  porIdentificador?: number;
  /** Campo do corpo que identifica o alvo — normalmente `email`. */
  campo?: string;
  janelaSegundos: number;
}

/**
 * Limita tentativas na rota. Sem o decorador, nada é contado — o interceptador
 * é global mas só age onde há metadado.
 */
export const Limite = (opcoes: OpcoesDeLimite): MethodDecorator =>
  SetMetadata(CHAVE_LIMITE, opcoes);
