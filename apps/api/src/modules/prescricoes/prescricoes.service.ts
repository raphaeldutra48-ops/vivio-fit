import { Injectable } from '@nestjs/common';
import {
  EscopoPrescritivel,
  Papel,
  Prisma,
  StatusPrescricao,
  TipoPrescritivel,
} from '@prisma/client';
import {
  ROTULO_TIPO_PRESCRITIVEL,
  podePrescrever,
  type CriarModeloPrescricaoInput,
  type CriarPrescritivelInput,
  type EmitirPrescricaoInput,
  type ListarPrescritiveisQuery,
  type ModeloPrescricaoResumo,
  type MudarStatusPrescricaoInput,
  type PosologiaInput,
  type PrescricaoResumo,
  type PrescritivelResumo,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';

type LinhaPrescritivel = Prisma.ItemPrescritivelGetPayload<Record<string, never>>;

function paraResumoPrescritivel(p: LinhaPrescritivel): PrescritivelResumo {
  return {
    id: p.id,
    nome: p.nome,
    tipo: p.tipo,
    apresentacao: p.apresentacao,
    principioAtivo: p.principioAtivo,
    contraindicacoes: p.contraindicacoes,
    observacao: p.observacao,
    escopo: p.escopo,
    criadoPorId: p.criadoPorId,
  };
}

const num = (v: Prisma.Decimal | null): number | null => (v === null ? null : Number(v));

@Injectable()
export class PrescricoesService {
  constructor(private readonly prisma: PrismaService) {}

  // --- catálogo ------------------------------------------------------------

  async listarPrescritiveis(
    usuario: UsuarioAutenticado,
    consulta: ListarPrescritiveisQuery,
  ): Promise<PrescritivelResumo[]> {
    const itens = await this.prisma.itemPrescritivel.findMany({
      where: {
        deletadoEm: null,
        // Catálogo global mais o que o próprio profissional cadastrou.
        OR: [{ escopo: EscopoPrescritivel.GLOBAL }, { criadoPorId: usuario.id }],
        ...(consulta.tipo ? { tipo: consulta.tipo as TipoPrescritivel } : {}),
        ...(consulta.q
          ? { nome: { contains: consulta.q, mode: Prisma.QueryMode.insensitive } }
          : {}),
      },
      orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
      take: consulta.limit,
    });
    return itens.map(paraResumoPrescritivel);
  }

  async criarPrescritivel(
    usuario: UsuarioAutenticado,
    dados: CriarPrescritivelInput,
  ): Promise<PrescritivelResumo> {
    // Quem não pode prescrever aquele tipo também não cadastra no catálogo.
    this.exigirCompetencia(usuario, dados.tipo);

    const criado = await this.prisma.itemPrescritivel.create({
      data: {
        nome: dados.nome.trim(),
        tipo: dados.tipo as TipoPrescritivel,
        apresentacao: dados.apresentacao,
        principioAtivo: dados.principioAtivo,
        contraindicacoes: dados.contraindicacoes,
        observacao: dados.observacao,
        escopo:
          usuario.papel === Papel.ADMIN ? EscopoPrescritivel.GLOBAL : EscopoPrescritivel.PRIVADO,
        criadoPorId: usuario.id,
      },
    });
    return paraResumoPrescritivel(criado);
  }

  async removerPrescritivel(usuario: UsuarioAutenticado, id: string): Promise<void> {
    const item = await this.prisma.itemPrescritivel.findUnique({ where: { id } });
    if (!item || item.deletadoEm) throw ErroDominio.naoEncontrado('Item');

    if (item.escopo === EscopoPrescritivel.GLOBAL && usuario.papel !== Papel.ADMIN) {
      throw ErroDominio.papelNaoAutorizado('Itens do catálogo global só o admin edita.');
    }
    if (item.escopo === EscopoPrescritivel.PRIVADO && item.criadoPorId !== usuario.id) {
      throw ErroDominio.naoEncontrado('Item');
    }

    // Soft delete: o item pode estar em prescrições antigas, que precisam
    // continuar legíveis.
    await this.prisma.itemPrescritivel.update({
      where: { id },
      data: { deletadoEm: new Date() },
    });
  }

  // --- modelos -------------------------------------------------------------

  async listarModelos(prescritorId: string): Promise<ModeloPrescricaoResumo[]> {
    const modelos = await this.prisma.modeloPrescricao.findMany({
      where: { prescritorId, deletadoEm: null },
      include: {
        itens: { orderBy: { ordem: 'asc' }, include: { prescritivel: true } },
      },
      orderBy: { atualizadoEm: 'desc' },
    });

    return modelos.map((m) => ({
      id: m.id,
      nome: m.nome,
      descricao: m.descricao,
      orientacoes: m.orientacoes,
      totalItens: m.itens.length,
      itens: m.itens.map((i) => ({
        id: i.id,
        prescritivelId: i.prescritivelId,
        dose: num(i.dose) ?? undefined,
        unidade: i.unidade ?? undefined,
        frequencia: i.frequencia ?? undefined,
        horarios: i.horarios,
        duracaoDias: i.duracaoDias ?? undefined,
        via: i.via ?? undefined,
        observacao: i.observacao ?? undefined,
        prescritivel: paraResumoPrescritivel(i.prescritivel),
      })),
    }));
  }

  async criarModelo(
    usuario: UsuarioAutenticado,
    dados: CriarModeloPrescricaoInput,
  ): Promise<ModeloPrescricaoResumo> {
    await this.exigirItensPermitidos(usuario, dados.itens);

    const criado = await this.prisma.modeloPrescricao.create({
      data: {
        prescritorId: usuario.id,
        nome: dados.nome.trim(),
        descricao: dados.descricao,
        orientacoes: dados.orientacoes,
        itens: {
          create: dados.itens.map((i, ordem) => ({
            prescritivelId: i.prescritivelId,
            dose: i.dose,
            unidade: i.unidade,
            frequencia: i.frequencia,
            horarios: i.horarios,
            duracaoDias: i.duracaoDias,
            via: i.via,
            observacao: i.observacao,
            ordem,
          })),
        },
      },
    });

    const lista = await this.listarModelos(usuario.id);
    return lista.find((m) => m.id === criado.id)!;
  }

  async removerModelo(prescritorId: string, id: string): Promise<void> {
    const modelo = await this.prisma.modeloPrescricao.findUnique({ where: { id } });
    if (!modelo || modelo.deletadoEm || modelo.prescritorId !== prescritorId) {
      throw ErroDominio.naoEncontrado('Modelo de prescrição');
    }
    await this.prisma.modeloPrescricao.update({
      where: { id },
      data: { deletadoEm: new Date() },
    });
  }

  // --- prescrição ao paciente ----------------------------------------------

  async listar(alunoId: string): Promise<PrescricaoResumo[]> {
    const prescricoes = await this.prisma.prescricao.findMany({
      where: { alunoId },
      include: {
        itens: { orderBy: { ordem: 'asc' }, include: { prescritivel: true } },
        prescritor: { select: { id: true, nome: true, papel: true } },
      },
      orderBy: [{ data: 'desc' }, { versao: 'desc' }],
      take: 60,
    });
    return prescricoes.map((p) => this.paraResumo(p));
  }

  async emitir(
    alunoId: string,
    usuario: UsuarioAutenticado,
    dados: EmitirPrescricaoInput,
  ): Promise<PrescricaoResumo> {
    const prescritiveis = await this.exigirItensPermitidos(usuario, dados.itens);

    const criada = await this.prisma.prescricao.create({
      data: {
        alunoId,
        prescritorId: usuario.id,
        data: new Date(dados.data.toISOString().slice(0, 10)),
        validaAte: dados.validaAte
          ? new Date(dados.validaAte.toISOString().slice(0, 10))
          : undefined,
        orientacoes: dados.orientacoes,
        itens: {
          create: dados.itens.map((i, ordem) => ({
            prescritivelId: i.prescritivelId,
            // Congelado agora: renomear o catálogo depois não altera o que foi prescrito.
            nomeNoMomento: prescritiveis.get(i.prescritivelId)!.nome,
            dose: i.dose,
            unidade: i.unidade,
            frequencia: i.frequencia,
            horarios: i.horarios,
            duracaoDias: i.duracaoDias,
            via: i.via,
            observacao: i.observacao,
            ordem,
          })),
        },
      },
      include: {
        itens: { orderBy: { ordem: 'asc' }, include: { prescritivel: true } },
        prescritor: { select: { id: true, nome: true, papel: true } },
      },
    });

    return this.paraResumo(criada);
  }

  /**
   * Mudar a conduta cria uma VERSÃO NOVA e marca a anterior como SUBSTITUIDA.
   *
   * Prescrição é registro clínico: editar no lugar apagaria o que estava valendo
   * quando o paciente tomou o que tomou.
   */
  async substituir(
    alunoId: string,
    usuario: UsuarioAutenticado,
    prescricaoId: string,
    dados: EmitirPrescricaoInput,
  ): Promise<PrescricaoResumo> {
    const anterior = await this.prisma.prescricao.findUnique({ where: { id: prescricaoId } });
    if (!anterior || anterior.alunoId !== alunoId) {
      throw ErroDominio.naoEncontrado('Prescrição');
    }
    if (anterior.prescritorId !== usuario.id) {
      throw ErroDominio.papelNaoAutorizado(
        'Só quem emitiu a prescrição pode substituí-la. Emita uma nova em seu nome.',
      );
    }

    const prescritiveis = await this.exigirItensPermitidos(usuario, dados.itens);

    const nova = await this.prisma.$transaction(async (tx) => {
      await tx.prescricao.update({
        where: { id: prescricaoId },
        data: { status: StatusPrescricao.SUBSTITUIDA },
      });

      return tx.prescricao.create({
        data: {
          alunoId,
          prescritorId: usuario.id,
          data: new Date(dados.data.toISOString().slice(0, 10)),
          validaAte: dados.validaAte
            ? new Date(dados.validaAte.toISOString().slice(0, 10))
            : undefined,
          orientacoes: dados.orientacoes,
          versao: anterior.versao + 1,
          raizId: anterior.raizId ?? anterior.id,
          itens: {
            create: dados.itens.map((i, ordem) => ({
              prescritivelId: i.prescritivelId,
              nomeNoMomento: prescritiveis.get(i.prescritivelId)!.nome,
              dose: i.dose,
              unidade: i.unidade,
              frequencia: i.frequencia,
              horarios: i.horarios,
              duracaoDias: i.duracaoDias,
              via: i.via,
              observacao: i.observacao,
              ordem,
            })),
          },
        },
        include: {
          itens: { orderBy: { ordem: 'asc' }, include: { prescritivel: true } },
          prescritor: { select: { id: true, nome: true, papel: true } },
        },
      });
    });

    return this.paraResumo(nova);
  }

  async mudarStatus(
    alunoId: string,
    usuario: UsuarioAutenticado,
    prescricaoId: string,
    dados: MudarStatusPrescricaoInput,
  ): Promise<PrescricaoResumo> {
    const atual = await this.prisma.prescricao.findUnique({ where: { id: prescricaoId } });
    if (!atual || atual.alunoId !== alunoId) throw ErroDominio.naoEncontrado('Prescrição');
    if (atual.prescritorId !== usuario.id) {
      throw ErroDominio.papelNaoAutorizado('Só quem emitiu pode alterar o status.');
    }
    if (atual.status === StatusPrescricao.SUBSTITUIDA) {
      throw ErroDominio.conflito('Prescrição já substituída por uma versão mais nova.');
    }

    const atualizada = await this.prisma.prescricao.update({
      where: { id: prescricaoId },
      data: {
        status: dados.status as StatusPrescricao,
        ...(dados.status === 'ENCERRADA'
          ? { encerradaEm: new Date(), motivoEncerramento: dados.motivo }
          : {}),
      },
      include: {
        itens: { orderBy: { ordem: 'asc' }, include: { prescritivel: true } },
        prescritor: { select: { id: true, nome: true, papel: true } },
      },
    });

    return this.paraResumo(atualizada);
  }

  // --- auxiliares ----------------------------------------------------------

  private exigirCompetencia(usuario: UsuarioAutenticado, tipo: string): void {
    if (usuario.papel === Papel.ADMIN) return;
    if (!podePrescrever(usuario.papel, tipo as never)) {
      throw ErroDominio.papelNaoAutorizado(
        `${ROTULO_TIPO_PRESCRITIVEL[tipo as never]} é privativo de outra categoria profissional.`,
      );
    }
  }

  /** Valida existência, acesso e competência de todos os itens de uma só vez. */
  private async exigirItensPermitidos(
    usuario: UsuarioAutenticado,
    itens: PosologiaInput[],
  ): Promise<Map<string, LinhaPrescritivel>> {
    const ids = [...new Set(itens.map((i) => i.prescritivelId))];
    const encontrados = await this.prisma.itemPrescritivel.findMany({
      where: {
        id: { in: ids },
        deletadoEm: null,
        OR: [{ escopo: EscopoPrescritivel.GLOBAL }, { criadoPorId: usuario.id }],
      },
    });

    if (encontrados.length !== ids.length) {
      const achados = new Set(encontrados.map((e) => e.id));
      throw ErroDominio.naoEncontrado(
        `Item prescritível (${ids.filter((id) => !achados.has(id)).join(', ')})`,
      );
    }

    for (const item of encontrados) this.exigirCompetencia(usuario, item.tipo);

    return new Map(encontrados.map((e) => [e.id, e]));
  }

  private paraResumo(
    p: Prisma.PrescricaoGetPayload<{
      include: {
        itens: { include: { prescritivel: true } };
        prescritor: { select: { id: true; nome: true; papel: true } };
      };
    }>,
  ): PrescricaoResumo {
    return {
      id: p.id,
      data: p.data.toISOString().slice(0, 10),
      validaAte: p.validaAte?.toISOString().slice(0, 10) ?? null,
      orientacoes: p.orientacoes,
      versao: p.versao,
      status: p.status,
      motivoEncerramento: p.motivoEncerramento,
      prescritor: p.prescritor,
      itens: p.itens.map((i) => ({
        id: i.id,
        prescritivelId: i.prescritivelId,
        nome: i.nomeNoMomento,
        tipo: i.prescritivel.tipo,
        dose: num(i.dose),
        unidade: i.unidade,
        frequencia: i.frequencia,
        horarios: i.horarios,
        duracaoDias: i.duracaoDias,
        via: i.via,
        observacao: i.observacao,
        apresentacao: i.prescritivel.apresentacao,
      })),
    };
  }
}
