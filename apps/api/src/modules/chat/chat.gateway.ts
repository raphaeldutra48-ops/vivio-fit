import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { EventoChat, type MensagemResumo, type PayloadAccessToken } from '@vivio/contracts';
import type { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

interface SocketAutenticado extends Socket {
  usuarioId?: string;
}

/**
 * Entrega em tempo real.
 *
 * O envio em si continua sendo REST — é o caminho confiável, idempotente e
 * testável. O WebSocket só empurra o que já foi gravado. Assim, cair a conexão
 * nunca perde mensagem: no pior caso o cliente recarrega o histórico.
 */
@WebSocketGateway({ path: '/ws', cors: { origin: true, credentials: true } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() servidor!: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chat: ChatService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Sala pessoal: permite avisar o usuário mesmo com a conversa fechada. */
  private salaDoUsuario = (usuarioId: string) => `usuario:${usuarioId}`;
  private salaDaConversa = (conversaId: string) => `conversa:${conversaId}`;

  async handleConnection(socket: SocketAutenticado): Promise<void> {
    // O token vem no handshake: sem ele, a conexão não vira sessão de ninguém.
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      socket.emit(EventoChat.ERRO, { codigo: 'NAO_AUTENTICADO' });
      socket.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwt.verifyAsync<PayloadAccessToken>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      socket.usuarioId = payload.sub;
      await socket.join(this.salaDoUsuario(payload.sub));
    } catch {
      socket.emit(EventoChat.ERRO, { codigo: 'TOKEN_INVALIDO' });
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: SocketAutenticado): void {
    this.logger.debug(`socket desconectado: ${socket.usuarioId ?? 'anônimo'}`);
  }

  /**
   * Entrar numa conversa revalida a participação no banco. Sem isso, bastaria
   * conhecer o id da conversa para escutar o que não é seu.
   */
  @SubscribeMessage(EventoChat.ENTRAR)
  async entrar(socket: SocketAutenticado, dados: { conversaId: string }): Promise<void> {
    if (!socket.usuarioId || !dados?.conversaId) return;

    if (!(await this.chat.ehParticipante(socket.usuarioId, dados.conversaId))) {
      socket.emit(EventoChat.ERRO, { codigo: 'RECURSO_NAO_ENCONTRADO' });
      return;
    }
    await socket.join(this.salaDaConversa(dados.conversaId));
  }

  @SubscribeMessage(EventoChat.SAIR)
  async sair(socket: SocketAutenticado, dados: { conversaId: string }): Promise<void> {
    if (dados?.conversaId) await socket.leave(this.salaDaConversa(dados.conversaId));
  }

  /** Chamado pelo controller depois de a mensagem estar gravada. */
  async publicarMensagem(mensagem: MensagemResumo, destinatarios: string[]): Promise<void> {
    this.servidor?.to(this.salaDaConversa(mensagem.conversaId)).emit(EventoChat.MENSAGEM_NOVA, mensagem);

    // Também na sala pessoal de quem não está com a conversa aberta — é o que
    // faz o contador de não lidas subir na lista sem recarregar.
    for (const destinatario of destinatarios) {
      if (destinatario === mensagem.autor.id) continue;
      this.servidor?.to(this.salaDoUsuario(destinatario)).emit(EventoChat.MENSAGEM_NOVA, mensagem);
    }
  }

  async publicarLeitura(conversaId: string, usuarioId: string): Promise<void> {
    this.servidor
      ?.to(this.salaDaConversa(conversaId))
      .emit(EventoChat.MENSAGEM_LIDA, { conversaId, usuarioId, em: new Date().toISOString() });
  }
}
