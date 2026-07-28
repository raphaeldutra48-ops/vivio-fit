import { Body, Controller, Get, Param, Patch, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  EscopoDado,
  Papel,
  criarPlanoTreinoSchema,
  type CriarPlanoTreinoInput,
  type PlanoTreinoCompleto,
  type PlanoTreinoResumo,
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
import { PlanosService } from './planos.service';

/**
 * Rotas aninhadas em /alunos/:alunoId de propósito: é o que permite os guards
 * de vínculo e consentimento funcionarem de forma uniforme, sem cada serviço
 * ter que reimplementar a checagem.
 *
 * Leitura: aluno, personal, nutricionista e médico (com consentimento TREINO).
 * Escrita: apenas o PERSONAL — conforme a matriz de acesso.
 */
@ApiTags('planos-treino')
@ApiBearerAuth()
@UseGuards(CareLinkGuard, ConsentGuard, PapeisGuard)
@UseInterceptors(AuditoriaInterceptor)
@ExigeConsentimento(EscopoDado.TREINO)
@Auditar('PLANO_TREINO')
@Controller('alunos/:alunoId/planos-treino')
export class PlanosController {
  constructor(private readonly planos: PlanosService) {}

  @Get()
  listar(@Param('alunoId') alunoId: string): Promise<PlanoTreinoResumo[]> {
    return this.planos.listar(alunoId);
  }

  /** Precisa vir antes de :planoId, senão "ativo" seria lido como um id. */
  @Get('ativo')
  @ApiOperation({ summary: 'Plano ativo completo — payload de cache offline do mobile' })
  obterAtivo(@Param('alunoId') alunoId: string): Promise<PlanoTreinoCompleto> {
    return this.planos.obterAtivo(alunoId);
  }

  @Get(':planoId')
  obter(
    @Param('alunoId') alunoId: string,
    @Param('planoId') planoId: string,
  ): Promise<PlanoTreinoCompleto> {
    return this.planos.obter(alunoId, planoId);
  }

  @Post()
  @Papeis(Papel.PERSONAL)
  criar(
    @Param('alunoId') alunoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(criarPlanoTreinoSchema)) dados: CriarPlanoTreinoInput,
  ): Promise<PlanoTreinoCompleto> {
    return this.planos.criar(alunoId, usuario.id, dados);
  }

  @Patch(':planoId')
  @Papeis(Papel.PERSONAL)
  @ApiOperation({ summary: 'Gera uma versão nova e arquiva a anterior (não sobrescreve)' })
  atualizar(
    @Param('alunoId') alunoId: string,
    @Param('planoId') planoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(criarPlanoTreinoSchema)) dados: CriarPlanoTreinoInput,
  ): Promise<PlanoTreinoCompleto> {
    return this.planos.criarNovaVersao(alunoId, usuario.id, planoId, dados);
  }

  @Post(':planoId/ativar')
  @Papeis(Papel.PERSONAL)
  ativar(
    @Param('alunoId') alunoId: string,
    @Param('planoId') planoId: string,
  ): Promise<PlanoTreinoCompleto> {
    return this.planos.ativar(alunoId, planoId);
  }
}
