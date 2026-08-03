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

/**
 * O disco local é efêmero ou sobrevive ao deploy?
 *
 * Disco de contêiner some a cada deploy; disco montado a partir de um volume
 * persistente, não. O Railway expõe `RAILWAY_VOLUME_MOUNT_PATH` quando há um
 * volume montado — se o `MEDIA_DIR` aponta para dentro dele, a mídia dura.
 *
 * A distinção existe para o aviso não mentir. Um log que grita "as fotos serão
 * apagadas" quando elas não serão ensina todo mundo a ignorar os avisos, e aí
 * o dia em que ele estiver certo ninguém lê.
 */
export function midiaEmDiscoPersistente(config: ConfigService): boolean {
  const montagem = config.get<string>('RAILWAY_VOLUME_MOUNT_PATH');
  const destino = config.get<string>('MEDIA_DIR');
  if (!montagem || !destino) return false;

  const normalizar = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
  const raiz = normalizar(montagem);
  const alvo = normalizar(destino);

  return alvo === raiz || alvo.startsWith(`${raiz}/`);
}

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

  if (midiaEmDiscoPersistente(config)) {
    // Volume montado: o disco local dura. Não é object storage — uma réplica
    // só, sem CDN e com backup por conta da casa — mas a foto sobrevive, que
    // era o problema irreversível.
    logger.log(
      `mídia em volume persistente (${config.get<string>('MEDIA_DIR')}) — sobrevive ao deploy`,
    );
    return 'LOCAL';
  }

  if (producao) {
    logger.error(
      'MÍDIA EM DISCO DE CONTÊINER: as fotos de evolução serão APAGADAS no próximo deploy. ' +
        `Configure ${VARIAVEIS_R2.join(', ')} e R2_ACCOUNT_ID, ou monte um volume (pendência 19).`,
    );
  }

  return 'LOCAL';
}
