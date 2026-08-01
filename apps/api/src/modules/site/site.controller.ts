import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Papel,
  enviarPedidoSchema,
  salvarPerfilPublicoSchema,
  type EnviarPedidoInput,
  type PaginaPublica,
  type PedidoResumo,
  type PerfilPublicoResumo,
  type SalvarPerfilPublicoInput,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { Papeis } from '../../common/decorators/papeis.decorator';
import { Publico } from '../../common/decorators/publico.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { PapeisGuard } from '../../common/guards/papeis.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SiteService } from './site.service';

/** Configuração da página — do profissional dono dela. */
@ApiTags('site')
@ApiBearerAuth()
@UseGuards(PapeisGuard)
@Papeis(Papel.PERSONAL, Papel.NUTRICIONISTA, Papel.MEDICO, Papel.ADMIN)
@Controller('site')
export class SiteController {
  constructor(private readonly site: SiteService) {}

  @Get()
  meu(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<PerfilPublicoResumo | null> {
    return this.site.meu(usuario.id);
  }

  @Put()
  @ApiOperation({ summary: 'Cria ou atualiza; publicar exige registro verificado' })
  salvar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(salvarPerfilPublicoSchema)) dados: SalvarPerfilPublicoInput,
  ): Promise<PerfilPublicoResumo> {
    return this.site.salvar(usuario.id, dados);
  }

  @Get('pedidos')
  listarPedidos(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<PedidoResumo[]> {
    return this.site.listarPedidos(usuario.id);
  }

  @Patch('pedidos/:id/atendido')
  @HttpCode(204)
  @ApiOperation({ summary: 'Alterna entre atendido e não atendido' })
  async marcarAtendido(
    @Param('id') id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    await this.site.marcarAtendido(usuario.id, id);
  }
}

/**
 * Página pública. Sem autenticação — é o ponto do recurso.
 *
 * Devolve só o que o profissional escolheu publicar, e só se a página estiver
 * publicada e o registro verificado.
 */
@ApiTags('site')
@Controller('p')
export class PaginaPublicaController {
  constructor(private readonly site: SiteService) {}

  @Publico()
  @Get(':slug')
  porSlug(@Param('slug') slug: string): Promise<PaginaPublica> {
    return this.site.porSlug(slug);
  }

  @Publico()
  @Post(':slug/contato')
  @HttpCode(204)
  @ApiOperation({ summary: 'Formulário de interesse da página pública' })
  async enviarPedido(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(enviarPedidoSchema)) dados: EnviarPedidoInput,
  ): Promise<void> {
    await this.site.enviarPedido(slug, dados);
  }
}
