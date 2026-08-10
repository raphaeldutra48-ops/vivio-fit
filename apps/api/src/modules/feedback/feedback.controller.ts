import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Papel,
  consultaFeedbackSchema,
  type ConsultaFeedback,
  type PainelDeFeedback,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { Papeis } from '../../common/decorators/papeis.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { PapeisGuard } from '../../common/guards/papeis.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { FeedbackService } from './feedback.service';

/**
 * O que os alunos disseram depois de treinar.
 *
 * Como o relatório de carteira, não usa ConsentGuard por rota: a rota atende a
 * carteira inteira e o filtro é aluno a aluno, dentro do serviço. Guard aqui
 * daria tudo ou nada.
 */
@ApiTags('feedback')
@ApiBearerAuth()
@UseGuards(PapeisGuard)
@Papeis(Papel.PERSONAL, Papel.NUTRICIONISTA, Papel.MEDICO, Papel.ADMIN)
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  @ApiOperation({ summary: 'Feedback pós-treino dos alunos, o mais grave primeiro' })
  doProfissional(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Query(new ZodValidationPipe(consultaFeedbackSchema)) consulta: ConsultaFeedback,
  ): Promise<PainelDeFeedback> {
    return this.feedback.doProfissional(usuario.id, consulta.dias, consulta.apenasAtencao);
  }
}
