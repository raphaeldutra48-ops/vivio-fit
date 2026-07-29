import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  abrirConversaSchema,
  enviarMensagemSchema,
  listarMensagensSchema,
  type AbrirConversaInput,
  type ConversaResumo,
  type EnviarMensagemInput,
  type ListarMensagensQuery,
  type MensagemResumo,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

@ApiTags('chat')
@ApiBearerAuth()
@Controller('conversas')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly gateway: ChatGateway,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Minhas conversas, com contador de não lidas' })
  listar(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<ConversaResumo[]> {
    return this.chat.listarConversas(usuario.id);
  }

  @Post()
  @ApiOperation({ summary: 'Abre a conversa com a contraparte (exige vínculo ativo)' })
  abrir(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodValidationPipe(abrirConversaSchema)) dados: AbrirConversaInput,
  ): Promise<ConversaResumo> {
    return this.chat.abrirConversa(usuario.id, dados.comUsuarioId);
  }

  @Get(':conversaId/mensagens')
  mensagens(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('conversaId') conversaId: string,
    @Query(new ZodValidationPipe(listarMensagensSchema)) consulta: ListarMensagensQuery,
  ): Promise<{ dados: MensagemResumo[]; proximoCursor: string | null }> {
    return this.chat.listarMensagens(usuario.id, conversaId, consulta);
  }

  /**
   * O envio é REST, não WebSocket: é o caminho idempotente e testável. O socket
   * só distribui o que já está gravado.
   */
  @Post(':conversaId/mensagens')
  async enviar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('conversaId') conversaId: string,
    @Body(new ZodValidationPipe(enviarMensagemSchema)) dados: EnviarMensagemInput,
  ): Promise<MensagemResumo> {
    const mensagem = await this.chat.enviar(usuario.id, conversaId, dados);
    const participantes = await this.chat.participantesDe(conversaId);
    await this.gateway.publicarMensagem(mensagem, participantes);
    return mensagem;
  }

  @Post(':conversaId/vista')
  @HttpCode(204)
  async marcarVista(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('conversaId') conversaId: string,
  ): Promise<void> {
    await this.chat.marcarComoVista(usuario.id, conversaId);
    await this.gateway.publicarLeitura(conversaId, usuario.id);
  }
}
