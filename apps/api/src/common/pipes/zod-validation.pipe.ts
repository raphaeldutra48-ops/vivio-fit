import { PipeTransform } from '@nestjs/common';
import { CodigoErro } from '@vivio/contracts';
import type { ZodSchema } from 'zod';
import { ErroDominio } from '../erros/erro-dominio';

/**
 * Valida o corpo/query com o mesmo schema Zod que o cliente usa.
 * Uma definição só, em packages/contracts — sem DTO duplicado.
 *
 * Usa `safeParse` em vez de `parse` + `instanceof ZodError` de propósito: o zod
 * 3.25 publica dois entrypoints (v3 e v4), então a classe do erro lançado pelo
 * schema pode não ser a mesma que este arquivo importa, e o `instanceof` falha
 * em silêncio. `safeParse` devolve o erro como valor e não depende disso.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(valor: unknown): T {
    const resultado = this.schema.safeParse(valor);
    if (resultado.success) return resultado.data;

    const campos: Record<string, string> = {};
    for (const issue of resultado.error.issues) {
      const chave = issue.path.join('.') || '_';
      // Mantém a primeira mensagem por campo — a mais específica para o usuário.
      campos[chave] ??= issue.message;
    }

    throw new ErroDominio(CodigoErro.DADOS_INVALIDOS, 'Dados inválidos.', 422, { campos });
  }
}
