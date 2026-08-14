import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  EscopoDado,
  registrarCalorimetriaSchema,
  type CalorimetriaResumo,
  type RegistrarCalorimetriaInput,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { Auditar } from '../../common/decorators/auditar.decorator';
import { ExigeConsentimento } from '../../common/decorators/exige-consentimento.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { CareLinkGuard } from '../../common/guards/care-link.guard';
import { ConsentGuard } from '../../common/guards/consent.guard';
import { AuditoriaInterceptor } from '../../common/interceptors/auditoria.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CalorimetriaService } from './calorimetria.service';

/**
 * Calorimetria indireta. Escopo EVOLUCAO — é medida de corpo, como peso e
 * composição, e não dado clínico de diagnóstico.
 *
 * Escrevem o aluno e os profissionais com vínculo: o exame vem de um
 * laboratório, não da percepção de ninguém, então tanto faz quem digita o
 * número desde que fique registrado quem foi. É diferente do check-in, que é
 * autorrelato e só o aluno escreve.
 */
@ApiTags('calorimetria')
@ApiBearerAuth()
@UseGuards(CareLinkGuard, ConsentGuard)
@UseInterceptors(AuditoriaInterceptor)
@ExigeConsentimento(EscopoDado.EVOLUCAO)
@Auditar('CALORIMETRIA')
@Controller('alunos/:alunoId/calorimetrias')
export class CalorimetriaController {
  constructor(private readonly calorimetria: CalorimetriaService) {}

  @Get()
  @ApiOperation({ summary: 'Exames de calorimetria, com a validade de cada um' })
  listar(@Param('alunoId') alunoId: string): Promise<CalorimetriaResumo[]> {
    return this.calorimetria.listar(alunoId);
  }

  @Post()
  @ApiOperation({ summary: 'Registra o resultado de uma calorimetria indireta' })
  registrar(
    @Param('alunoId') alunoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(registrarCalorimetriaSchema)) dados: RegistrarCalorimetriaInput,
  ): Promise<CalorimetriaResumo> {
    return this.calorimetria.registrar(alunoId, usuario.id, dados);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove um exame lançado por engano' })
  async remover(@Param('alunoId') alunoId: string, @Param('id') id: string): Promise<void> {
    await this.calorimetria.remover(alunoId, id);
  }
}
