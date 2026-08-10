import { Body, Controller, Get, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  EscopoDado,
  registrarExecucaoSchema,
  type AnterioresDaSessao,
  type ExecucaoResumo,
  type HistoricoCarga,
  type MeusRecordes,
  type RegistrarExecucaoInput,
} from '@vivio/contracts';
import { HistoricoService } from './historico.service';
import { Auditar } from '../../common/decorators/auditar.decorator';
import { ExigeConsentimento } from '../../common/decorators/exige-consentimento.decorator';
import { CareLinkGuard } from '../../common/guards/care-link.guard';
import { ConsentGuard } from '../../common/guards/consent.guard';
import { AuditoriaInterceptor } from '../../common/interceptors/auditoria.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ExecucoesService } from './execucoes.service';
import { RecordesService } from './recordes.service';

@ApiTags('execucoes')
@ApiBearerAuth()
@UseGuards(CareLinkGuard, ConsentGuard)
@UseInterceptors(AuditoriaInterceptor)
@ExigeConsentimento(EscopoDado.TREINO)
@Auditar('EXECUCAO_TREINO')
@Controller('alunos/:alunoId')
export class ExecucoesController {
  constructor(
    private readonly execucoes: ExecucoesService,
    private readonly historico: HistoricoService,
    private readonly recordesService: RecordesService,
  ) {}

  @Get('sessoes/:sessaoId/anteriores')
  @ApiOperation({
    summary: 'Coluna ANTERIOR da tela de execução: última vez de cada exercício da sessão',
  })
  anteriores(
    @Param('alunoId') alunoId: string,
    @Param('sessaoId') sessaoId: string,
  ): Promise<AnterioresDaSessao> {
    return this.historico.anterioresDaSessao(alunoId, sessaoId);
  }

  @Get('exercicios/:exercicioId/historico-carga')
  @ApiOperation({ summary: 'Progressão de carga do exercício — atual vs anteriores' })
  historicoDeCarga(
    @Param('alunoId') alunoId: string,
    @Param('exercicioId') exercicioId: string,
    @Query('limit') limit?: string,
  ): Promise<HistoricoCarga> {
    return this.historico.historicoDeCarga(alunoId, exercicioId, limit ? Number(limit) : undefined);
  }

  @Get('execucoes')
  listar(
    @Param('alunoId') alunoId: string,
    @Query('limit') limit?: string,
  ): Promise<ExecucaoResumo[]> {
    return this.execucoes.listar(alunoId, limit ? Number(limit) : undefined);
  }

  /*
    Fica aqui, e não num controlador próprio, porque recorde é leitura de série
    executada: mesmos guardas, mesmo escopo de consentimento, mesma auditoria.
  */
  @Get('recordes')
  @ApiOperation({ summary: 'Marcas pessoais do aluno, uma por exercício' })
  recordes(@Param('alunoId') alunoId: string): Promise<MeusRecordes> {
    return this.recordesService.doAluno(alunoId);
  }

  @Post('execucoes')
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
