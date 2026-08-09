import { Controller, Get, Param, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  EscopoDado,
  consultaComparativoSchema,
  type ComparativoDeEvolucao,
  type ConsultaComparativo,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { Auditar } from '../../common/decorators/auditar.decorator';
import { ExigeConsentimento } from '../../common/decorators/exige-consentimento.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { CareLinkGuard } from '../../common/guards/care-link.guard';
import { ConsentGuard } from '../../common/guards/consent.guard';
import { AuditoriaInterceptor } from '../../common/interceptors/auditoria.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ComparativoService } from './comparativo.service';

/**
 * Comparativo de evolução — o "antes e depois" que o profissional entrega.
 *
 * Escopo EVOLUCAO. O papel de quem pede é repassado ao serviço porque as
 * FOTOS têm visibilidade própria, escolhida foto a foto pelo aluno: ter
 * consentimento de evolução não implica ter liberado a imagem do corpo.
 */
@ApiTags('comparativo')
@ApiBearerAuth()
@UseGuards(CareLinkGuard, ConsentGuard)
@UseInterceptors(AuditoriaInterceptor)
@ExigeConsentimento(EscopoDado.EVOLUCAO)
@Auditar('COMPARATIVO')
@Controller('alunos/:alunoId/comparativo')
export class ComparativoController {
  constructor(private readonly comparativo: ComparativoService) {}

  @Get()
  @ApiOperation({ summary: 'Antes e depois de 30, 60, 90 ou 120 dias' })
  montar(
    @Param('alunoId') alunoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Query(new ZodValidationPipe(consultaComparativoSchema)) consulta: ConsultaComparativo,
  ): Promise<ComparativoDeEvolucao> {
    return this.comparativo.montar(alunoId, consulta.dias, usuario.papel);
  }
}
