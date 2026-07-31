import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Papel,
  consultaRelatorioSchema,
  type ConsultaRelatorio,
  type RelatorioDaCarteira,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { Papeis } from '../../common/decorators/papeis.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { PapeisGuard } from '../../common/guards/papeis.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RelatoriosService } from './relatorios.service';

/**
 * O relatório só mostra dado que o aluno autorizou — por isso não usa
 * CareLinkGuard nem ConsentGuard por rota: o filtro é por linha, aluno a aluno,
 * dentro do serviço. Guard de rota aqui daria tudo ou nada.
 */
@ApiTags('relatorios')
@ApiBearerAuth()
@UseGuards(PapeisGuard)
@Papeis(Papel.PERSONAL, Papel.NUTRICIONISTA, Papel.MEDICO, Papel.ADMIN)
@Controller('relatorios')
export class RelatoriosController {
  constructor(private readonly relatorios: RelatoriosService) {}

  @Get('carteira')
  @ApiOperation({ summary: 'Panorama dos alunos ativos no período' })
  carteira(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Query(new ZodValidationPipe(consultaRelatorioSchema)) consulta: ConsultaRelatorio,
  ): Promise<RelatorioDaCarteira> {
    return this.relatorios.daCarteira(usuario.id, consulta.dias);
  }
}
