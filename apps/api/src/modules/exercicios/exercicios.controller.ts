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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Papel,
  atualizarExercicioSchema,
  criarExercicioSchema,
  listarExerciciosSchema,
  type AtualizarExercicioInput,
  type CriarExercicioInput,
  type ExercicioResumo,
  type ListarExerciciosQuery,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { Papeis } from '../../common/decorators/papeis.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { PapeisGuard } from '../../common/guards/papeis.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ExerciciosService } from './exercicios.service';

const PROFISSIONAIS = [Papel.PERSONAL, Papel.NUTRICIONISTA, Papel.MEDICO, Papel.ADMIN] as const;

@ApiTags('exercicios')
@ApiBearerAuth()
@UseGuards(PapeisGuard)
@Controller('exercicios')
export class ExerciciosController {
  constructor(private readonly exercicios: ExerciciosService) {}

  @Get()
  @ApiOperation({ summary: 'Biblioteca global + exercícios privados de quem consulta' })
  listar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Query(new ZodValidationPipe(listarExerciciosSchema)) consulta: ListarExerciciosQuery,
  ): Promise<ExercicioResumo[]> {
    return this.exercicios.listar(usuario, consulta);
  }

  @Get(':id')
  obter(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<ExercicioResumo> {
    return this.exercicios.obter(usuario, id);
  }

  @Post()
  @Papeis(...PROFISSIONAIS)
  @ApiOperation({ summary: 'Cria exercício (GLOBAL se admin, PRIVADO caso contrário)' })
  criar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(criarExercicioSchema)) dados: CriarExercicioInput,
  ): Promise<ExercicioResumo> {
    return this.exercicios.criar(usuario, dados);
  }

  @Patch(':id')
  @Papeis(...PROFISSIONAIS)
  atualizar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(atualizarExercicioSchema)) dados: AtualizarExercicioInput,
  ): Promise<ExercicioResumo> {
    return this.exercicios.atualizar(usuario, id, dados);
  }

  @Delete(':id')
  @Papeis(...PROFISSIONAIS)
  @HttpCode(204)
  async remover(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<void> {
    await this.exercicios.remover(usuario, id);
  }
}
