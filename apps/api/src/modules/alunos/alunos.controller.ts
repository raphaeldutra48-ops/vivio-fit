import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ResumoAluno } from '@vivio/contracts';
import { CareLinkGuard } from '../../common/guards/care-link.guard';
import { AlunosService } from './alunos.service';

@ApiTags('alunos')
@ApiBearerAuth()
@UseGuards(CareLinkGuard)
@Controller('alunos/:alunoId')
export class AlunosController {
  constructor(private readonly alunos: AlunosService) {}

  @Get('resumo')
  @ApiOperation({ summary: 'Ficha do aluno — exige vínculo ativo (ou ser o próprio aluno)' })
  resumo(@Param('alunoId') alunoId: string): Promise<ResumoAluno> {
    return this.alunos.resumo(alunoId);
  }
}
