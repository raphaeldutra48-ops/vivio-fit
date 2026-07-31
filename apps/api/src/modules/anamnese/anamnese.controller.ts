import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  EscopoDado,
  Papel,
  aplicarAnamneseSchema,
  salvarModeloAnamneseSchema,
  type AnamneseResumo,
  type AplicarAnamneseInput,
  type ModeloAnamneseResumo,
  type SalvarModeloAnamneseInput,
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
import { AnamneseService } from './anamnese.service';

const APLICAM = [Papel.PERSONAL, Papel.NUTRICIONISTA, Papel.MEDICO, Papel.ADMIN] as const;

/** Acervo do profissional: o questionário em si não é dado de aluno. */
@ApiTags('anamnese')
@ApiBearerAuth()
@UseGuards(PapeisGuard)
@Papeis(...APLICAM)
@Controller('modelos-anamnese')
export class ModelosAnamneseController {
  constructor(private readonly anamnese: AnamneseService) {}

  @Get()
  listar(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<ModeloAnamneseResumo[]> {
    return this.anamnese.listarModelos(usuario.id);
  }

  @Post()
  criar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(salvarModeloAnamneseSchema)) dados: SalvarModeloAnamneseInput,
  ): Promise<ModeloAnamneseResumo> {
    return this.anamnese.criarModelo(usuario.id, dados);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Substitui as perguntas; anamneses já aplicadas não mudam' })
  atualizar(
    @Param('id') id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(salvarModeloAnamneseSchema)) dados: SalvarModeloAnamneseInput,
  ): Promise<ModeloAnamneseResumo> {
    return this.anamnese.atualizarModelo(usuario.id, id, dados);
  }

  @Delete(':id')
  @HttpCode(204)
  async remover(
    @Param('id') id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    await this.anamnese.removerModelo(usuario.id, id);
  }
}

/**
 * Anamnese respondida. Histórico de saúde, medicação, cirurgia — escopo
 * CLINICO, o mesmo dos exames.
 */
@ApiTags('anamnese')
@ApiBearerAuth()
@UseGuards(CareLinkGuard, ConsentGuard, PapeisGuard)
@UseInterceptors(AuditoriaInterceptor)
@ExigeConsentimento(EscopoDado.CLINICO)
@Auditar('ANAMNESE')
@Controller('alunos/:alunoId/anamneses')
export class AnamnesesController {
  constructor(private readonly anamnese: AnamneseService) {}

  @Get()
  listar(@Param('alunoId') alunoId: string): Promise<AnamneseResumo[]> {
    return this.anamnese.listar(alunoId);
  }

  @Post()
  @Papeis(...APLICAM)
  aplicar(
    @Param('alunoId') alunoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(aplicarAnamneseSchema)) dados: AplicarAnamneseInput,
  ): Promise<AnamneseResumo> {
    return this.anamnese.aplicar(alunoId, usuario.id, dados);
  }

  @Delete(':id')
  @HttpCode(204)
  @Papeis(...APLICAM)
  async remover(
    @Param('alunoId') alunoId: string,
    @Param('id') id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    await this.anamnese.remover(alunoId, usuario.id, id);
  }
}
