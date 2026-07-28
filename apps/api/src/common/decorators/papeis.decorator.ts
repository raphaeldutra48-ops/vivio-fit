import { SetMetadata } from '@nestjs/common';
import type { Papel } from '@vivio/contracts';

export const CHAVE_PAPEIS = 'papeis_permitidos';

/** Restringe a rota aos papéis informados. Sem o decorator, qualquer autenticado passa. */
export const Papeis = (...papeis: Papel[]): MethodDecorator & ClassDecorator =>
  SetMetadata(CHAVE_PAPEIS, papeis);
