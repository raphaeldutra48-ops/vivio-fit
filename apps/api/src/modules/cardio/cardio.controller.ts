import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  EscopoDado,
  Papel,
  consultaCardioSchema,
  registrarCardioSchema,
  type CardioResumo,
  type ConsultaCardio,
  type RegistrarCardioInput,
  type ResumoDeCalorias,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { Auditar } from '../../common/decorators/auditar.decorator';
import { ExigeConsentimento } from '../../common/decorators/exige-consentimento.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { CareLinkGuard } from '../../common/guards/care-link.guard';
import { ConsentGuard } from '../../common/guards/consent.guard';
import { AuditoriaInterceptor } from '../../common/interceptors/auditoria.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CardioService } from './cardio.service';

/**
 * Cardio e gasto calórico. Escopo TREINO — é atividade física registrada.
 *
 * Mesma divisão do check-in: leem o aluno e os profissionais com vínculo e
 * consentimento; **escreve só o aluno**. Cardio lançado pelo profissional
 * deixaria de dizer o que a pessoa fez e passaria a dizer o que ele acha que
 * ela fez — e é sobre esse número que a conta de caloria é feita.
 */
@ApiTags('cardio')
@ApiBearerAuth()
@UseGuards(CareLinkGuard, ConsentGuard)
@UseInterceptors(AuditoriaInterceptor)
@ExigeConsentimento(EscopoDado.TREINO)
@Auditar('CARDIO')
@Controller('alunos/:alunoId/cardio')
export class CardioController {
  constructor(private readonly cardio: CardioService) {}

  @Get()
  @ApiOperation({ summary: 'Atividades de cardio do período (padrão: 30 dias)' })
  listar(
    @Param('alunoId') alunoId: string,
    @Query(new ZodValidationPipe(consultaCardioSchema)) consulta: ConsultaCardio,
  ): Promise<CardioResumo[]> {
    return this.cardio.listar(alunoId, consulta.dias);
  }

  @Get('calorias')
  @ApiOperation({ summary: 'Estimativa de gasto calórico — musculação e cardio separados' })
  calorias(
    @Param('alunoId') alunoId: string,
    @Query(new ZodValidationPipe(consultaCardioSchema)) consulta: ConsultaCardio,
  ): Promise<ResumoDeCalorias> {
    return this.cardio.resumoDeCalorias(alunoId, consulta.dias);
  }

  @Post()
  @ApiOperation({ summary: 'Registra uma atividade — só o próprio aluno' })
  registrar(
    @Param('alunoId') alunoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(registrarCardioSchema)) dados: RegistrarCardioInput,
  ): Promise<CardioResumo> {
    this.exigirQueSejaOProprioAluno(usuario, alunoId);
    return this.cardio.registrar(alunoId, dados);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove uma atividade registrada por engano' })
  async remover(
    @Param('alunoId') alunoId: string,
    @Param('id') id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    this.exigirQueSejaOProprioAluno(usuario, alunoId);
    await this.cardio.remover(alunoId, id);
  }

  private exigirQueSejaOProprioAluno(usuario: UsuarioAutenticado, alunoId: string): void {
    if (usuario.papel !== Papel.ALUNO || usuario.id !== alunoId) {
      throw ErroDominio.papelNaoAutorizado('Só o próprio aluno registra a atividade dele.');
    }
  }
}
