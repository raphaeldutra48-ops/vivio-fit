import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Papel,
  consultaAgendaSchema,
  criarBloqueioSchema,
  criarCompromissoSchema,
  definirDisponibilidadeSchema,
  mudarStatusSchema,
  remarcarCompromissoSchema,
  type CompromissoResumo,
  type ConsultaAgenda,
  type CriarBloqueioInput,
  type CriarCompromissoInput,
  type DefinirDisponibilidadeInput,
  type HorarioLivre,
  type JanelaDisponivel,
  type MudarStatusInput,
  type RemarcarCompromissoInput,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { Papeis } from '../../common/decorators/papeis.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { PapeisGuard } from '../../common/guards/papeis.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AgendaService } from './agenda.service';

const PROFISSIONAIS = [Papel.PERSONAL, Papel.NUTRICIONISTA, Papel.MEDICO] as const;

@ApiTags('agenda')
@ApiBearerAuth()
@UseGuards(PapeisGuard)
@Controller('agenda')
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  @Get()
  @Papeis(...PROFISSIONAIS)
  @ApiOperation({ summary: 'Compromissos do profissional no período' })
  listar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Query(new ZodValidationPipe(consultaAgendaSchema)) consulta: ConsultaAgenda,
  ): Promise<CompromissoResumo[]> {
    return this.agenda.listar(usuario.id, consulta);
  }

  @Get('meus')
  @Papeis(Papel.ALUNO)
  @ApiOperation({ summary: 'Compromissos do aluno com qualquer profissional' })
  meus(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Query(new ZodValidationPipe(consultaAgendaSchema)) consulta: ConsultaAgenda,
  ): Promise<CompromissoResumo[]> {
    return this.agenda.meusCompromissos(usuario.id, consulta);
  }

  @Get('horarios-livres')
  @Papeis(...PROFISSIONAIS)
  @ApiOperation({ summary: 'Vagas do dia, já descontando compromissos e bloqueios' })
  horariosLivres(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Query('data') data: string,
    @Query('duracaoMin') duracaoMin?: string,
  ): Promise<HorarioLivre[]> {
    return this.agenda.horariosLivres(usuario.id, data, duracaoMin ? Number(duracaoMin) : undefined);
  }

  @Post()
  @Papeis(...PROFISSIONAIS)
  @ApiOperation({ summary: 'Marca um atendimento (exige vínculo ativo com o aluno)' })
  criar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(criarCompromissoSchema)) dados: CriarCompromissoInput,
  ): Promise<CompromissoResumo> {
    return this.agenda.criar(usuario, dados);
  }

  @Patch(':id')
  @Papeis(...PROFISSIONAIS)
  remarcar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(remarcarCompromissoSchema)) dados: RemarcarCompromissoInput,
  ): Promise<CompromissoResumo> {
    return this.agenda.remarcar(usuario, id, dados);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Confirmar, cancelar, marcar realizado ou falta' })
  mudarStatus(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(mudarStatusSchema)) dados: MudarStatusInput,
  ): Promise<CompromissoResumo> {
    return this.agenda.mudarStatus(usuario, id, dados);
  }

  @Get('disponibilidade')
  @Papeis(...PROFISSIONAIS)
  listarDisponibilidade(
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<JanelaDisponivel[]> {
    return this.agenda.listarDisponibilidade(usuario.id);
  }

  @Put('disponibilidade')
  @Papeis(...PROFISSIONAIS)
  @ApiOperation({ summary: 'Substitui a semana de atendimento inteira' })
  definirDisponibilidade(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(definirDisponibilidadeSchema)) dados: DefinirDisponibilidadeInput,
  ): Promise<JanelaDisponivel[]> {
    return this.agenda.definirDisponibilidade(usuario.id, dados);
  }

  @Post('bloqueios')
  @Papeis(...PROFISSIONAIS)
  @ApiOperation({ summary: 'Bloqueia um intervalo (férias, feriado, compromisso pessoal)' })
  criarBloqueio(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(criarBloqueioSchema)) dados: CriarBloqueioInput,
  ) {
    return this.agenda.criarBloqueio(usuario.id, dados);
  }
}
