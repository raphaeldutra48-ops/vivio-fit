import { Body, Controller, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  EscopoDado,
  registrarMedidaSchema,
  type MedidaResumo,
  type RegistrarMedidaInput,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { Auditar } from '../../common/decorators/auditar.decorator';
import { ExigeConsentimento } from '../../common/decorators/exige-consentimento.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { CareLinkGuard } from '../../common/guards/care-link.guard';
import { ConsentGuard } from '../../common/guards/consent.guard';
import { AuditoriaInterceptor } from '../../common/interceptors/auditoria.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { MedidasService } from './medidas.service';

/**
 * Primeiro recurso clínico do sistema. Exercita as três condições de acesso
 * na ordem: autenticação (guard global) -> vínculo -> consentimento.
 */
@ApiTags('medidas')
@ApiBearerAuth()
@UseGuards(CareLinkGuard, ConsentGuard)
@UseInterceptors(AuditoriaInterceptor)
@ExigeConsentimento(EscopoDado.EVOLUCAO)
@Auditar('MEDIDA')
@Controller('alunos/:alunoId/medidas')
export class MedidasController {
  constructor(private readonly medidas: MedidasService) {}

  @Get()
  @ApiOperation({ summary: 'Histórico de peso e medidas (escopo EVOLUCAO)' })
  listar(@Param('alunoId') alunoId: string): Promise<MedidaResumo[]> {
    return this.medidas.listar(alunoId);
  }

  @Post()
  @ApiOperation({ summary: 'Registra medição; remedir no mesmo dia atualiza a linha' })
  registrar(
    @Param('alunoId') alunoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(registrarMedidaSchema)) dados: RegistrarMedidaInput,
  ): Promise<MedidaResumo> {
    return this.medidas.registrar(alunoId, usuario.id, dados);
  }
}
