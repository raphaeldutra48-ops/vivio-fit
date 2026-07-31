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
  salvarReceitaSchema,
  salvarRefeicaoSchema,
  type ReceitaResumo,
  type RefeicaoSalvaResumo,
  type SalvarReceitaInput,
  type SalvarRefeicaoInput,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { Papeis } from '../../common/decorators/papeis.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { PapeisGuard } from '../../common/guards/papeis.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ReceitasService } from './receitas.service';

/** Acervo do nutricionista — não é dado de aluno, então nem vínculo nem consentimento. */
@ApiTags('nutricao')
@ApiBearerAuth()
@UseGuards(PapeisGuard)
@Papeis(Papel.NUTRICIONISTA, Papel.ADMIN)
@Controller('receitas')
export class ReceitasController {
  constructor(private readonly receitas: ReceitasService) {}

  @Get()
  @ApiOperation({ summary: 'Receitas do nutricionista, com macros por porção calculados' })
  listar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Query('q') q?: string,
  ): Promise<ReceitaResumo[]> {
    return this.receitas.listarReceitas(usuario.id, q?.trim() || undefined);
  }

  @Post()
  criar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(salvarReceitaSchema)) dados: SalvarReceitaInput,
  ): Promise<ReceitaResumo> {
    return this.receitas.criarReceita(usuario.id, dados);
  }

  @Patch(':id')
  atualizar(
    @Param('id') id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(salvarReceitaSchema)) dados: SalvarReceitaInput,
  ): Promise<ReceitaResumo> {
    return this.receitas.atualizarReceita(usuario.id, id, dados);
  }

  @Delete(':id')
  @HttpCode(204)
  async remover(
    @Param('id') id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    await this.receitas.removerReceita(usuario.id, id);
  }
}

@ApiTags('nutricao')
@ApiBearerAuth()
@UseGuards(PapeisGuard)
@Papeis(Papel.NUTRICIONISTA, Papel.ADMIN)
@Controller('refeicoes')
export class RefeicoesSalvasController {
  constructor(private readonly receitas: ReceitasService) {}

  @Get()
  @ApiOperation({ summary: 'Refeições reutilizáveis, com o total de macros somado' })
  listar(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<RefeicaoSalvaResumo[]> {
    return this.receitas.listarRefeicoes(usuario.id);
  }

  @Post()
  criar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(salvarRefeicaoSchema)) dados: SalvarRefeicaoInput,
  ): Promise<RefeicaoSalvaResumo> {
    return this.receitas.criarRefeicao(usuario.id, dados);
  }

  @Patch(':id')
  atualizar(
    @Param('id') id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(salvarRefeicaoSchema)) dados: SalvarRefeicaoInput,
  ): Promise<RefeicaoSalvaResumo> {
    return this.receitas.atualizarRefeicao(usuario.id, id, dados);
  }

  @Delete(':id')
  @HttpCode(204)
  async remover(
    @Param('id') id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    await this.receitas.removerRefeicao(usuario.id, id);
  }
}
