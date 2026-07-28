import { SetMetadata } from '@nestjs/common';

export const CHAVE_PUBLICO = 'rota_publica';

/**
 * Marca a rota como pública. O guard de autenticação é GLOBAL — o padrão é
 * exigir token, e abrir exceção é um ato explícito e visível no código.
 */
export const Publico = (): MethodDecorator & ClassDecorator => SetMetadata(CHAVE_PUBLICO, true);
