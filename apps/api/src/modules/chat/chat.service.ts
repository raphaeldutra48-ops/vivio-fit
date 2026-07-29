import { Injectable } from '@nestjs/common';
import { Papel, Prisma, StatusVinculo, TipoConversa } from '@prisma/client';
import type {
  ConversaResumo,
  EnviarMensagemInput,
  ListarMensagensQuery,
  MensagemResumo,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';

const PAPEIS_PROFISSIONAIS: Papel[] = [Papel.PERSONAL, Papel.NUTRICIONISTA, Papel.MEDICO];

type MensagemComAutor = Prisma.MensagemGetPayload<{
  include: { autor: { select: { id: true; nome: true; papel: true } } };
}>;

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Abre (ou reaproveita) a conversa entre um aluno e um profissional.
   *
   * O direito de conversar vem do VÍNCULO ATIVO, não de consentimento: aceitar
   * um profissional já é aceitar falar com ele. O consentimento MENSAGENS existe
   * para a conversa da equipe clínica, onde o aluno não participa (Fase 3).
   */
  async abrirConversa(solicitanteId: string, comUsuarioId: string): Promise<ConversaResumo> {
    if (solicitanteId === comUsuarioId) {
      throw ErroDominio.conflito('Não dá para conversar consigo mesmo.');
    }

    const [solicitante, outro] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: solicitanteId }, select: { id: true, papel: true } }),
      this.prisma.user.findUnique({ where: { id: comUsuarioId }, select: { id: true, papel: true } }),
    ]);
    if (!solicitante || !outro) throw ErroDominio.naoEncontrado('Usuário');

    let alunoId: string;
    let profissionalId: string;
    if (solicitante.papel === Papel.ALUNO && PAPEIS_PROFISSIONAIS.includes(outro.papel)) {
      alunoId = solicitante.id;
      profissionalId = outro.id;
    } else if (PAPEIS_PROFISSIONAIS.includes(solicitante.papel) && outro.papel === Papel.ALUNO) {
      alunoId = outro.id;
      profissionalId = solicitante.id;
    } else {
      throw ErroDominio.papelNaoAutorizado('Esta conversa só existe entre aluno e profissional.');
    }

    const vinculo = await this.prisma.vinculo.findUnique({
      where: { alunoId_profissionalId: { alunoId, profissionalId } },
    });
    if (!vinculo || vinculo.status !== StatusVinculo.ATIVO) throw ErroDominio.vinculoAusente();

    const existente = await this.prisma.conversa.findFirst({
      where: {
        alunoId,
        tipo: TipoConversa.ALUNO_PROFISSIONAL,
        participantes: { some: { userId: profissionalId } },
      },
    });

    const conversa =
      existente ??
      (await this.prisma.conversa.create({
        data: {
          tipo: TipoConversa.ALUNO_PROFISSIONAL,
          alunoId,
          participantes: { create: [{ userId: alunoId }, { userId: profissionalId }] },
        },
      }));

    return this.resumoDaConversa(conversa.id, solicitanteId);
  }

  async listarConversas(usuarioId: string): Promise<ConversaResumo[]> {
    const participacoes = await this.prisma.participanteConversa.findMany({
      where: { userId: usuarioId, saiuEm: null },
      select: { conversaId: true },
    });
    const resumos = await Promise.all(
      participacoes.map((p) => this.resumoDaConversa(p.conversaId, usuarioId)),
    );
    // Conversa com movimento primeiro; sem mensagem nenhuma vai para o fim.
    return resumos.sort((a, b) => {
      const ta = a.ultimaMensagem ? Date.parse(a.ultimaMensagem.enviadaEm) : 0;
      const tb = b.ultimaMensagem ? Date.parse(b.ultimaMensagem.enviadaEm) : 0;
      return tb - ta;
    });
  }

  async listarMensagens(
    usuarioId: string,
    conversaId: string,
    consulta: ListarMensagensQuery,
  ): Promise<{ dados: MensagemResumo[]; proximoCursor: string | null }> {
    await this.exigirParticipante(usuarioId, conversaId);

    const mensagens = await this.prisma.mensagem.findMany({
      where: { conversaId },
      include: { autor: { select: { id: true, nome: true, papel: true } } },
      orderBy: { enviadaEm: 'desc' },
      take: consulta.limit + 1,
      ...(consulta.cursor ? { cursor: { id: consulta.cursor }, skip: 1 } : {}),
    });

    const temMais = mensagens.length > consulta.limit;
    const pagina = temMais ? mensagens.slice(0, consulta.limit) : mensagens;

    return {
      dados: pagina.map((m) => this.paraResumo(m, usuarioId)),
      proximoCursor: temMais ? (pagina[pagina.length - 1]?.id ?? null) : null,
    };
  }

  /**
   * Envia. Idempotente por `clienteUuid`: a mesma mensagem reenviada (toque
   * duplo, rede oscilando, fila offline) não vira duas bolhas na tela.
   */
  async enviar(
    autorId: string,
    conversaId: string,
    dados: EnviarMensagemInput,
  ): Promise<MensagemResumo> {
    await this.exigirParticipante(autorId, conversaId);

    const jaExiste = await this.prisma.mensagem.findUnique({
      where: { clienteUuid: dados.clienteUuid },
      include: { autor: { select: { id: true, nome: true, papel: true } } },
    });
    if (jaExiste) return this.paraResumo(jaExiste, autorId);

    try {
      const criada = await this.prisma.mensagem.create({
        data: {
          conversaId,
          autorId,
          corpo: dados.corpo.trim(),
          clienteUuid: dados.clienteUuid,
        },
        include: { autor: { select: { id: true, nome: true, papel: true } } },
      });
      await this.prisma.conversa.update({
        where: { id: conversaId },
        data: { atualizadoEm: new Date() },
      });
      return this.paraResumo(criada, autorId);
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        const existente = await this.prisma.mensagem.findUnique({
          where: { clienteUuid: dados.clienteUuid },
          include: { autor: { select: { id: true, nome: true, papel: true } } },
        });
        if (existente) return this.paraResumo(existente, autorId);
      }
      throw erro;
    }
  }

  /** Marca "vi até agora". O contador de não lidas é derivado deste carimbo. */
  async marcarComoVista(usuarioId: string, conversaId: string): Promise<void> {
    await this.exigirParticipante(usuarioId, conversaId);
    await this.prisma.participanteConversa.update({
      where: { conversaId_userId: { conversaId, userId: usuarioId } },
      data: { vistoEm: new Date() },
    });
  }

  async participantesDe(conversaId: string): Promise<string[]> {
    const participantes = await this.prisma.participanteConversa.findMany({
      where: { conversaId, saiuEm: null },
      select: { userId: true },
    });
    return participantes.map((p) => p.userId);
  }

  async ehParticipante(usuarioId: string, conversaId: string): Promise<boolean> {
    const participacao = await this.prisma.participanteConversa.findUnique({
      where: { conversaId_userId: { conversaId, userId: usuarioId } },
    });
    return participacao !== null && participacao.saiuEm === null;
  }

  // --- auxiliares ---------------------------------------------------------

  private async exigirParticipante(usuarioId: string, conversaId: string): Promise<void> {
    // 404 e não 403: quem não participa não precisa saber que a conversa existe.
    if (!(await this.ehParticipante(usuarioId, conversaId))) {
      throw ErroDominio.naoEncontrado('Conversa');
    }
  }

  private async resumoDaConversa(conversaId: string, usuarioId: string): Promise<ConversaResumo> {
    const conversa = await this.prisma.conversa.findUniqueOrThrow({
      where: { id: conversaId },
      include: {
        participantes: {
          include: { user: { select: { id: true, nome: true, papel: true, avatarUrl: true } } },
        },
        mensagens: { orderBy: { enviadaEm: 'desc' }, take: 1 },
      },
    });

    const minhaParticipacao = conversa.participantes.find((p) => p.userId === usuarioId);
    const outro = conversa.participantes.find((p) => p.userId !== usuarioId);

    const naoLidas = await this.prisma.mensagem.count({
      where: {
        conversaId,
        NOT: { autorId: usuarioId },
        ...(minhaParticipacao?.vistoEm ? { enviadaEm: { gt: minhaParticipacao.vistoEm } } : {}),
      },
    });

    const ultima = conversa.mensagens[0];

    return {
      id: conversa.id,
      tipo: conversa.tipo,
      alunoId: conversa.alunoId,
      contraparte: outro
        ? {
            id: outro.user.id,
            nome: outro.user.nome,
            papel: outro.user.papel,
            avatarUrl: outro.user.avatarUrl,
          }
        : null,
      ultimaMensagem: ultima
        ? {
            corpo: ultima.removidaEm ? null : ultima.corpo,
            enviadaEm: ultima.enviadaEm.toISOString(),
            autorId: ultima.autorId,
          }
        : null,
      naoLidas,
    };
  }

  private paraResumo(m: MensagemComAutor, usuarioId: string): MensagemResumo {
    return {
      id: m.id,
      clienteUuid: m.clienteUuid,
      conversaId: m.conversaId,
      tipo: m.tipo,
      corpo: m.removidaEm ? null : m.corpo,
      enviadaEm: m.enviadaEm.toISOString(),
      removidaEm: m.removidaEm?.toISOString() ?? null,
      autor: m.autor,
      minha: m.autorId === usuarioId,
    };
  }
}
