import { Body, Controller, Get, Param, Patch, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  EscopoDado,
  Papel,
  registrarCondicaoSchema,
  resolverCondicaoSchema,
  type CondicaoResumo,
  type RegistrarCondicaoInput,
  type ResolverCondicaoInput,
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
import { CondicoesService } from './condicoes.service';

/**
 * Condições de saúde: escopo CLINICO.
 *
 * **Ler é dos três profissionais e do aluno** — ao contrário do exame. Um
 * personal que não sabe da lesão no ombro vai prescrever desenvolvimento
 * militar, e a especificação prevê exatamente isso: condição se lê, exame não.
 *
 * **Escrever é só do médico.** Diagnosticar não é papel de quem prescreve
 * treino ou dieta, e uma condição registrada muda a conduta da equipe inteira.
 */
@ApiTags('condicoes-de-saude')
@ApiBearerAuth()
@UseGuards(CareLinkGuard, ConsentGuard, PapeisGuard)
@UseInterceptors(AuditoriaInterceptor)
@ExigeConsentimento(EscopoDado.CLINICO)
@Auditar('CONDICAO_SAUDE')
@Papeis(Papel.ALUNO, Papel.PERSONAL, Papel.NUTRICIONISTA, Papel.MEDICO)
@Controller('alunos/:alunoId/condicoes')
export class CondicoesController {
  constructor(private readonly condicoes: CondicoesService) {}

  @Get()
  @ApiOperation({ summary: 'Condições do aluno, ativas primeiro' })
  listar(@Param('alunoId') alunoId: string): Promise<CondicaoResumo[]> {
    return this.condicoes.listar(alunoId);
  }

  @Post()
  @Papeis(Papel.MEDICO)
  @ApiOperation({ summary: 'Registra a condição e dispara os alertas para a equipe' })
  registrar(
    @Param('alunoId') alunoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(registrarCondicaoSchema)) dados: RegistrarCondicaoInput,
  ): Promise<CondicaoResumo> {
    return this.condicoes.registrar(alunoId, usuario.id, dados);
  }

  @Patch(':condicaoId/resolver')
  @Papeis(Papel.MEDICO)
  @ApiOperation({ summary: 'Dá alta na condição e retira os alertas que ela gerava' })
  resolver(
    @Param('alunoId') alunoId: string,
    @Param('condicaoId') condicaoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(resolverCondicaoSchema)) dados: ResolverCondicaoInput,
  ): Promise<CondicaoResumo> {
    return this.condicoes.resolver(alunoId, condicaoId, usuario.id, dados.observacao);
  }
}
