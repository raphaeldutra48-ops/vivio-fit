import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { StatusVinculo } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Papel,
  convidarVinculoSchema,
  type ConvidarVinculoInput,
  type UsuarioAutenticado,
  type VinculoResumo,
} from '@vivio/contracts';
import { Papeis } from '../../common/decorators/papeis.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { PapeisGuard } from '../../common/guards/papeis.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { VinculosService } from './vinculos.service';

@ApiTags('vinculos')
@ApiBearerAuth()
@UseGuards(PapeisGuard)
@Controller('vinculos')
export class VinculosController {
  constructor(private readonly vinculos: VinculosService) {}

  @Post('convidar')
  @ApiOperation({ summary: 'Convida a contraparte pelo e-mail; o vínculo nasce PENDENTE' })
  convidar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(convidarVinculoSchema)) dados: ConvidarVinculoInput,
  ): Promise<VinculoResumo> {
    return this.vinculos.convidar(usuario, dados.email);
  }

  @Patch(':id/aceitar')
  aceitar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<VinculoResumo> {
    return this.vinculos.aceitar(usuario, id);
  }

  @Patch(':id/recusar')
  recusar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<VinculoResumo> {
    return this.vinculos.recusar(usuario, id);
  }

  @Patch(':id/encerrar')
  encerrar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<VinculoResumo> {
    return this.vinculos.encerrar(usuario, id);
  }

  @Get('meus-alunos')
  @Papeis(Papel.PERSONAL, Papel.NUTRICIONISTA, Papel.MEDICO)
  @ApiOperation({ summary: 'Carteira de alunos do profissional' })
  meusAlunos(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Query('status') status?: StatusVinculo,
  ): Promise<VinculoResumo[]> {
    return this.vinculos.meusAlunos(usuario, status);
  }

  @Get('meus-profissionais')
  @Papeis(Papel.ALUNO)
  @ApiOperation({ summary: 'Equipe de cuidado do aluno' })
  meusProfissionais(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<VinculoResumo[]> {
    return this.vinculos.meusProfissionais(usuario);
  }
}
