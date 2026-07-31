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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Papel,
  compartilharMaterialSchema,
  criarMaterialSchema,
  type CompartilharMaterialInput,
  type CriarMaterialInput,
  type MaterialDoAluno,
  type MaterialResumo,
  type UrlAssinada,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { Papeis } from '../../common/decorators/papeis.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { PapeisGuard } from '../../common/guards/papeis.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { MateriaisService } from './materiais.service';

const PROFISSIONAIS = [Papel.PERSONAL, Papel.NUTRICIONISTA, Papel.MEDICO, Papel.ADMIN] as const;

@ApiTags('materiais')
@ApiBearerAuth()
@UseGuards(PapeisGuard)
@Controller('materiais')
export class MateriaisController {
  constructor(private readonly materiais: MateriaisService) {}

  @Get()
  @Papeis(...PROFISSIONAIS)
  @ApiOperation({ summary: 'Biblioteca do profissional' })
  listar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Query('etiqueta') etiqueta?: string,
  ): Promise<MaterialResumo[]> {
    return this.materiais.listar(usuario.id, etiqueta?.trim().toLowerCase() || undefined);
  }

  /**
   * Antes da rota `:id`: sem isto, o Nest casaria "meus" como um id.
   */
  @Get('meus')
  @Papeis(Papel.ALUNO)
  @ApiOperation({ summary: 'Materiais que os profissionais compartilharam com o aluno' })
  meus(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<MaterialDoAluno[]> {
    return this.materiais.meus(usuario.id);
  }

  @Post()
  @Papeis(...PROFISSIONAIS)
  criar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(criarMaterialSchema)) dados: CriarMaterialInput,
  ): Promise<MaterialResumo> {
    return this.materiais.criar(usuario.id, dados);
  }

  @Get(':id/abrir')
  @ApiOperation({ summary: 'Link assinado e curto; marca como visto na primeira abertura' })
  abrir(
    @Param('id') id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<UrlAssinada> {
    return this.materiais.abrir(usuario.id, id);
  }

  @Post(':id/compartilhar')
  @Papeis(...PROFISSIONAIS)
  compartilhar(
    @Param('id') id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(compartilharMaterialSchema)) dados: CompartilharMaterialInput,
  ): Promise<MaterialResumo> {
    return this.materiais.compartilhar(usuario.id, id, dados.alunoIds);
  }

  @Delete(':id/compartilhar/:alunoId')
  @HttpCode(204)
  @Papeis(...PROFISSIONAIS)
  async descompartilhar(
    @Param('id') id: string,
    @Param('alunoId') alunoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    await this.materiais.descompartilhar(usuario.id, id, alunoId);
  }

  @Delete(':id')
  @HttpCode(204)
  @Papeis(...PROFISSIONAIS)
  async remover(
    @Param('id') id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    await this.materiais.remover(usuario.id, id);
  }
}
