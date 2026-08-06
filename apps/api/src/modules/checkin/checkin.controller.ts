import { Body, Controller, Get, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  EscopoDado,
  Papel,
  consultaCheckinsSchema,
  registrarCheckinSchema,
  type CheckinResumo,
  type ConsultaCheckins,
  type RegistrarCheckinInput,
  type ResumoDeCheckins,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { Auditar } from '../../common/decorators/auditar.decorator';
import { ExigeConsentimento } from '../../common/decorators/exige-consentimento.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { CareLinkGuard } from '../../common/guards/care-link.guard';
import { ConsentGuard } from '../../common/guards/consent.guard';
import { AuditoriaInterceptor } from '../../common/interceptors/auditoria.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { CheckinService } from './checkin.service';

/**
 * Check-in diário. Escopo EVOLUCAO — é acompanhamento, não dado clínico.
 *
 * Leem o aluno e os profissionais com vínculo e consentimento; **escreve só o
 * aluno**. Deixar o profissional registrar por ele destruiria o valor do dado:
 * o número deixaria de dizer o que a pessoa fez e passaria a dizer o que o
 * profissional acha que ela fez.
 */
@ApiTags('check-in')
@ApiBearerAuth()
@UseGuards(CareLinkGuard, ConsentGuard)
@UseInterceptors(AuditoriaInterceptor)
@ExigeConsentimento(EscopoDado.EVOLUCAO)
@Auditar('CHECKIN')
@Controller('alunos/:alunoId/checkins')
export class CheckinController {
  constructor(private readonly checkin: CheckinService) {}

  @Get()
  @ApiOperation({ summary: 'Check-ins do período (padrão: 30 dias)' })
  listar(
    @Param('alunoId') alunoId: string,
    @Query(new ZodValidationPipe(consultaCheckinsSchema)) consulta: ConsultaCheckins,
  ): Promise<CheckinResumo[]> {
    return this.checkin.listar(alunoId, consulta.dias);
  }

  @Get('resumo')
  @ApiOperation({ summary: 'Adesão, energia média e dias sem check-in no período' })
  resumo(
    @Param('alunoId') alunoId: string,
    @Query(new ZodValidationPipe(consultaCheckinsSchema)) consulta: ConsultaCheckins,
  ): Promise<ResumoDeCheckins> {
    return this.checkin.resumo(alunoId, consulta.dias);
  }

  @Post()
  @ApiOperation({ summary: 'Registra o check-in do dia; repetir no mesmo dia corrige' })
  registrar(
    @Param('alunoId') alunoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(registrarCheckinSchema)) dados: RegistrarCheckinInput,
  ): Promise<CheckinResumo> {
    /*
      O `CareLinkGuard` já garante que quem chega aqui tem relação com este
      aluno — mas relação inclui o profissional, e ele não pode escrever. A
      conferência de que o autor é o próprio titular mora aqui.
    */
    if (usuario.papel !== Papel.ALUNO || usuario.id !== alunoId) {
      throw ErroDominio.papelNaoAutorizado('O check-in é registrado pelo próprio aluno.');
    }
    return this.checkin.registrar(alunoId, dados);
  }
}
