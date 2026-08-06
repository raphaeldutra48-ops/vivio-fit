import { hash } from '@node-rs/argon2';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';
import { OPCOES_ARGON } from './argon';
import { CORREIO, type Correio } from './correio';
import { VALIDADE_REDEFINICAO_HORAS, montarEmailDeRedefinicao } from './mensagem-verificacao';

/** Mesmo relógio da verificação: sem Redis, o token anterior é o rate limit. */
const INTERVALO_PEDIDOS_SEGUNDOS = 60;

@Injectable()
export class RedefinicaoSenhaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(CORREIO) private readonly correio: Correio,
  ) {}

  private hashDoToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Pedido de redefinição.
   *
   * **Nunca revela se o e-mail existe.** Quem chama responde 204 em qualquer
   * caso — inclusive quando o intervalo entre pedidos barra, quando a conta foi
   * apagada e quando o endereço nunca existiu. Um endpoint que responde
   * diferente para e-mail cadastrado e não cadastrado é uma lista de clientes
   * aberta ao público, e aqui a lista é de pessoas em tratamento de saúde.
   */
  async solicitar(email: string): Promise<void> {
    const usuario = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!usuario || usuario.deletadoEm) return;

    const ultimo = await this.prisma.tokenRedefinicaoSenha.findFirst({
      where: { userId: usuario.id, usadoEm: null },
      orderBy: { criadoEm: 'desc' },
    });

    if (ultimo && (Date.now() - ultimo.criadoEm.getTime()) / 1000 < INTERVALO_PEDIDOS_SEGUNDOS) {
      // Silêncio de propósito: devolver "espere um minuto" contaria a quem
      // sonda que o endereço existe.
      return;
    }

    const token = randomBytes(32).toString('base64url');

    await this.prisma.$transaction([
      // Um link válido por vez. Pedir de novo mata o anterior — assim um link
      // esquecido numa caixa de entrada antiga deixa de servir.
      this.prisma.tokenRedefinicaoSenha.updateMany({
        where: { userId: usuario.id, usadoEm: null },
        data: { usadoEm: new Date() },
      }),
      this.prisma.tokenRedefinicaoSenha.create({
        data: {
          userId: usuario.id,
          email: usuario.email,
          tokenHash: this.hashDoToken(token),
          expiraEm: new Date(Date.now() + VALIDADE_REDEFINICAO_HORAS * 60 * 60 * 1000),
        },
      }),
    ]);

    await this.correio.enviar(this.montarEmail(usuario.nome, usuario.email, token));
  }

  /**
   * Troca a senha e devolve o usuário, pronto para receber os tokens de sessão.
   *
   * Abrir sessão aqui é o mesmo raciocínio da confirmação de e-mail: quem abriu
   * o link provou ter a caixa de entrada, e acabou de escolher a senha. Mandar
   * digitá-la de novo na tela seguinte não protegeria nada.
   */
  async redefinir(token: string, senhaNova: string): Promise<User> {
    const registro = await this.prisma.tokenRedefinicaoSenha.findUnique({
      where: { tokenHash: this.hashDoToken(token) },
      include: { user: true },
    });

    if (!registro || registro.usadoEm || registro.expiraEm < new Date()) {
      throw ErroDominio.tokenInvalido(
        'Este link de redefinição não vale mais. Peça um novo na tela de entrada.',
      );
    }

    // O e-mail da conta mudou depois que o link saiu: quem recebeu no endereço
    // antigo não deve mais poder trocar a senha desta conta.
    if (registro.user.email !== registro.email) {
      throw ErroDominio.tokenInvalido('O e-mail da conta mudou. Peça um novo link.');
    }

    const senhaHash = await hash(senhaNova, OPCOES_ARGON);

    const [, , usuario] = await this.prisma.$transaction([
      this.prisma.tokenRedefinicaoSenha.update({
        where: { id: registro.id },
        data: { usadoEm: new Date() },
      }),
      /*
        Todas as sessões caem. Se a senha precisou ser redefinida, a hipótese de
        trabalho é que ela estava perdida — e o que está perdido pode estar na
        mão de outra pessoa. Uma sessão aberta com a senha antiga sobreviver à
        troca esvaziaria o sentido de trocar.
      */
      this.prisma.sessaoRefresh.deleteMany({ where: { userId: registro.userId } }),
      this.prisma.user.update({
        where: { id: registro.userId },
        data: {
          senhaHash,
          /*
            Abrir este link prova posse da caixa de entrada — exatamente o que a
            confirmação de cadastro prova. Sem isto, quem se cadastrou, não
            confirmou e depois esqueceu a senha ficaria num beco: redefine e
            continua sem conseguir entrar, sem entender por quê.
          */
          emailVerifEm: registro.user.emailVerifEm ?? new Date(),
        },
      }),
    ]);

    return usuario;
  }

  private montarEmail(nome: string, para: string, token: string) {
    // Barra sobrando na variável do painel é fácil de acontecer, e
    // `//redefinir-senha` não é a mesma rota.
    const base = (this.config.get<string>('WEB_PUBLIC_URL') ?? 'http://localhost:3000').replace(
      /\/+$/,
      '',
    );
    return montarEmailDeRedefinicao(
      nome,
      para,
      `${base}/redefinir-senha?token=${encodeURIComponent(token)}`,
    );
  }
}
