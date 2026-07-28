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
  atualizarVisibilidadeFotoSchema,
  registrarFotoSchema,
  type AtualizarVisibilidadeFotoInput,
  type FotoEvolucaoResumo,
  type RegistrarFotoInput,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { Auditar } from '../../common/decorators/auditar.decorator';
import { ExigeConsentimento } from '../../common/decorators/exige-consentimento.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { CareLinkGuard } from '../../common/guards/care-link.guard';
import { ConsentGuard } from '../../common/guards/consent.guard';
import { AuditoriaInterceptor } from '../../common/interceptors/auditoria.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { FotosService } from './fotos.service';

@ApiTags('fotos-evolucao')
@ApiBearerAuth()
@UseGuards(CareLinkGuard, ConsentGuard)
@UseInterceptors(AuditoriaInterceptor)
@ExigeConsentimento(EscopoDado.EVOLUCAO)
@Auditar('FOTO_EVOLUCAO')
@Controller('alunos/:alunoId/fotos')
export class FotosController {
  constructor(private readonly fotos: FotosService) {}

  @Get()
  @ApiOperation({ summary: 'Linha do tempo; devolve links assinados de 5 minutos' })
  listar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('alunoId') alunoId: string,
  ): Promise<FotoEvolucaoResumo[]> {
    return this.fotos.listar(usuario, alunoId);
  }

  @Post()
  @ApiOperation({ summary: 'Registra a foto já enviada ao storage (chave do upload-url)' })
  registrar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('alunoId') alunoId: string,
    @Body(new ZodValidationPipe(registrarFotoSchema)) dados: RegistrarFotoInput,
  ): Promise<FotoEvolucaoResumo> {
    return this.fotos.registrar(usuario, alunoId, dados);
  }

  @Patch(':fotoId/visibilidade')
  @ApiOperation({ summary: 'O aluno escolhe quais profissionais veem esta foto' })
  atualizarVisibilidade(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('fotoId') fotoId: string,
    @Body(new ZodValidationPipe(atualizarVisibilidadeFotoSchema))
    dados: AtualizarVisibilidadeFotoInput,
  ): Promise<FotoEvolucaoResumo> {
    return this.fotos.atualizarVisibilidade(usuario, fotoId, dados.visivelPara);
  }

  @Delete(':fotoId')
  @HttpCode(204)
  async remover(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('fotoId') fotoId: string,
  ): Promise<void> {
    await this.fotos.remover(usuario, fotoId);
  }
}
