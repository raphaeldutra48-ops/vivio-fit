import { Injectable } from '@nestjs/common';
import { Prisma, StatusVinculo, TipoMaterial } from '@prisma/client';
import type {
  CriarMaterialInput,
  MaterialDoAluno,
  MaterialResumo,
  UrlAssinada,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';
import { MidiaService } from '../midia/midia.service';

const INCLUDE = {
  compartilhamentos: {
    include: { aluno: { select: { id: true, nome: true } } },
    orderBy: { compartilhadoEm: 'desc' },
  },
} as const;

type LinhaMaterial = Prisma.MaterialGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class MateriaisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly midia: MidiaService,
  ) {}

  private paraResumo(m: LinhaMaterial): MaterialResumo {
    return {
      id: m.id,
      titulo: m.titulo,
      descricao: m.descricao,
      tipo: m.tipo,
      nomeArquivo: m.nomeArquivo,
      mimeType: m.mimeType,
      tamanhoBytes: m.tamanhoBytes,
      url: m.url,
      etiquetas: m.etiquetas,
      criadoEm: m.criadoEm.toISOString(),
      compartilhadoCom: m.compartilhamentos.map((c) => ({
        alunoId: c.alunoId,
        nome: c.aluno.nome,
        vistoEm: c.vistoEm?.toISOString() ?? null,
      })),
    };
  }

  // --- biblioteca do profissional -------------------------------------------

  async listar(autorId: string, etiqueta?: string): Promise<MaterialResumo[]> {
    const materiais = await this.prisma.material.findMany({
      where: {
        autorId,
        deletadoEm: null,
        ...(etiqueta ? { etiquetas: { has: etiqueta } } : {}),
      },
      include: INCLUDE,
      orderBy: { criadoEm: 'desc' },
      take: 200,
    });
    return materiais.map((m) => this.paraResumo(m));
  }

  async criar(autorId: string, dados: CriarMaterialInput): Promise<MaterialResumo> {
    const criado = await this.prisma.material.create({
      data: {
        autorId,
        titulo: dados.titulo.trim(),
        descricao: dados.descricao,
        tipo: dados.tipo as TipoMaterial,
        chave: dados.tipo === 'ARQUIVO' ? dados.chave : null,
        nomeArquivo: dados.tipo === 'ARQUIVO' ? dados.nomeArquivo : null,
        mimeType: dados.tipo === 'ARQUIVO' ? dados.mimeType : null,
        tamanhoBytes: dados.tipo === 'ARQUIVO' ? dados.tamanhoBytes : null,
        url: dados.tipo === 'LINK' ? dados.url : null,
        etiquetas: dados.etiquetas.map((e) => e.trim().toLowerCase()),
      },
      include: INCLUDE,
    });
    return this.paraResumo(criado);
  }

  async remover(autorId: string, id: string): Promise<void> {
    const material = await this.exigirProprio(autorId, id);

    // O arquivo sai do armazenamento junto: material apagado que continua
    // baixável por link assinado antigo seria só aparência de exclusão.
    if (material.chave) {
      await this.midia.remover(material.chave).catch(() => undefined);
    }
    await this.prisma.material.update({ where: { id }, data: { deletadoEm: new Date() } });
  }

  /**
   * Compartilha com alunos da carteira.
   *
   * Só vale para quem tem vínculo ATIVO: material é conteúdo do profissional,
   * mas mandar arquivo para quem não é seu aluno seria abuso da lista.
   */
  async compartilhar(
    autorId: string,
    id: string,
    alunoIds: string[],
  ): Promise<MaterialResumo> {
    await this.exigirProprio(autorId, id);

    const vinculados = await this.prisma.vinculo.findMany({
      where: { profissionalId: autorId, alunoId: { in: alunoIds }, status: StatusVinculo.ATIVO },
      select: { alunoId: true },
    });
    if (vinculados.length !== new Set(alunoIds).size) {
      throw ErroDominio.papelNaoAutorizado(
        'Só é possível compartilhar com alunos que têm vínculo ativo com você.',
      );
    }

    await this.prisma.materialCompartilhado.createMany({
      data: vinculados.map((v) => ({ materialId: id, alunoId: v.alunoId })),
      // Recompartilhar não deve apagar o "visto em" nem duplicar.
      skipDuplicates: true,
    });

    const atualizado = await this.prisma.material.findUniqueOrThrow({
      where: { id },
      include: INCLUDE,
    });
    return this.paraResumo(atualizado);
  }

  async descompartilhar(autorId: string, id: string, alunoId: string): Promise<void> {
    await this.exigirProprio(autorId, id);
    await this.prisma.materialCompartilhado.deleteMany({ where: { materialId: id, alunoId } });
  }

  // --- visão do aluno -------------------------------------------------------

  async meus(alunoId: string): Promise<MaterialDoAluno[]> {
    const recebidos = await this.prisma.materialCompartilhado.findMany({
      where: { alunoId, material: { deletadoEm: null } },
      include: {
        material: { include: { autor: { select: { id: true, nome: true } } } },
      },
      orderBy: { compartilhadoEm: 'desc' },
      take: 200,
    });

    return recebidos.map((c) => ({
      id: c.material.id,
      titulo: c.material.titulo,
      descricao: c.material.descricao,
      tipo: c.material.tipo,
      nomeArquivo: c.material.nomeArquivo,
      mimeType: c.material.mimeType,
      tamanhoBytes: c.material.tamanhoBytes,
      url: c.material.url,
      etiquetas: c.material.etiquetas,
      compartilhadoEm: c.compartilhadoEm.toISOString(),
      vistoEm: c.vistoEm?.toISOString() ?? null,
      autor: c.material.autor,
    }));
  }

  /**
   * Link de leitura do arquivo.
   *
   * Autor e aluno com quem foi compartilhado — mais ninguém. O link é assinado
   * e curto: o arquivo nunca fica público.
   */
  async abrir(usuarioId: string, id: string): Promise<UrlAssinada> {
    const material = await this.prisma.material.findUnique({
      where: { id },
      include: { compartilhamentos: { where: { alunoId: usuarioId } } },
    });

    if (!material || material.deletadoEm) throw ErroDominio.naoEncontrado('Material');

    const ehAutor = material.autorId === usuarioId;
    const compartilhamento = material.compartilhamentos[0];
    // 404 e não 403: quem não recebeu não precisa saber que o material existe.
    if (!ehAutor && !compartilhamento) throw ErroDominio.naoEncontrado('Material');

    if (material.tipo !== TipoMaterial.ARQUIVO || !material.chave) {
      throw ErroDominio.conflito('Este material é um link, não um arquivo.');
    }

    // Primeira abertura marca o recebimento — o profissional vê se chegou.
    if (compartilhamento && !compartilhamento.vistoEm) {
      await this.prisma.materialCompartilhado.update({
        where: { id: compartilhamento.id },
        data: { vistoEm: new Date() },
      });
    }

    return this.midia.urlDeLeitura(material.chave);
  }

  private async exigirProprio(autorId: string, id: string) {
    const material = await this.prisma.material.findUnique({ where: { id } });
    if (!material || material.deletadoEm || material.autorId !== autorId) {
      throw ErroDominio.naoEncontrado('Material');
    }
    return material;
  }
}
