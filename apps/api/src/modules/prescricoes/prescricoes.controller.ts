import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  EscopoDado,
  Papel,
  criarModeloPrescricaoSchema,
  criarPrescritivelSchema,
  emitirPrescricaoSchema,
  listarPrescritiveisSchema,
  mudarStatusPrescricaoSchema,
  type CriarModeloPrescricaoInput,
  type CriarPrescritivelInput,
  type EmitirPrescricaoInput,
  type ListarPrescritiveisQuery,
  type ModeloPrescricaoResumo,
  type MudarStatusPrescricaoInput,
  type PrescricaoResumo,
  type PrescritivelResumo,
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
import { PrescricoesService } from './prescricoes.service';

const PRESCRITORES = [Papel.NUTRICIONISTA, Papel.MEDICO, Papel.ADMIN] as const;

/** Catálogo e modelos: acervo do profissional, não é dado de aluno. */
@ApiTags('prescricoes')
@ApiBearerAuth()
@UseGuards(PapeisGuard)
@Papeis(...PRESCRITORES)
@Controller('prescritiveis')
export class PrescritiveisController {
  constructor(private readonly prescricoes: PrescricoesService) {}

  @Get()
  @ApiOperation({ summary: 'Catálogo global + itens próprios (suplementos, fitoterápicos…)' })
  listar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Query(new ZodValidationPipe(listarPrescritiveisSchema)) consulta: ListarPrescritiveisQuery,
  ): Promise<PrescritivelResumo[]> {
    return this.prescricoes.listarPrescritiveis(usuario, consulta);
  }

  @Post()
  @ApiOperation({ summary: 'Cadastra item; medicamento é privativo do médico' })
  criar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(criarPrescritivelSchema)) dados: CriarPrescritivelInput,
  ): Promise<PrescritivelResumo> {
    return this.prescricoes.criarPrescritivel(usuario, dados);
  }

  @Delete(':id')
  @HttpCode(204)
  async remover(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<void> {
    await this.prescricoes.removerPrescritivel(usuario, id);
  }
}

@ApiTags('prescricoes')
@ApiBearerAuth()
@UseGuards(PapeisGuard)
@Papeis(...PRESCRITORES)
@Controller('modelos-prescricao')
export class ModelosPrescricaoController {
  constructor(private readonly prescricoes: PrescricoesService) {}

  @Get()
  listar(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<ModeloPrescricaoResumo[]> {
    return this.prescricoes.listarModelos(usuario.id);
  }

  @Post()
  criar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(criarModeloPrescricaoSchema)) dados: CriarModeloPrescricaoInput,
  ): Promise<ModeloPrescricaoResumo> {
    return this.prescricoes.criarModelo(usuario, dados);
  }

  @Delete(':id')
  @HttpCode(204)
  async remover(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<void> {
    await this.prescricoes.removerModelo(usuario.id, id);
  }
}

/**
 * Prescrição do paciente. Escopo CLINICO — o mesmo dos exames e condições de
 * saúde, porque é exatamente essa natureza de dado.
 */
@ApiTags('prescricoes')
@ApiBearerAuth()
@UseGuards(CareLinkGuard, ConsentGuard, PapeisGuard)
@UseInterceptors(AuditoriaInterceptor)
@ExigeConsentimento(EscopoDado.CLINICO)
@Auditar('PRESCRICAO')
@Controller('alunos/:alunoId/prescricoes')
export class PrescricoesController {
  constructor(private readonly prescricoes: PrescricoesService) {}

  @Get()
  @ApiOperation({ summary: 'Prescrições do paciente, da mais recente para a mais antiga' })
  listar(@Param('alunoId') alunoId: string): Promise<PrescricaoResumo[]> {
    return this.prescricoes.listar(alunoId);
  }

  @Post()
  @Papeis(...PRESCRITORES)
  emitir(
    @Param('alunoId') alunoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(emitirPrescricaoSchema)) dados: EmitirPrescricaoInput,
  ): Promise<PrescricaoResumo> {
    return this.prescricoes.emitir(alunoId, usuario, dados);
  }

  @Post(':prescricaoId/substituir')
  @Papeis(...PRESCRITORES)
  @ApiOperation({ summary: 'Cria versão nova e marca a anterior como substituída' })
  substituir(
    @Param('alunoId') alunoId: string,
    @Param('prescricaoId') prescricaoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(emitirPrescricaoSchema)) dados: EmitirPrescricaoInput,
  ): Promise<PrescricaoResumo> {
    return this.prescricoes.substituir(alunoId, usuario, prescricaoId, dados);
  }

  @Patch(':prescricaoId/status')
  @Papeis(...PRESCRITORES)
  mudarStatus(
    @Param('alunoId') alunoId: string,
    @Param('prescricaoId') prescricaoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(mudarStatusPrescricaoSchema)) dados: MudarStatusPrescricaoInput,
  ): Promise<PrescricaoResumo> {
    return this.prescricoes.mudarStatus(alunoId, usuario, prescricaoId, dados);
  }
}
