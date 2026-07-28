import { Body, Controller, Get, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  EscopoDado,
  registrarExecucaoSchema,
  type ExecucaoResumo,
  type RegistrarExecucaoInput,
} from '@vivio/contracts';
import { Auditar } from '../../common/decorators/auditar.decorator';
import { ExigeConsentimento } from '../../common/decorators/exige-consentimento.decorator';
import { CareLinkGuard } from '../../common/guards/care-link.guard';
import { ConsentGuard } from '../../common/guards/consent.guard';
import { AuditoriaInterceptor } from '../../common/interceptors/auditoria.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ExecucoesService } from './execucoes.service';

@ApiTags('execucoes')
@ApiBearerAuth()
@UseGuards(CareLinkGuard, ConsentGuard)
@UseInterceptors(AuditoriaInterceptor)
@ExigeConsentimento(EscopoDado.TREINO)
@Auditar('EXECUCAO_TREINO')
@Controller('alunos/:alunoId/execucoes')
export class ExecucoesController {
  constructor(private readonly execucoes: ExecucoesService) {}

  @Get()
  listar(
    @Param('alunoId') alunoId: string,
    @Query('limit') limit?: string,
  ): Promise<ExecucaoResumo[]> {
    return this.execucoes.listar(alunoId, limit ? Number(limit) : undefined);
  }

  @Post()
  @ApiOperation({
    summary: 'Registra treino realizado. Idempotente por clienteUuid (sync offline).',
  })
  registrar(
    @Param('alunoId') alunoId: string,
    @Body(new ZodValidationPipe(registrarExecucaoSchema)) dados: RegistrarExecucaoInput,
  ): Promise<ExecucaoResumo> {
    return this.execucoes.registrar(alunoId, dados);
  }
}
