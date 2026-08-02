import { Body, Controller, Get, Param, Patch, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  EscopoDado,
  Papel,
  reconhecerAlertaSchema,
  type AlertaResumo,
  type ReconhecerAlertaInput,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { Auditar } from '../../common/decorators/auditar.decorator';
import { ExigeConsentimento } from '../../common/decorators/exige-consentimento.decorator';
import { Papeis } from '../../common/decorators/papeis.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { CareLinkGuard } from '../../common/guards/care-link.guard';
import { ConsentGuard } from '../../common/guards/consent.guard';
import { PapeisGuard } from '../../common/guards/papeis.guard';
import { AuditoriaInterceptor } from '../../common/interceptors/auditoria.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AlertasService } from './alertas.service';

/**
 * Alertas cruzados.
 *
 * Aqui o **personal entra** — ao contrário dos exames. É a contrapartida do
 * desenho: ele não vê marcador nenhum, e por isso precisa receber a orientação
 * derivada. O consentimento exigido continua sendo o CLINICO: sem ele, não há
 * dado clínico a derivar e não há alerta.
 *
 * O aluno não entra: orientação clínica passa pelo profissional.
 */
@ApiTags('alertas-clinicos')
@ApiBearerAuth()
@UseGuards(CareLinkGuard, ConsentGuard, PapeisGuard)
@UseInterceptors(AuditoriaInterceptor)
@ExigeConsentimento(EscopoDado.CLINICO)
@Auditar('ALERTA_CLINICO')
@Papeis(Papel.PERSONAL, Papel.NUTRICIONISTA, Papel.MEDICO)
@Controller('alunos/:alunoId/alertas')
export class AlertasController {
  constructor(private readonly alertas: AlertasService) {}

  @Get()
  @ApiOperation({ summary: 'Alertas endereçados ao papel de quem pede, não reconhecidos primeiro' })
  listar(
    @Param('alunoId') alunoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<AlertaResumo[]> {
    return this.alertas.listar(alunoId, usuario.papel);
  }

  @Patch(':alertaId/reconhecer')
  @ApiOperation({ summary: 'Marca como visto; só quem é o destinatário consegue' })
  reconhecer(
    @Param('alunoId') alunoId: string,
    @Param('alertaId') alertaId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(reconhecerAlertaSchema)) dados: ReconhecerAlertaInput,
  ): Promise<AlertaResumo> {
    return this.alertas.reconhecer(
      alunoId,
      alertaId,
      usuario.id,
      usuario.papel,
      dados.anotacao,
    );
  }
}
