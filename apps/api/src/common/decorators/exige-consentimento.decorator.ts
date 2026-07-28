import { SetMetadata } from '@nestjs/common';
import type { EscopoDado } from '@vivio/contracts';

export const CHAVE_ESCOPO = 'escopo_exigido';

/**
 * Marca a rota como dado sujeito a consentimento do aluno.
 * Sem consentimento vigente para o escopo, o ConsentGuard nega — mesmo que o
 * profissional tenha vínculo ativo.
 */
export const ExigeConsentimento = (escopo: EscopoDado): MethodDecorator & ClassDecorator =>
  SetMetadata(CHAVE_ESCOPO, escopo);
