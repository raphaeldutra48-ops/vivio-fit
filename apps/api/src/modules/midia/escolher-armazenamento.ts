import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Qual driver de mídia usar, e por quê.
 *
 * Fica fora do módulo para poder ser testado sem instanciar cliente de S3 —
 * a decisão é regra, o cliente é infraestrutura.
 *
 * A escolha é por presença de configuração, não por `NODE_ENV`: quem apontou
 * um bucket quer usá-lo, inclusive rodando localmente para conferir se as
 * credenciais funcionam antes do deploy.
 */

/** As quatro variáveis que o driver de R2 precisa (o endpoint substitui a conta). */
export const VARIAVEIS_R2 = [
  'R2_BUCKET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
] as const;

export type DriverDeMidia = 'R2' | 'LOCAL';

export function faltandoParaR2(config: ConfigService): string[] {
  // `string[]` e não a união estreita: a entrada de conta/endpoint abaixo não é
  // o nome de uma variável só, e o filtro sozinho devolveria o tipo apertado.
  const faltando: string[] = VARIAVEIS_R2.filter((v) => !config.get<string>(v));

  // Conta OU endpoint: quem usa domínio próprio de R2 informa o endpoint direto.
  if (!config.get<string>('R2_ACCOUNT_ID') && !config.get<string>('R2_ENDPOINT')) {
    faltando.push('R2_ACCOUNT_ID (ou R2_ENDPOINT)');
  }

  return faltando;
}

/**
 * Decide o driver e grita quando a escolha é perigosa.
 *
 * Em produção sem R2 o app sobe — derrubá-lo por causa de mídia seria pior —
 * mas o log diz exatamente o que vai acontecer: **as fotos serão apagadas no
 * próximo deploy**. É o mesmo tratamento que `PROXY_HOPS` recebeu: aviso alto
 * no boot em vez de descoberta silenciosa depois.
 */
export function escolherDriverDeMidia(config: ConfigService, logger: Logger): DriverDeMidia {
  const faltando = faltandoParaR2(config);
  const producao = config.get<string>('NODE_ENV') === 'production';

  if (faltando.length === 0) return 'R2';

  // Configuração pela metade quase sempre é variável esquecida, não escolha.
  const algumaPresente = faltando.length < VARIAVEIS_R2.length + 1;
  if (algumaPresente) {
    logger.warn(
      `R2 configurado pela metade — faltam: ${faltando.join(', ')}. Usando disco local.`,
    );
  }

  if (producao) {
    logger.error(
      'MÍDIA EM DISCO DE CONTÊINER: as fotos de evolução serão APAGADAS no próximo deploy. ' +
        `Configure ${VARIAVEIS_R2.join(', ')} e R2_ACCOUNT_ID (pendência 19).`,
    );
  }

  return 'LOCAL';
}
