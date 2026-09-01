import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Papel, type ResumoDoProfissional, type UsuarioAutenticado } from '@vivio/contracts';
import { Papeis } from '../../common/decorators/papeis.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { PapeisGuard } from '../../common/guards/papeis.guard';
import { ResumoService } from './resumo.service';

/**
 * A tela inicial do profissional.
 *
 * Não passa por `CareLinkGuard` nem `ConsentGuard`, e a razão merece ficar
 * escrita: os dois guards trabalham sobre um `:alunoId` na rota, e aqui não há
 * um — há todos. Isso **não afasta a regra de acesso**, apenas a move para
 * dentro do serviço, onde ela é aplicada aluno a aluno antes de qualquer dado
 * entrar na resposta. Uma rota agregadora é o lugar clássico onde consentimento
 * vaza; a alternativa de dispensá-lo "porque é só um resumo" é como o vazamento
 * acontece.
 *
 * O aluno não entra: o resumo é da carteira do profissional.
 */
@ApiTags('resumo')
@ApiBearerAuth()
@UseGuards(PapeisGuard)
@Papeis(Papel.PERSONAL, Papel.NUTRICIONISTA, Papel.MEDICO, Papel.ADMIN)
@Controller('resumo')
export class ResumoController {
  constructor(private readonly resumo: ResumoService) {}

  @Get()
  @ApiOperation({ summary: 'Quem precisa de atenção hoje: sumidos, alertas, pendências e agenda' })
  doProfissional(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<ResumoDoProfissional> {
    return this.resumo.doProfissional(usuario);
  }
}
