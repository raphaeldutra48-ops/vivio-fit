import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Papel } from '@prisma/client';
import type { ParDeTokens, PayloadAccessToken } from '@vivio/contracts';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';

export interface ContextoRequisicao {
  ip?: string;
  userAgent?: string;
}

/** Converte "15m" / "30d" / "3600s" em milissegundos. */
export function duracaoParaMs(valor: string): number {
  const m = /^(\d+)\s*([smhd])$/.exec(valor.trim());
  if (!m) throw new Error(`Duração inválida: ${valor}`);
  const n = Number(m[1]);
  const unidade = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as 's' | 'm' | 'h' | 'd'];
  return n * unidade;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Guardamos só o hash: se o banco vazar, os refresh tokens não vão junto. */
  private hashDoToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async assinarAccessToken(u: {
    id: string;
    papel: Papel;
    email: string;
  }): Promise<{ token: string; expiraEm: number }> {
    const ttlMs = duracaoParaMs(this.config.get<string>('JWT_ACCESS_TTL') ?? '15m');
    const payload: PayloadAccessToken = { sub: u.id, papel: u.papel, email: u.email };
    const token = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: Math.floor(ttlMs / 1000), // em segundos, evita ambiguidade de formato
    });
    return { token, expiraEm: Date.now() + ttlMs };
  }

  /**
   * Emite um par novo. `familiaId` ausente abre uma família nova (login);
   * informado, continua a família existente (rotação).
   */
  async emitirPar(
    usuario: { id: string; papel: Papel; email: string },
    ctx: ContextoRequisicao,
    familiaId: string = randomUUID(),
  ): Promise<ParDeTokens> {
    const { token: accessToken, expiraEm } = await this.assinarAccessToken(usuario);
    const refreshToken = randomBytes(48).toString('base64url');
    const ttlRefresh = this.config.get<string>('JWT_REFRESH_TTL') ?? '30d';

    await this.prisma.sessaoRefresh.create({
      data: {
        familiaId,
        userId: usuario.id,
        tokenHash: this.hashDoToken(refreshToken),
        expiraEm: new Date(Date.now() + duracaoParaMs(ttlRefresh)),
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
    });

    return { accessToken, refreshToken, expiraEm };
  }

  /**
   * Rotação com detecção de reuso.
   *
   * Um refresh token é de uso único. Se um token JÁ USADO reaparecer, significa
   * que ele vazou (o legítimo já rotacionou). Não dá para saber quem é o
   * atacante, então derrubamos a família inteira e exigimos login novo.
   */
  async rotacionar(refreshToken: string, ctx: ContextoRequisicao): Promise<ParDeTokens> {
    const sessao = await this.prisma.sessaoRefresh.findUnique({
      where: { tokenHash: this.hashDoToken(refreshToken) },
      include: {
        user: { select: { id: true, papel: true, email: true, deletadoEm: true } },
      },
    });

    if (!sessao || sessao.user.deletadoEm) throw ErroDominio.tokenInvalido();

    if (sessao.usadoEm) {
      await this.revogarFamilia(sessao.familiaId);
      throw ErroDominio.tokenReutilizado();
    }

    if (sessao.revogadoEm) throw ErroDominio.tokenInvalido();
    if (sessao.expiraEm.getTime() < Date.now()) throw ErroDominio.tokenInvalido();

    await this.prisma.sessaoRefresh.update({
      where: { id: sessao.id },
      data: { usadoEm: new Date() },
    });

    return this.emitirPar(sessao.user, ctx, sessao.familiaId);
  }

  async revogarFamilia(familiaId: string): Promise<void> {
    await this.prisma.sessaoRefresh.updateMany({
      where: { familiaId, revogadoEm: null },
      data: { revogadoEm: new Date() },
    });
  }

  /** Logout: encerra apenas a sessão apresentada, não as outras do usuário. */
  async revogarPorToken(refreshToken: string): Promise<void> {
    const sessao = await this.prisma.sessaoRefresh.findUnique({
      where: { tokenHash: this.hashDoToken(refreshToken) },
      select: { familiaId: true },
    });
    if (sessao) await this.revogarFamilia(sessao.familiaId);
  }
}
