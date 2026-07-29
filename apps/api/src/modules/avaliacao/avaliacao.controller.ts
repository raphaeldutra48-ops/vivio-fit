import { Body, Controller, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  EscopoDado,
  Papel,
  registrarAvaliacaoSchema,
  type AvaliacaoResumo,
  type RegistrarAvaliacaoInput,
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
import { AvaliacaoService } from './avaliacao.service';

/** Avaliação é dado de composição corporal: escopo EVOLUCAO, como as medidas. */
@ApiTags('avaliacao-fisica')
@ApiBearerAuth()
@UseGuards(CareLinkGuard, ConsentGuard, PapeisGuard)
@UseInterceptors(AuditoriaInterceptor)
@ExigeConsentimento(EscopoDado.EVOLUCAO)
@Auditar('AVALIACAO_FISICA')
@Controller('alunos/:alunoId/avaliacoes')
export class AvaliacaoController {
  constructor(private readonly avaliacao: AvaliacaoService) {}

  @Get()
  @ApiOperation({ summary: 'Histórico de avaliações, com variação para a anterior' })
  listar(@Param('alunoId') alunoId: string): Promise<AvaliacaoResumo[]> {
    return this.avaliacao.listar(alunoId);
  }

  @Post()
  @Papeis(Papel.PERSONAL, Papel.NUTRICIONISTA, Papel.MEDICO)
  @ApiOperation({
    summary: 'Registra avaliação; calcula a composição e atualiza a medida do dia',
  })
  registrar(
    @Param('alunoId') alunoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(registrarAvaliacaoSchema)) dados: RegistrarAvaliacaoInput,
  ): Promise<AvaliacaoResumo> {
    return this.avaliacao.registrar(alunoId, usuario.id, dados);
  }
}
