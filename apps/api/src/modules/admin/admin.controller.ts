import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Papel,
  listarProfissionaisSchema,
  recusarProfissionalSchema,
  type ListarProfissionaisQuery,
  type ProfissionalParaVerificar,
  type RecusarProfissionalInput,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { Papeis } from '../../common/decorators/papeis.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { PapeisGuard } from '../../common/guards/papeis.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminService } from './admin.service';

/**
 * Painel do administrador.
 *
 * Verificar um profissional é liberar acesso a dado de saúde de terceiros —
 * por isso o papel ADMIN é a única porta, e cada decisão grava quem a tomou.
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(PapeisGuard)
@Papeis(Papel.ADMIN)
@Controller('admin/profissionais')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  @ApiOperation({ summary: 'Profissionais por status de verificação; o mais antigo primeiro' })
  listar(
    @Query(new ZodValidationPipe(listarProfissionaisSchema)) consulta: ListarProfissionaisQuery,
  ): Promise<ProfissionalParaVerificar[]> {
    return this.admin.listar(consulta);
  }

  @Get('pendentes/total')
  @ApiOperation({ summary: 'Quantos aguardam análise — alimenta o aviso no menu' })
  async contarPendentes(): Promise<{ total: number }> {
    return { total: await this.admin.contarPendentes() };
  }

  @Patch(':id/verificar')
  @ApiOperation({ summary: 'Aprova o registro no conselho e ativa a conta' })
  verificar(
    @Param('id') id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<ProfissionalParaVerificar> {
    return this.admin.verificar(usuario.id, id);
  }

  @Patch(':id/recusar')
  @ApiOperation({ summary: 'Recusa com motivo; o profissional pode corrigir e reenviar' })
  recusar(
    @Param('id') id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(recusarProfissionalSchema)) dados: RecusarProfissionalInput,
  ): Promise<ProfissionalParaVerificar> {
    return this.admin.recusar(usuario.id, id, dados.motivo);
  }
}
