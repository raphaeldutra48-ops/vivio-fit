import { Body, Controller, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  EscopoDado,
  Papel,
  registrarExameSchema,
  type ExameResumo,
  type RegistrarExameInput,
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
import { ExamesService } from './exames.service';

/**
 * Exame laboratorial: escopo CLINICO.
 *
 * O `@Papeis` da classe é a primeira barreira e vale para todas as rotas: o
 * **personal não entra**, nem para ler. Ele recebe o alerta clínico derivado,
 * nunca o marcador. Dentro do que passa, o serviço ainda filtra por escopo —
 * o nutricionista lê os marcadores nutricionais e não os hormonais.
 */
@ApiTags('exames')
@ApiBearerAuth()
@UseGuards(CareLinkGuard, ConsentGuard, PapeisGuard)
@UseInterceptors(AuditoriaInterceptor)
@ExigeConsentimento(EscopoDado.CLINICO)
@Auditar('EXAME')
@Papeis(Papel.ALUNO, Papel.NUTRICIONISTA, Papel.MEDICO)
@Controller('alunos/:alunoId/exames')
export class ExamesController {
  constructor(private readonly exames: ExamesService) {}

  @Get()
  @ApiOperation({ summary: 'Exames do aluno, com os marcadores filtrados pelo papel de quem pede' })
  listar(
    @Param('alunoId') alunoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<ExameResumo[]> {
    return this.exames.listar(alunoId, usuario.papel);
  }

  @Get(':exameId')
  @ApiOperation({ summary: 'Um exame, com faixa laboratorial, faixa funcional e fonte de cada uma' })
  obter(
    @Param('alunoId') alunoId: string,
    @Param('exameId') exameId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<ExameResumo> {
    return this.exames.obter(alunoId, exameId, usuario.papel);
  }

  @Post()
  @Papeis(Papel.NUTRICIONISTA, Papel.MEDICO)
  @ApiOperation({
    summary: 'Registra o exame e congela a classificação de cada marcador',
  })
  registrar(
    @Param('alunoId') alunoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(registrarExameSchema)) dados: RegistrarExameInput,
  ): Promise<ExameResumo> {
    return this.exames.registrar(alunoId, usuario.id, usuario.papel, dados);
  }
}
