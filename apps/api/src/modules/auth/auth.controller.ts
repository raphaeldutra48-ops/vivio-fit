import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  loginSchema,
  refreshSchema,
  registrarAlunoSchema,
  registrarProfissionalSchema,
  reenviarVerificacaoSchema,
  verificarEmailSchema,
  type LoginInput,
  type ParDeTokens,
  type RefreshInput,
  type ReenviarVerificacaoInput,
  type RegistrarAlunoInput,
  type RegistrarProfissionalInput,
  type RespostaAutenticacao,
  type RespostaRegistro,
  type VerificarEmailInput,
} from '@vivio/contracts';
import type { Request, Response } from 'express';
import { Publico } from '../../common/decorators/publico.decorator';
import { Limite } from '../../common/limite/limite.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { AuthService } from './auth.service';
import {
  definirCookieDeRefresh,
  limparCookieDeRefresh,
  querCookie,
  refreshDoCookie,
} from './cookie-refresh';
import { ContextoRequisicao, TokenService } from './token.service';
import { VerificacaoEmailService } from './verificacao-email.service';

function contextoDe(req: Request): ContextoRequisicao {
  return { ip: req.ip, userAgent: req.header('user-agent') ?? undefined };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly verificacao: VerificacaoEmailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Entrega a sessão do jeito que o cliente pediu.
   *
   * Web: o refresh vai só no cookie httpOnly e é **removido do corpo** — se
   * continuasse ali, um XSS o pegaria da resposta e o cookie não teria servido
   * para nada. Mobile: segue no corpo, para o SecureStore.
   */
  private entregarSessao<T extends { refreshToken: string }>(
    req: Request,
    res: Response,
    sessao: T,
  ): T {
    if (!querCookie(req)) return sessao;
    definirCookieDeRefresh(res, this.config, sessao.refreshToken);
    return { ...sessao, refreshToken: '' };
  }

  @Publico()
  @Post('registrar/aluno')
  @ApiOperation({ summary: 'Cria conta de aluno; a sessão só nasce após confirmar o e-mail' })
  registrarAluno(
    @Body(new ZodValidationPipe(registrarAlunoSchema)) dados: RegistrarAlunoInput,
  ): Promise<RespostaRegistro> {
    return this.auth.registrarAluno(dados);
  }

  @Publico()
  @Post('registrar/profissional')
  @ApiOperation({ summary: 'Cria conta de profissional (aguarda verificação do admin)' })
  registrarProfissional(
    @Body(new ZodValidationPipe(registrarProfissionalSchema)) dados: RegistrarProfissionalInput,
  ): Promise<RespostaRegistro> {
    return this.auth.registrarProfissional(dados);
  }

  /** O token tem entropia de sobra, mas adivinhação em massa não precisa ser de graça. */
  @Publico()
  @Post('verificar-email')
  @HttpCode(200)
  @Limite({ conta: 'falhas', porIp: 30, janelaSegundos: 900 })
  @ApiOperation({ summary: 'Confirma o e-mail pelo token do link e já devolve os tokens' })
  async verificarEmail(
    @Body(new ZodValidationPipe(verificarEmailSchema)) dados: VerificarEmailInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RespostaAutenticacao> {
    return this.entregarSessao(req, res, await this.auth.confirmarEmail(dados.token, contextoDe(req)));
  }

  /**
   * `todas` e não `falhas`: esta rota responde 204 mesmo quando não faz nada,
   * de propósito, para não revelar quais e-mails existem. Sem "falha" para
   * contar, o limite tem de ser por requisição — senão vira um jeito gratuito
   * de encher a caixa de entrada de alguém.
   */
  @Publico()
  @Post('reenviar-verificacao')
  @HttpCode(204)
  @Limite({ conta: 'todas', campo: 'email', porIdentificador: 5, porIp: 20, janelaSegundos: 900 })
  @ApiOperation({ summary: 'Reenvia o link. Responde 204 sempre, exista o e-mail ou não' })
  async reenviarVerificacao(
    @Body(new ZodValidationPipe(reenviarVerificacaoSchema)) dados: ReenviarVerificacaoInput,
  ): Promise<void> {
    await this.verificacao.reenviar(dados.email);
  }

  /**
   * 10 senhas erradas na mesma conta em 15 minutos param a conta; 60 no mesmo
   * IP param o IP. Quem acerta a senha nunca é contado, então o usuário comum
   * não encosta nisso. O argon2id já tornava a força bruta cara — isto tira o
   * "ilimitado" da conta, que era o que faltava.
   */
  @Publico()
  @Post('login')
  @HttpCode(200)
  @Limite({ conta: 'falhas', campo: 'email', porIdentificador: 10, porIp: 60, janelaSegundos: 900 })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dados: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RespostaAutenticacao> {
    return this.entregarSessao(req, res, await this.auth.login(dados, contextoDe(req)));
  }

  @Publico()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotaciona o refresh token; reuso derruba a sessão inteira' })
  async refresh(
    @Body(new ZodValidationPipe(refreshSchema)) dados: RefreshInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ParDeTokens> {
    // Cookie primeiro: quem tem cookie é a web, e o corpo dela vem vazio.
    const token = refreshDoCookie(req) ?? dados.refreshToken;
    if (!token) throw ErroDominio.tokenInvalido('Nenhum refresh token foi enviado.');

    try {
      return this.entregarSessao(req, res, await this.tokens.rotacionar(token, contextoDe(req)));
    } catch (erro) {
      // Rotação recusada com cookie na mão: ele não vale mais para nada, e
      // deixá-lo no navegador só faria a próxima tentativa falhar igual.
      if (refreshDoCookie(req)) limparCookieDeRefresh(res, this.config);
      throw erro;
    }
  }

  @Publico()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body(new ZodValidationPipe(refreshSchema)) dados: RefreshInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = refreshDoCookie(req) ?? dados.refreshToken;
    if (token) await this.tokens.revogarPorToken(token);
    limparCookieDeRefresh(res, this.config);
  }
}
