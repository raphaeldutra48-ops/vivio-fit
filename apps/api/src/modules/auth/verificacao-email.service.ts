import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';
import { CORREIO, type Correio } from './correio';

/** 24h: tempo de sobra para quem confirma no dia seguinte, curto para quem roubou o link. */
const VALIDADE_HORAS = 24;

/**
 * Intervalo mínimo entre reenvios. Sem Redis não dá para ter rate limit de
 * verdade (pendência 4), mas o próprio token anterior serve de relógio — e
 * impede que o endpoint vire amplificador de e-mail contra terceiros.
 */
const INTERVALO_REENVIO_SEGUNDOS = 60;

@Injectable()
export class VerificacaoEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(CORREIO) private readonly correio: Correio,
  ) {}

  private hashDoToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Gera o token e dispara o e-mail. Devolve o token em claro apenas quando
   * `NODE_ENV` não é produção — é o que permite os testes seguirem o fluxo real
   * sem ler caixa de entrada.
   */
  async gerarEEnviar(usuario: Pick<User, 'id' | 'nome' | 'email'>): Promise<string | null> {
    const ultimo = await this.prisma.tokenVerificacaoEmail.findFirst({
      where: { userId: usuario.id, usadoEm: null },
      orderBy: { criadoEm: 'desc' },
    });

    if (ultimo) {
      const segundosDesdeOUltimo = (Date.now() - ultimo.criadoEm.getTime()) / 1000;
      if (segundosDesdeOUltimo < INTERVALO_REENVIO_SEGUNDOS) {
        throw ErroDominio.conflito(
          'Já enviamos um e-mail agora há pouco. Verifique sua caixa de entrada e o spam.',
        );
      }
    }

    const token = randomBytes(32).toString('base64url');
    const expiraEm = new Date(Date.now() + VALIDADE_HORAS * 60 * 60 * 1000);

    await this.prisma.$transaction([
      // Um token válido por vez: pedir outro invalida o anterior.
      this.prisma.tokenVerificacaoEmail.updateMany({
        where: { userId: usuario.id, usadoEm: null },
        data: { usadoEm: new Date() },
      }),
      this.prisma.tokenVerificacaoEmail.create({
        data: {
          userId: usuario.id,
          email: usuario.email,
          tokenHash: this.hashDoToken(token),
          expiraEm,
        },
      }),
    ]);

    await this.correio.enviar(this.montarEmail(usuario.nome, usuario.email, token));

    return this.config.get<string>('NODE_ENV') === 'production' ? null : token;
  }

  /** Confirma o e-mail e devolve o usuário, pronto para receber os tokens de sessão. */
  async verificar(token: string): Promise<User> {
    const registro = await this.prisma.tokenVerificacaoEmail.findUnique({
      where: { tokenHash: this.hashDoToken(token) },
      include: { user: true },
    });

    if (!registro || registro.usadoEm || registro.expiraEm < new Date()) {
      throw ErroDominio.tokenInvalido(
        'Este link de confirmação não vale mais. Peça um novo na tela de entrada.',
      );
    }

    // O e-mail mudou depois que o link foi emitido: confirmar validaria um
    // endereço que já não é o da conta.
    if (registro.user.email !== registro.email) {
      throw ErroDominio.tokenInvalido('O e-mail da conta mudou. Peça um novo link.');
    }

    const [, usuario] = await this.prisma.$transaction([
      this.prisma.tokenVerificacaoEmail.update({
        where: { id: registro.id },
        data: { usadoEm: new Date() },
      }),
      this.prisma.user.update({
        where: { id: registro.userId },
        // Idempotente por acaso: reconfirmar não muda a data original.
        data: { emailVerifEm: registro.user.emailVerifEm ?? new Date() },
      }),
    ]);

    return usuario;
  }

  /**
   * Reenvio pedido pela tela de login. Nunca revela se o e-mail existe nem se
   * já está confirmado — quem sonda a base não aprende nada com a resposta.
   */
  async reenviar(email: string): Promise<void> {
    const usuario = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!usuario || usuario.deletadoEm || usuario.emailVerifEm) return;

    // Um conflito de intervalo aqui também não pode virar sinal para quem sonda.
    await this.gerarEEnviar(usuario).catch(() => undefined);
  }

  private montarEmail(nome: string, para: string, token: string) {
    const base = this.config.get<string>('WEB_PUBLIC_URL') ?? 'http://localhost:3000';
    const link = `${base}/verificar-email?token=${encodeURIComponent(token)}`;
    const primeiroNome = nome.split(' ')[0];

    return {
      para,
      assunto: 'Confirme seu e-mail — Vívio Fit',
      texto: [
        `Olá, ${primeiroNome}.`,
        '',
        'Confirme seu e-mail para ativar sua conta no Vívio Fit:',
        link,
        '',
        `O link vale por ${VALIDADE_HORAS} horas.`,
        'Se não foi você quem se cadastrou, ignore esta mensagem — sem a confirmação a conta não é ativada.',
      ].join('\n'),
      html: [
        `<p>Olá, ${primeiroNome}.</p>`,
        '<p>Confirme seu e-mail para ativar sua conta no Vívio Fit:</p>',
        `<p><a href="${link}">Confirmar meu e-mail</a></p>`,
        `<p>O link vale por ${VALIDADE_HORAS} horas.</p>`,
        '<p>Se não foi você quem se cadastrou, ignore esta mensagem — sem a confirmação a conta não é ativada.</p>',
      ].join(''),
    };
  }
}
