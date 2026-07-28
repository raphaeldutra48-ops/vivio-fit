import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { UsuarioAutenticado } from '@vivio/contracts';

/** Injeta o usuário autenticado que o JwtAuthGuard anexou à requisição. */
export const UsuarioAtual = createParamDecorator(
  (_dado: unknown, ctx: ExecutionContext): UsuarioAutenticado => {
    const req = ctx.switchToHttp().getRequest<{ usuario: UsuarioAutenticado }>();
    return req.usuario;
  },
);
