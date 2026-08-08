import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  EscopoDado,
  Papel,
  criarMetaSchema,
  type CriarMetaInput,
  type MetaResumo,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { Auditar } from '../../common/decorators/auditar.decorator';
import { ExigeConsentimento } from '../../common/decorators/exige-consentimento.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { CareLinkGuard } from '../../common/guards/care-link.guard';
import { ConsentGuard } from '../../common/guards/consent.guard';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { AuditoriaInterceptor } from '../../common/interceptors/auditoria.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { MetasService } from './metas.service';

/**
 * Metas do aluno. Escopo EVOLUCAO, como o painel de progresso.
 *
 * **O aluno lê, o profissional escreve.** Meta é combinação de acompanhamento:
 * deixar o próprio aluno criar e concluir esvaziaria o sentido dela — vira
 * lista de desejos, e o profissional deixa de saber o que combinou.
 */
@ApiTags('metas')
@ApiBearerAuth()
@UseGuards(CareLinkGuard, ConsentGuard)
@UseInterceptors(AuditoriaInterceptor)
@ExigeConsentimento(EscopoDado.EVOLUCAO)
@Auditar('META')
@Controller('alunos/:alunoId/metas')
export class MetasController {
  constructor(private readonly metas: MetasService) {}

  @Get()
  @ApiOperation({ summary: 'Metas do aluno, com progresso aferido na hora' })
  listar(@Param('alunoId') alunoId: string): Promise<MetaResumo[]> {
    return this.metas.listar(alunoId);
  }

  @Post()
  @ApiOperation({ summary: 'Cria a meta e congela o valor inicial' })
  criar(
    @Param('alunoId') alunoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(criarMetaSchema)) dados: CriarMetaInput,
  ): Promise<MetaResumo> {
    this.exigirProfissional(usuario);
    return this.metas.criar(alunoId, usuario.id, dados);
  }

  @Patch(':metaId/concluir')
  @ApiOperation({ summary: 'Marca a meta como cumprida (único caminho da meta LIVRE)' })
  concluir(
    @Param('alunoId') alunoId: string,
    @Param('metaId') metaId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<MetaResumo> {
    this.exigirProfissional(usuario);
    return this.metas.concluir(alunoId, metaId, true);
  }

  @Patch(':metaId/reabrir')
  @ApiOperation({ summary: 'Desfaz a conclusão manual' })
  reabrir(
    @Param('alunoId') alunoId: string,
    @Param('metaId') metaId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<MetaResumo> {
    this.exigirProfissional(usuario);
    return this.metas.concluir(alunoId, metaId, false);
  }

  @Delete(':metaId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a meta (soft delete)' })
  async remover(
    @Param('alunoId') alunoId: string,
    @Param('metaId') metaId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    this.exigirProfissional(usuario);
    await this.metas.remover(alunoId, metaId);
  }

  private exigirProfissional(usuario: UsuarioAutenticado): void {
    if (usuario.papel === Papel.ALUNO) {
      throw ErroDominio.papelNaoAutorizado('As metas são definidas pelo profissional.');
    }
  }
}
