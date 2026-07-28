import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Papel,
  consultaAuditoriaSchema,
  type AcessoRegistrado,
  type ConsultaAuditoria,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { Papeis } from '../../common/decorators/papeis.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { PapeisGuard } from '../../common/guards/papeis.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditoriaService } from './auditoria.service';

@ApiTags('auditoria')
@ApiBearerAuth()
@UseGuards(PapeisGuard)
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Get('meus-acessos')
  @Papeis(Papel.ALUNO)
  @ApiOperation({ summary: 'Quem acessou meus dados — direito do titular (LGPD)' })
  meusAcessos(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Query(new ZodValidationPipe(consultaAuditoriaSchema)) consulta: ConsultaAuditoria,
  ): Promise<{ dados: AcessoRegistrado[]; proximoCursor: string | null }> {
    return this.auditoria.meusAcessos(usuario.id, consulta);
  }
}
