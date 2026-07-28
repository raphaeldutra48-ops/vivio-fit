import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Papel,
  definirLembreteSchema,
  registrarDispositivoSchema,
  type DefinirLembreteInput,
  type LembreteResumo,
  type NotificacaoResumo,
  type RegistrarDispositivoInput,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { Papeis } from '../../common/decorators/papeis.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { PapeisGuard } from '../../common/guards/papeis.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { NotificacoesService } from './notificacoes.service';

/** Tudo aqui é do próprio usuário: ninguém configura lembrete alheio. */
@ApiTags('notificacoes')
@ApiBearerAuth()
@UseGuards(PapeisGuard)
@Controller('me')
export class NotificacoesController {
  constructor(private readonly notificacoes: NotificacoesService) {}

  @Put('dispositivos')
  @HttpCode(204)
  @ApiOperation({ summary: 'Registra o token de push deste aparelho' })
  async registrarDispositivo(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(registrarDispositivoSchema)) dados: RegistrarDispositivoInput,
  ): Promise<void> {
    await this.notificacoes.registrarDispositivo(usuario.id, dados);
  }

  @Delete('dispositivos/:token')
  @HttpCode(204)
  async removerDispositivo(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('token') token: string,
  ): Promise<void> {
    await this.notificacoes.removerDispositivo(usuario.id, token);
  }

  @Get('lembretes')
  @Papeis(Papel.ALUNO)
  listarLembretes(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<LembreteResumo[]> {
    return this.notificacoes.listarLembretes(usuario.id);
  }

  @Put('lembretes')
  @Papeis(Papel.ALUNO)
  @ApiOperation({ summary: 'Define horários de um tipo de lembrete (fuso do aluno)' })
  definirLembrete(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(definirLembreteSchema)) dados: DefinirLembreteInput,
  ): Promise<LembreteResumo> {
    return this.notificacoes.definirLembrete(usuario.id, dados);
  }

  @Get('notificacoes')
  listarNotificacoes(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Query('limit') limit?: string,
  ): Promise<NotificacaoResumo[]> {
    return this.notificacoes.listarNotificacoes(usuario.id, limit ? Number(limit) : undefined);
  }

  @Patch('notificacoes/:id/lida')
  @HttpCode(204)
  async marcarComoLida(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<void> {
    await this.notificacoes.marcarComoLida(usuario.id, id);
  }
}
