import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  loginSchema,
  refreshSchema,
  registrarAlunoSchema,
  registrarProfissionalSchema,
  type LoginInput,
  type ParDeTokens,
  type RefreshInput,
  type RegistrarAlunoInput,
  type RegistrarProfissionalInput,
  type RespostaAutenticacao,
} from '@vivio/contracts';
import type { Request } from 'express';
import { Publico } from '../../common/decorators/publico.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';
import { ContextoRequisicao, TokenService } from './token.service';

function contextoDe(req: Request): ContextoRequisicao {
  return { ip: req.ip, userAgent: req.header('user-agent') ?? undefined };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  @Publico()
  @Post('registrar/aluno')
  @ApiOperation({ summary: 'Cria conta de aluno e já devolve os tokens' })
  registrarAluno(
    @Body(new ZodValidationPipe(registrarAlunoSchema)) dados: RegistrarAlunoInput,
    @Req() req: Request,
  ): Promise<RespostaAutenticacao> {
    return this.auth.registrarAluno(dados, contextoDe(req));
  }

  @Publico()
  @Post('registrar/profissional')
  @ApiOperation({ summary: 'Cria conta de profissional (aguarda verificação do admin)' })
  registrarProfissional(
    @Body(new ZodValidationPipe(registrarProfissionalSchema)) dados: RegistrarProfissionalInput,
    @Req() req: Request,
  ): Promise<RespostaAutenticacao> {
    return this.auth.registrarProfissional(dados, contextoDe(req));
  }

  @Publico()
  @Post('login')
  @HttpCode(200)
  login(
    @Body(new ZodValidationPipe(loginSchema)) dados: LoginInput,
    @Req() req: Request,
  ): Promise<RespostaAutenticacao> {
    return this.auth.login(dados, contextoDe(req));
  }

  @Publico()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotaciona o refresh token; reuso derruba a sessão inteira' })
  refresh(
    @Body(new ZodValidationPipe(refreshSchema)) dados: RefreshInput,
    @Req() req: Request,
  ): Promise<ParDeTokens> {
    return this.tokens.rotacionar(dados.refreshToken, contextoDe(req));
  }

  @Publico()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new ZodValidationPipe(refreshSchema)) dados: RefreshInput): Promise<void> {
    await this.tokens.revogarPorToken(dados.refreshToken);
  }
}
