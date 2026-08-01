import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { ErroDominio } from '../erros/erro-dominio';
import { CHAVE_LIMITE, type OpcoesDeLimite } from './limite.decorator';
import { Limitador } from './limitador';

/**
 * Aplica o limite declarado por `@Limite()` na rota.
 *
 * É global, mas inerte onde não há metadado — assim uma rota nova não passa a
 * ser limitada sem alguém ter dito que sim.
 *
 * Os contadores vivem no processo. Ver pendência 4b: com Redis, a única coisa
 * que muda é a implementação de `Limitador`.
 */
@Injectable()
export class LimiteInterceptor implements NestInterceptor {
  /** Um par de limitadores por rota — a chave é a própria função handler. */
  private readonly porRota = new Map<unknown, { identificador: Limitador; ip: Limitador }>();

  constructor(private readonly reflector: Reflector) {}

  intercept(contexto: ExecutionContext, proximo: CallHandler): Observable<unknown> {
    const opcoes = this.reflector.get<OpcoesDeLimite | undefined>(
      CHAVE_LIMITE,
      contexto.getHandler(),
    );
    if (!opcoes) return proximo.handle();

    const { identificador, ip } = this.limitadoresDe(contexto, opcoes);
    const req = contexto.switchToHttp().getRequest<Request>();
    const res = contexto.switchToHttp().getResponse<Response>();

    const chaveIp = `ip:${req.ip ?? 'desconhecido'}`;
    const alvo = this.identificadorDe(req, opcoes);
    const chaveAlvo = alvo ? `alvo:${alvo}` : null;

    const espera = Math.max(
      chaveAlvo ? identificador.bloqueadoPor(chaveAlvo) : 0,
      ip.bloqueadoPor(chaveIp),
    );
    if (espera > 0) {
      res.setHeader('Retry-After', String(espera));
      return throwError(() => ErroDominio.limiteExcedido(espera));
    }

    if (opcoes.conta === 'todas') {
      if (chaveAlvo) identificador.registrar(chaveAlvo);
      ip.registrar(chaveIp);
      return proximo.handle();
    }

    return proximo.handle().pipe(
      // Acertou: o histórico da conta some. O balde do IP não — senão bastaria
      // um login válido próprio para zerar a contagem entre as tentativas.
      tap(() => {
        if (chaveAlvo) identificador.esquecer(chaveAlvo);
      }),
      catchError((erro: unknown) => {
        if (this.contaComoTentativa(erro)) {
          if (chaveAlvo) identificador.registrar(chaveAlvo);
          ip.registrar(chaveIp);
        }
        return throwError(() => erro);
      }),
    );
  }

  /**
   * Corpo malformado (400) é erro de cliente, não tentativa de adivinhação —
   * contá-lo faria um bug de front trancar o usuário. 5xx também não: a culpa
   * é nossa. Conta o que indica credencial errada.
   */
  private contaComoTentativa(erro: unknown): boolean {
    const status = (erro as { getStatus?: () => number })?.getStatus?.();
    return status === 401 || status === 403 || status === 404;
  }

  private identificadorDe(req: Request, opcoes: OpcoesDeLimite): string | null {
    if (!opcoes.campo || !opcoes.porIdentificador) return null;
    const corpo = req.body as Record<string, unknown> | undefined;
    const valor = corpo?.[opcoes.campo];
    if (typeof valor !== 'string' || valor.trim() === '') return null;
    // Normaliza e corta: o valor vem antes da validação do Zod, então pode ser
    // qualquer coisa — inclusive uma string enorme feita para inchar o Map.
    return valor.trim().toLowerCase().slice(0, 160);
  }

  private limitadoresDe(
    contexto: ExecutionContext,
    opcoes: OpcoesDeLimite,
  ): { identificador: Limitador; ip: Limitador } {
    const rota = contexto.getHandler();
    const existente = this.porRota.get(rota);
    if (existente) return existente;

    const janela = opcoes.janelaSegundos * 1000;
    const novo = {
      identificador: new Limitador(opcoes.porIdentificador ?? Number.MAX_SAFE_INTEGER, janela),
      ip: new Limitador(opcoes.porIp, janela),
    };
    this.porRota.set(rota, novo);
    return novo;
  }
}
