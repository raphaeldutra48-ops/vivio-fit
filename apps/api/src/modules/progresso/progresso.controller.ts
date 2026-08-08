import { Controller, Get, Param, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  EscopoDado,
  consultaProgressoSchema,
  type ConsultaProgresso,
  type PainelDeProgresso,
} from '@vivio/contracts';
import { Auditar } from '../../common/decorators/auditar.decorator';
import { ExigeConsentimento } from '../../common/decorators/exige-consentimento.decorator';
import { CareLinkGuard } from '../../common/guards/care-link.guard';
import { ConsentGuard } from '../../common/guards/consent.guard';
import { AuditoriaInterceptor } from '../../common/interceptors/auditoria.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ProgressoService } from './progresso.service';

/**
 * Painel de progresso: leitura conjunta de treino, check-in e medidas.
 *
 * Escopo EVOLUCAO, o mesmo das medidas — é acompanhamento, não dado clínico.
 * Quem tem vínculo e consentimento lê; o próprio aluno também.
 */
@ApiTags('progresso')
@ApiBearerAuth()
@UseGuards(CareLinkGuard, ConsentGuard)
@UseInterceptors(AuditoriaInterceptor)
@ExigeConsentimento(EscopoDado.EVOLUCAO)
@Auditar('PROGRESSO')
@Controller('alunos/:alunoId/progresso')
export class ProgressoController {
  constructor(private readonly progresso: ProgressoService) {}

  @Get()
  @ApiOperation({ summary: 'Frequência, volume, tempo, adesão e evolução de carga no período' })
  painel(
    @Param('alunoId') alunoId: string,
    @Query(new ZodValidationPipe(consultaProgressoSchema)) consulta: ConsultaProgresso,
  ): Promise<PainelDeProgresso> {
    return this.progresso.painel(alunoId, consulta.dias);
  }
}
