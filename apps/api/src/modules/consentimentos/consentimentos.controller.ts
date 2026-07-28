import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Papel,
  concederConsentimentoSchema,
  type ConcederConsentimentoInput,
  type ConsentimentoResumo,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import type { Request } from 'express';
import { Papeis } from '../../common/decorators/papeis.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { PapeisGuard } from '../../common/guards/papeis.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ConsentimentosService } from './consentimentos.service';

/** Só o aluno gerencia os próprios consentimentos. Ninguém consente pelo titular. */
@ApiTags('consentimentos')
@ApiBearerAuth()
@UseGuards(PapeisGuard)
@Papeis(Papel.ALUNO)
@Controller('consentimentos')
export class ConsentimentosController {
  constructor(private readonly consentimentos: ConsentimentosService) {}

  @Get()
  @ApiOperation({ summary: 'O que eu compartilho, com quem, desde quando' })
  listar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Query('incluirRevogados') incluirRevogados?: string,
  ): Promise<ConsentimentoResumo[]> {
    return this.consentimentos.listar(usuario.id, incluirRevogados === 'true');
  }

  @Post()
  conceder(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(concederConsentimentoSchema)) dados: ConcederConsentimentoInput,
    @Req() req: Request,
  ): Promise<ConsentimentoResumo> {
    return this.consentimentos.conceder(usuario, dados.escopo, dados.profissionalId, {
      ip: req.ip,
      userAgent: req.header('user-agent') ?? undefined,
    });
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoga o consentimento — efeito imediato na próxima requisição' })
  async revogar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<void> {
    await this.consentimentos.revogar(usuario, id);
  }
}
