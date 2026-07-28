import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Papel, UsuarioAutenticado } from '@vivio/contracts';
import { ErroDominio } from '../erros/erro-dominio';
import { CHAVE_PAPEIS } from '../decorators/papeis.decorator';

@Injectable()
export class PapeisGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const permitidos = this.reflector.getAllAndOverride<Papel[] | undefined>(CHAVE_PAPEIS, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (!permitidos?.length) return true;

    const req = contexto.switchToHttp().getRequest<{ usuario?: UsuarioAutenticado }>();
    if (!req.usuario) throw ErroDominio.naoAutenticado();
    if (!permitidos.includes(req.usuario.papel)) throw ErroDominio.papelNaoAutorizado();

    return true;
  }
}
