import { Injectable } from '@nestjs/common';
import { Prisma, TipoPergunta } from '@prisma/client';
import type {
  AnamneseResumo,
  AplicarAnamneseInput,
  ModeloAnamneseResumo,
  SalvarModeloAnamneseInput,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';

const MODELO_INCLUDE = { perguntas: { orderBy: { ordem: 'asc' } } } as const;
const ANAMNESE_INCLUDE = {
  respostas: { orderBy: { ordem: 'asc' } },
  profissional: { select: { id: true, nome: true } },
} as const;

type LinhaModelo = Prisma.ModeloAnamneseGetPayload<{ include: typeof MODELO_INCLUDE }>;
type LinhaAnamnese = Prisma.AnamneseGetPayload<{ include: typeof ANAMNESE_INCLUDE }>;

@Injectable()
export class AnamneseService {
  constructor(private readonly prisma: PrismaService) {}

  private paraModelo(m: LinhaModelo): ModeloAnamneseResumo {
    return {
      id: m.id,
      nome: m.nome,
      descricao: m.descricao,
      totalPerguntas: m.perguntas.length,
      atualizadoEm: m.atualizadoEm.toISOString(),
      perguntas: m.perguntas.map((p) => ({
        id: p.id,
        texto: p.texto,
        tipo: p.tipo,
        opcoes: p.opcoes,
        obrigatoria: p.obrigatoria,
        ajuda: p.ajuda,
        ordem: p.ordem,
      })),
    };
  }

  private paraAnamnese(a: LinhaAnamnese): AnamneseResumo {
    return {
      id: a.id,
      nome: a.nomeNoMomento,
      observacao: a.observacao,
      respondidaEm: a.respondidaEm.toISOString(),
      profissional: a.profissional,
      respostas: a.respostas.map((r) => ({
        id: r.id,
        pergunta: r.perguntaNoMomento,
        tipo: r.tipoNoMomento,
        valor: r.valor,
        valores: r.valores,
        ordem: r.ordem,
      })),
    };
  }

  // --- modelos do profissional ---------------------------------------------

  async listarModelos(profissionalId: string): Promise<ModeloAnamneseResumo[]> {
    const modelos = await this.prisma.modeloAnamnese.findMany({
      where: { profissionalId, deletadoEm: null },
      include: MODELO_INCLUDE,
      orderBy: { atualizadoEm: 'desc' },
    });
    return modelos.map((m) => this.paraModelo(m));
  }

  async criarModelo(
    profissionalId: string,
    dados: SalvarModeloAnamneseInput,
  ): Promise<ModeloAnamneseResumo> {
    const criado = await this.prisma.modeloAnamnese.create({
      data: {
        profissionalId,
        nome: dados.nome.trim(),
        descricao: dados.descricao,
        perguntas: { create: this.paraPerguntas(dados) },
      },
      include: MODELO_INCLUDE,
    });
    return this.paraModelo(criado);
  }

  /**
   * Editar troca as perguntas inteiras.
   *
   * Seguro porque a resposta guarda `perguntaNoMomento` e `tipoNoMomento`: uma
   * anamnese já aplicada continua legível mesmo que a pergunta suma daqui.
   */
  async atualizarModelo(
    profissionalId: string,
    id: string,
    dados: SalvarModeloAnamneseInput,
  ): Promise<ModeloAnamneseResumo> {
    await this.exigirModeloProprio(profissionalId, id);

    const atualizado = await this.prisma.$transaction(async (tx) => {
      await tx.perguntaAnamnese.deleteMany({ where: { modeloId: id } });
      return tx.modeloAnamnese.update({
        where: { id },
        data: {
          nome: dados.nome.trim(),
          descricao: dados.descricao ?? null,
          perguntas: { create: this.paraPerguntas(dados) },
        },
        include: MODELO_INCLUDE,
      });
    });

    return this.paraModelo(atualizado);
  }

  async removerModelo(profissionalId: string, id: string): Promise<void> {
    await this.exigirModeloProprio(profissionalId, id);
    // Soft delete: anamneses aplicadas apontam para ele.
    await this.prisma.modeloAnamnese.update({
      where: { id },
      data: { deletadoEm: new Date() },
    });
  }

  // --- anamnese do paciente -------------------------------------------------

  async listar(alunoId: string): Promise<AnamneseResumo[]> {
    const anamneses = await this.prisma.anamnese.findMany({
      where: { alunoId },
      include: ANAMNESE_INCLUDE,
      orderBy: { respondidaEm: 'desc' },
      take: 50,
    });
    return anamneses.map((a) => this.paraAnamnese(a));
  }

  async aplicar(
    alunoId: string,
    profissionalId: string,
    dados: AplicarAnamneseInput,
  ): Promise<AnamneseResumo> {
    const modelo = await this.prisma.modeloAnamnese.findUnique({
      where: { id: dados.modeloId },
      include: MODELO_INCLUDE,
    });
    if (!modelo || modelo.deletadoEm || modelo.profissionalId !== profissionalId) {
      throw ErroDominio.naoEncontrado('Modelo de anamnese');
    }

    const respostaPorPergunta = new Map(dados.respostas.map((r) => [r.perguntaId, r]));

    // Obrigatória sem resposta é erro do formulário, não do banco: avisar qual.
    const faltando = modelo.perguntas.filter((p) => {
      if (!p.obrigatoria) return false;
      const r = respostaPorPergunta.get(p.id);
      if (!r) return true;
      return p.tipo === TipoPergunta.ESCOLHA_MULTIPLA
        ? r.valores.length === 0
        : !r.valor?.trim();
    });
    if (faltando.length > 0) {
      throw ErroDominio.conflito(
        `Responda as perguntas obrigatórias: ${faltando.map((p) => p.texto).join('; ')}`,
      );
    }

    const criada = await this.prisma.anamnese.create({
      data: {
        alunoId,
        profissionalId,
        modeloId: modelo.id,
        nomeNoMomento: modelo.nome,
        observacao: dados.observacao,
        respondidaEm: dados.respondidaEm,
        respostas: {
          create: modelo.perguntas.map((p, ordem) => {
            const r = respostaPorPergunta.get(p.id);
            return {
              perguntaId: p.id,
              perguntaNoMomento: p.texto,
              tipoNoMomento: p.tipo,
              valor: r?.valor?.trim() || null,
              valores: r?.valores ?? [],
              ordem,
            };
          }),
        },
      },
      include: ANAMNESE_INCLUDE,
    });

    return this.paraAnamnese(criada);
  }

  async remover(alunoId: string, profissionalId: string, id: string): Promise<void> {
    const anamnese = await this.prisma.anamnese.findUnique({ where: { id } });
    if (!anamnese || anamnese.alunoId !== alunoId) throw ErroDominio.naoEncontrado('Anamnese');
    if (anamnese.profissionalId !== profissionalId) {
      throw ErroDominio.papelNaoAutorizado('Só quem aplicou a anamnese pode removê-la.');
    }
    await this.prisma.anamnese.delete({ where: { id } });
  }

  // --- auxiliares -----------------------------------------------------------

  private paraPerguntas(dados: SalvarModeloAnamneseInput) {
    return dados.perguntas.map((p, ordem) => ({
      texto: p.texto.trim(),
      tipo: p.tipo as TipoPergunta,
      // Opção só existe em pergunta de escolha; guardar em outro tipo confunde
      // quem lê o dado depois.
      opcoes: p.tipo === 'ESCOLHA_UNICA' || p.tipo === 'ESCOLHA_MULTIPLA' ? p.opcoes : [],
      obrigatoria: p.obrigatoria,
      ajuda: p.ajuda,
      ordem,
    }));
  }

  private async exigirModeloProprio(profissionalId: string, id: string): Promise<void> {
    const modelo = await this.prisma.modeloAnamnese.findUnique({ where: { id } });
    if (!modelo || modelo.deletadoEm || modelo.profissionalId !== profissionalId) {
      throw ErroDominio.naoEncontrado('Modelo de anamnese');
    }
  }
}
