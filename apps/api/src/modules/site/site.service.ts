import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  SLUGS_RESERVADOS,
  type EnviarPedidoInput,
  type PaginaPublica,
  type PedidoResumo,
  type PerfilPublicoResumo,
  type SalvarPerfilPublicoInput,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';

@Injectable()
export class SiteService {
  constructor(private readonly prisma: PrismaService) {}

  private paraResumo(
    p: Prisma.PerfilPublicoGetPayload<{ include: { pedidos: true } }>,
  ): PerfilPublicoResumo {
    return {
      id: p.id,
      slug: p.slug,
      titulo: p.titulo,
      apresentacao: p.apresentacao,
      cidade: p.cidade,
      uf: p.uf,
      atendeOnline: p.atendeOnline,
      atendePresencial: p.atendePresencial,
      whatsapp: p.whatsapp,
      instagram: p.instagram,
      publicado: p.publicado,
      pedidosPendentes: p.pedidos.filter((x) => !x.atendidoEm).length,
    };
  }

  async meu(profissionalId: string): Promise<PerfilPublicoResumo | null> {
    const perfil = await this.prisma.perfilPublico.findUnique({
      where: { profissionalId },
      include: { pedidos: true },
    });
    return perfil ? this.paraResumo(perfil) : null;
  }

  /**
   * Cria ou atualiza a página.
   *
   * Publicar exige registro verificado: uma página dizendo "médico" sem
   * verificação seria a plataforma emprestando credibilidade a quem não
   * comprovou nada. Salvar como rascunho é livre.
   */
  async salvar(
    profissionalId: string,
    dados: SalvarPerfilPublicoInput,
  ): Promise<PerfilPublicoResumo> {
    const slug = dados.slug.toLowerCase();
    if (SLUGS_RESERVADOS.includes(slug)) {
      throw ErroDominio.conflito('Este endereço é reservado. Escolha outro.');
    }

    if (dados.publicado) {
      const perfil = await this.prisma.perfilProfissional.findUnique({
        where: { userId: profissionalId },
        select: { verificadoEm: true },
      });
      if (!perfil?.verificadoEm) {
        throw ErroDominio.conflito(
          'Só é possível publicar depois que seu registro no conselho for verificado. ' +
            'Você pode salvar como rascunho enquanto isso.',
        );
      }
    }

    const dadosComuns = {
      slug,
      titulo: dados.titulo.trim(),
      apresentacao: dados.apresentacao ?? null,
      cidade: dados.cidade ?? null,
      uf: dados.uf?.toUpperCase() ?? null,
      atendeOnline: dados.atendeOnline,
      atendePresencial: dados.atendePresencial,
      whatsapp: dados.whatsapp ?? null,
      instagram: dados.instagram?.replace(/^@/, '') ?? null,
      publicado: dados.publicado,
    };

    try {
      const salvo = await this.prisma.perfilPublico.upsert({
        where: { profissionalId },
        create: { profissionalId, ...dadosComuns },
        update: dadosComuns,
        include: { pedidos: true },
      });
      return this.paraResumo(salvo);
    } catch (erro) {
      if (
        erro instanceof Prisma.PrismaClientKnownRequestError &&
        erro.code === 'P2002'
      ) {
        throw ErroDominio.conflito('Este endereço já está em uso por outro profissional.');
      }
      throw erro;
    }
  }

  // --- página pública -------------------------------------------------------

  /**
   * O que qualquer pessoa vê. Sem e-mail, sem id, sem nada que não foi
   * escolhido para publicação — e só se `publicado` e verificado.
   */
  async porSlug(slug: string): Promise<PaginaPublica> {
    const perfil = await this.prisma.perfilPublico.findUnique({
      where: { slug: slug.toLowerCase() },
      include: {
        profissional: {
          select: {
            nome: true,
            papel: true,
            deletadoEm: true,
            perfilProfissional: {
              select: {
                registroConselho: true,
                ufRegistro: true,
                especialidades: true,
                verificadoEm: true,
              },
            },
          },
        },
      },
    });

    const dados = perfil?.profissional.perfilProfissional;
    // Despublicado, não verificado ou conta removida: 404, sem explicar qual.
    if (
      !perfil ||
      !perfil.publicado ||
      !dados?.verificadoEm ||
      perfil.profissional.deletadoEm
    ) {
      throw ErroDominio.naoEncontrado('Página');
    }

    return {
      slug: perfil.slug,
      titulo: perfil.titulo,
      apresentacao: perfil.apresentacao,
      cidade: perfil.cidade,
      uf: perfil.uf,
      atendeOnline: perfil.atendeOnline,
      atendePresencial: perfil.atendePresencial,
      whatsapp: perfil.whatsapp,
      instagram: perfil.instagram,
      profissional: {
        nome: perfil.profissional.nome,
        papel: perfil.profissional.papel,
        registroConselho: dados.registroConselho,
        ufRegistro: dados.ufRegistro,
        especialidades: dados.especialidades,
      },
    };
  }

  /** Formulário da página pública. Rota aberta — qualquer um envia. */
  async enviarPedido(slug: string, dados: EnviarPedidoInput): Promise<void> {
    // Reusa a checagem de publicação: página fora do ar não recebe pedido.
    await this.porSlug(slug);
    const perfil = await this.prisma.perfilPublico.findUniqueOrThrow({
      where: { slug: slug.toLowerCase() },
      select: { id: true },
    });

    await this.prisma.pedidoDeContato.create({
      data: {
        perfilId: perfil.id,
        nome: dados.nome.trim(),
        email: dados.email.toLowerCase().trim(),
        telefone: dados.telefone,
        mensagem: dados.mensagem,
      },
    });
  }

  // --- pedidos recebidos ----------------------------------------------------

  async listarPedidos(profissionalId: string): Promise<PedidoResumo[]> {
    const pedidos = await this.prisma.pedidoDeContato.findMany({
      where: { perfil: { profissionalId } },
      orderBy: { criadoEm: 'desc' },
      take: 200,
    });

    return pedidos.map((p) => ({
      id: p.id,
      nome: p.nome,
      email: p.email,
      telefone: p.telefone,
      mensagem: p.mensagem,
      atendidoEm: p.atendidoEm?.toISOString() ?? null,
      criadoEm: p.criadoEm.toISOString(),
    }));
  }

  async marcarAtendido(profissionalId: string, id: string): Promise<void> {
    const pedido = await this.prisma.pedidoDeContato.findFirst({
      where: { id, perfil: { profissionalId } },
    });
    if (!pedido) throw ErroDominio.naoEncontrado('Pedido de contato');

    await this.prisma.pedidoDeContato.update({
      where: { id },
      data: { atendidoEm: pedido.atendidoEm ? null : new Date() },
    });
  }
}
