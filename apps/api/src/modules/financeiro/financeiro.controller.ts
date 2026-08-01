import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Papel,
  consultaFinanceiroSchema,
  criarCobrancaSchema,
  registrarPagamentoSchema,
  salvarPagamentoSchema,
  type CobrancaComPix,
  type CobrancaResumo,
  type ConsultaFinanceiro,
  type CriarCobrancaInput,
  type DadosDePagamento,
  type RegistrarPagamentoInput,
  type ResumoFinanceiro,
  type SalvarPagamentoInput,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { Papeis } from '../../common/decorators/papeis.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { PapeisGuard } from '../../common/guards/papeis.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { FinanceiroService } from './financeiro.service';

/**
 * Controle financeiro do profissional: quem pagou, quem deve, quanto entrou.
 *
 * Dado de cobrança é do profissional, não do aluno — por isso não passa por
 * consentimento. O aluno não acessa estas rotas.
 */
@ApiTags('financeiro')
@ApiBearerAuth()
@UseGuards(PapeisGuard)
@Papeis(Papel.PERSONAL, Papel.NUTRICIONISTA, Papel.MEDICO, Papel.ADMIN)
@Controller('financeiro')
export class FinanceiroController {
  constructor(private readonly financeiro: FinanceiroService) {}

  @Get()
  @ApiOperation({ summary: 'Cobranças do mês, com recebido, a receber e atrasado' })
  resumo(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Query(new ZodValidationPipe(consultaFinanceiroSchema)) consulta: ConsultaFinanceiro,
  ): Promise<ResumoFinanceiro> {
    return this.financeiro.resumo(usuario.id, consulta);
  }

  @Get('pagamento')
  @ApiOperation({ summary: 'Chave PIX cadastrada para gerar cobranças' })
  obterPagamento(
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<DadosDePagamento | null> {
    return this.financeiro.obterDadosDePagamento(usuario.id);
  }

  @Put('pagamento')
  salvarPagamento(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(salvarPagamentoSchema)) dados: SalvarPagamentoInput,
  ): Promise<DadosDePagamento> {
    return this.financeiro.salvarDadosDePagamento(usuario.id, dados);
  }

  @Get('cobrancas/:id/pix')
  @ApiOperation({ summary: 'BR Code (copia e cola) da cobrança' })
  gerarPix(
    @Param('id') id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<CobrancaComPix> {
    return this.financeiro.gerarPix(usuario.id, id);
  }

  @Post('cobrancas')
  @ApiOperation({ summary: 'Cria a cobrança e, se pedido, as parcelas dos meses seguintes' })
  criar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(criarCobrancaSchema)) dados: CriarCobrancaInput,
  ): Promise<CobrancaResumo[]> {
    return this.financeiro.criar(usuario.id, dados);
  }

  @Patch('cobrancas/:id/pagar')
  registrarPagamento(
    @Param('id') id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(registrarPagamentoSchema)) dados: RegistrarPagamentoInput,
  ): Promise<CobrancaResumo> {
    return this.financeiro.registrarPagamento(usuario.id, id, dados);
  }

  @Patch('cobrancas/:id/estornar')
  @ApiOperation({ summary: 'Desfaz o pagamento registrado por engano' })
  estornar(
    @Param('id') id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<CobrancaResumo> {
    return this.financeiro.estornar(usuario.id, id);
  }

  @Patch('cobrancas/:id/cancelar')
  cancelar(
    @Param('id') id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<CobrancaResumo> {
    return this.financeiro.cancelar(usuario.id, id);
  }

  @Delete('cobrancas/:id')
  @ApiOperation({ summary: 'Remove a cobrança e as parcelas do mesmo lote ainda não pagas' })
  remover(
    @Param('id') id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<{ removidas: number }> {
    return this.financeiro.removerLote(usuario.id, id);
  }
}
