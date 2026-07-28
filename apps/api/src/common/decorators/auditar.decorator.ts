import { SetMetadata } from '@nestjs/common';

export const CHAVE_AUDITORIA = 'recurso_auditado';

/**
 * Nomeia o recurso na trilha de auditoria. Sem o decorator, o acesso bem
 * sucedido não é registrado — por isso toda rota de dado clínico precisa dele.
 */
export const Auditar = (recursoTipo: string): MethodDecorator & ClassDecorator =>
  SetMetadata(CHAVE_AUDITORIA, recursoTipo);
