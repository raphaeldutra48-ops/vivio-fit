import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  EscopoDado,
  Papel,
  aplicarModeloSchema,
  buscarSubstitutosSchema,
  criarModeloCardapioSchema,
  listaDeComprasSchema,
  salvarComoModeloSchema,
  criarPlanoDietaSchema,
  definirMetaAguaSchema,
  listarAlimentosSchema,
  registrarAguaSchema,
  registrarRefeicaoSchema,
  type AlimentoResumo,
  type AplicarModeloInput,
  type CriarModeloCardapioInput,
  type ListaDeCompras,
  type ListaDeComprasQuery,
  type ModeloCardapioCompleto,
  type ModeloCardapioResumo,
  type SalvarComoModeloInput,
  type BuscarSubstitutosQuery,
  type CriarPlanoDietaInput,
  type DefinirMetaAguaInput,
  type ListarAlimentosQuery,
  type PlanoDietaCompleto,
  type PlanoDietaResumo,
  type RegistrarAguaInput,
  type RegistrarRefeicaoInput,
  type ResumoDeAgua,
  type SubstitutoSugerido,
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
import { AguaService } from './agua.service';
import { CardapiosService } from './cardapios.service';
import { ComprasService } from './compras.service';
import { AlimentosService } from './alimentos.service';
import { DietasService } from './dietas.service';
import { RefeicoesService } from './refeicoes.service';

/** Tabela de alimentos: pública para qualquer autenticado, não é dado de aluno. */
@ApiTags('alimentos')
@ApiBearerAuth()
@Controller('alimentos')
export class AlimentosController {
  constructor(private readonly alimentos: AlimentosService) {}

  @Get()
  listar(
    @Query(new ZodValidationPipe(listarAlimentosSchema)) consulta: ListarAlimentosQuery,
  ): Promise<AlimentoResumo[]> {
    return this.alimentos.listar(consulta);
  }

  @Get('grupos')
  grupos(): Promise<string[]> {
    return this.alimentos.grupos();
  }
}

/**
 * Leitura: aluno, nutricionista, personal e médico (com consentimento NUTRICAO).
 * Escrita da dieta: apenas o NUTRICIONISTA — conforme a matriz de acesso.
 */
@ApiTags('nutricao')
@ApiBearerAuth()
@UseGuards(CareLinkGuard, ConsentGuard, PapeisGuard)
@UseInterceptors(AuditoriaInterceptor)
@ExigeConsentimento(EscopoDado.NUTRICAO)
@Auditar('PLANO_DIETA')
@Controller('alunos/:alunoId')
export class NutricaoController {
  constructor(
    private readonly dietas: DietasService,
    private readonly agua: AguaService,
    private readonly refeicoes: RefeicoesService,
    private readonly alimentos: AlimentosService,
    private readonly compras: ComprasService,
    private readonly cardapios: CardapiosService,
  ) {}

  // --- dieta ---------------------------------------------------------------

  @Get('planos-dieta')
  listar(@Param('alunoId') alunoId: string): Promise<PlanoDietaResumo[]> {
    return this.dietas.listar(alunoId);
  }

  @Get('planos-dieta/ativo')
  @ApiOperation({ summary: 'Plano alimentar ativo, com macros calculados' })
  obterAtiva(@Param('alunoId') alunoId: string): Promise<PlanoDietaCompleto> {
    return this.dietas.obterAtiva(alunoId);
  }

  @Get('planos-dieta/:planoId')
  obter(
    @Param('alunoId') alunoId: string,
    @Param('planoId') planoId: string,
  ): Promise<PlanoDietaCompleto> {
    return this.dietas.obter(alunoId, planoId);
  }

  @Post('planos-dieta')
  @Papeis(Papel.NUTRICIONISTA)
  criar(
    @Param('alunoId') alunoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(criarPlanoDietaSchema)) dados: CriarPlanoDietaInput,
  ): Promise<PlanoDietaCompleto> {
    return this.dietas.criar(alunoId, usuario.id, dados);
  }

  @Patch('planos-dieta/:planoId')
  @Papeis(Papel.NUTRICIONISTA)
  @ApiOperation({ summary: 'Gera versão nova e arquiva a anterior' })
  atualizar(
    @Param('alunoId') alunoId: string,
    @Param('planoId') planoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(criarPlanoDietaSchema)) dados: CriarPlanoDietaInput,
  ): Promise<PlanoDietaCompleto> {
    return this.dietas.criarNovaVersao(alunoId, usuario.id, planoId, dados);
  }

  @Post('planos-dieta/:planoId/ativar')
  @Papeis(Papel.NUTRICIONISTA)
  ativar(
    @Param('alunoId') alunoId: string,
    @Param('planoId') planoId: string,
  ): Promise<PlanoDietaCompleto> {
    return this.dietas.ativar(alunoId, planoId);
  }

  @Get('itens-refeicao/:itemId/substitutos')
  @ApiOperation({ summary: 'Equivalentes iso-calóricos com proteína dentro da tolerância' })
  substitutos(
    @Param('itemId') itemId: string,
    @Query(new ZodValidationPipe(buscarSubstitutosSchema)) consulta: BuscarSubstitutosQuery,
  ): Promise<SubstitutoSugerido[]> {
    return this.alimentos.substitutosPara(itemId, consulta);
  }

  // --- registro do dia -----------------------------------------------------

  @Post('registros-refeicao')
  @Papeis(Papel.ALUNO)
  @HttpCode(201)
  registrarRefeicao(
    @Param('alunoId') alunoId: string,
    @Body(new ZodValidationPipe(registrarRefeicaoSchema)) dados: RegistrarRefeicaoInput,
  ) {
    return this.refeicoes.registrar(alunoId, dados);
  }

  @Get('registros-refeicao')
  listarRegistros(@Param('alunoId') alunoId: string, @Query('data') data?: string) {
    return this.refeicoes.listarDoDia(alunoId, data ? new Date(data) : new Date());
  }

  @Get('lista-de-compras')
  @ApiOperation({ summary: 'Lista de compras do plano ativo, agrupada por seção de mercado' })
  listaDeCompras(
    @Param('alunoId') alunoId: string,
    @Query(new ZodValidationPipe(listaDeComprasSchema)) consulta: ListaDeComprasQuery,
  ): Promise<ListaDeCompras> {
    return this.compras.gerar(alunoId, consulta.dias);
  }

  @Post('planos-dieta/do-modelo/:modeloId')
  @Papeis(Papel.NUTRICIONISTA)
  @ApiOperation({ summary: 'Cria o plano do paciente a partir de um molde' })
  aplicarModelo(
    @Param('alunoId') alunoId: string,
    @Param('modeloId') modeloId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(aplicarModeloSchema)) dados: AplicarModeloInput,
  ): Promise<PlanoDietaCompleto> {
    return this.cardapios.aplicar(usuario.id, modeloId, alunoId, dados);
  }

  // --- água ----------------------------------------------------------------

  @Get('agua')
  @ApiOperation({ summary: 'Consumo do dia, meta e tempo desde o último registro' })
  resumoDeAgua(
    @Param('alunoId') alunoId: string,
    @Query('data') data?: string,
  ): Promise<ResumoDeAgua> {
    return this.agua.resumoDoDia(alunoId, data ? new Date(data) : new Date());
  }

  @Post('agua')
  @Papeis(Papel.ALUNO)
  @HttpCode(201)
  registrarAgua(
    @Param('alunoId') alunoId: string,
    @Body(new ZodValidationPipe(registrarAguaSchema)) dados: RegistrarAguaInput,
  ): Promise<ResumoDeAgua> {
    return this.agua.registrar(alunoId, dados);
  }

  @Delete('agua/:registroId')
  @Papeis(Papel.ALUNO)
  @HttpCode(204)
  async removerAgua(
    @Param('alunoId') alunoId: string,
    @Param('registroId') registroId: string,
  ): Promise<void> {
    await this.agua.remover(alunoId, registroId);
  }

  @Put('agua/meta')
  @Papeis(Papel.ALUNO, Papel.NUTRICIONISTA)
  @ApiOperation({ summary: 'Meta diária e janela em que os lembretes fazem sentido' })
  definirMetaAgua(
    @Param('alunoId') alunoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(definirMetaAguaSchema)) dados: DefinirMetaAguaInput,
  ) {
    return this.agua.definirMeta(alunoId, usuario.id, dados);
  }
}

/** Modelos de cardápio: acervo do nutricionista, não é dado de aluno. */
@ApiTags('cardapios')
@ApiBearerAuth()
@UseGuards(PapeisGuard)
@Papeis(Papel.NUTRICIONISTA, Papel.ADMIN)
@Controller('cardapios')
export class CardapiosController {
  constructor(private readonly cardapios: CardapiosService) {}

  @Get()
  listar(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<ModeloCardapioResumo[]> {
    return this.cardapios.listar(usuario.id);
  }

  @Get(':id')
  obter(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<ModeloCardapioCompleto> {
    return this.cardapios.obter(usuario.id, id);
  }

  @Post()
  @ApiOperation({ summary: 'Cria um molde reutilizável de plano alimentar' })
  criar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(criarModeloCardapioSchema)) dados: CriarModeloCardapioInput,
  ): Promise<ModeloCardapioCompleto> {
    return this.cardapios.criar(usuario.id, dados);
  }

  @Post('do-plano')
  @ApiOperation({ summary: 'Transforma um plano já entregue em molde' })
  salvarComoModelo(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(salvarComoModeloSchema)) dados: SalvarComoModeloInput,
  ): Promise<ModeloCardapioCompleto> {
    return this.cardapios.salvarComoModelo(usuario.id, dados);
  }

  @Delete(':id')
  @HttpCode(204)
  async remover(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<void> {
    await this.cardapios.remover(usuario.id, id);
  }
}
