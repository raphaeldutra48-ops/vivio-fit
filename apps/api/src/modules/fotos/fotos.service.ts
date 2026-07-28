import { Injectable } from '@nestjs/common';
import { AnguloFoto, Papel, Prisma } from '@prisma/client';
import type { FotoEvolucaoResumo, RegistrarFotoInput, UsuarioAutenticado } from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';
import { MidiaService } from '../midia/midia.service';

@Injectable()
export class FotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly midia: MidiaService,
  ) {}

  /**
   * Além de vínculo e consentimento (garantidos pelos guards), a foto tem uma
   * TERCEIRA trava: a lista `visivelPara`, que o próprio aluno define por foto.
   *
   * A especificação é explícita nisso — foto de evolução é o dado mais íntimo
   * do app, e consentir com o escopo EVOLUCAO não é consentir com cada foto.
   */
  private podeVer(usuario: UsuarioAutenticado, alunoId: string, visivelPara: Papel[]): boolean {
    if (usuario.id === alunoId) return true;
    return visivelPara.includes(usuario.papel);
  }

  async listar(usuario: UsuarioAutenticado, alunoId: string): Promise<FotoEvolucaoResumo[]> {
    const fotos = await this.prisma.fotoEvolucao.findMany({
      where: { alunoId, deletadoEm: null },
      orderBy: { data: 'desc' },
      take: 200,
    });

    const visiveis = fotos.filter((f) => this.podeVer(usuario, alunoId, f.visivelPara));

    return Promise.all(
      visiveis.map(async (f) => {
        const { url, expiraEm } = await this.midia.urlDeLeitura(f.chaveArquivo);
        return {
          id: f.id,
          data: f.data.toISOString().slice(0, 10),
          angulo: f.angulo,
          observacao: f.observacao,
          visivelPara: f.visivelPara,
          url,
          urlExpiraEm: expiraEm,
        };
      }),
    );
  }

  /** Só o próprio aluno envia foto de evolução. */
  async registrar(
    usuario: UsuarioAutenticado,
    alunoId: string,
    dados: RegistrarFotoInput,
  ): Promise<FotoEvolucaoResumo> {
    if (usuario.id !== alunoId) {
      throw ErroDominio.papelNaoAutorizado('Somente o aluno envia as próprias fotos.');
    }
    // A chave é gerada pelo servidor no upload-url e contém o id do dono.
    // Conferir aqui impede registrar a chave de outra pessoa.
    if (!dados.chave.startsWith(`evolucao/${alunoId}/`)) {
      throw ErroDominio.conflito('Chave de arquivo não pertence a este aluno.');
    }

    try {
      const criada = await this.prisma.fotoEvolucao.create({
        data: {
          alunoId,
          data: new Date(dados.data.toISOString().slice(0, 10)),
          chaveArquivo: dados.chave,
          mimeType: dados.mimeType,
          tamanhoBytes: dados.tamanhoBytes,
          angulo: dados.angulo as AnguloFoto,
          observacao: dados.observacao,
          visivelPara: dados.visivelPara as Papel[],
        },
      });

      const { url, expiraEm } = await this.midia.urlDeLeitura(criada.chaveArquivo);
      return {
        id: criada.id,
        data: criada.data.toISOString().slice(0, 10),
        angulo: criada.angulo,
        observacao: criada.observacao,
        visivelPara: criada.visivelPara,
        url,
        urlExpiraEm: expiraEm,
      };
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        throw ErroDominio.conflito('Esta foto já foi registrada.');
      }
      throw erro;
    }
  }

  async atualizarVisibilidade(
    usuario: UsuarioAutenticado,
    fotoId: string,
    visivelPara: string[],
  ): Promise<FotoEvolucaoResumo> {
    const foto = await this.prisma.fotoEvolucao.findUnique({ where: { id: fotoId } });
    if (!foto || foto.deletadoEm || foto.alunoId !== usuario.id) {
      throw ErroDominio.naoEncontrado('Foto');
    }

    const atualizada = await this.prisma.fotoEvolucao.update({
      where: { id: fotoId },
      data: { visivelPara: visivelPara as Papel[] },
    });

    const { url, expiraEm } = await this.midia.urlDeLeitura(atualizada.chaveArquivo);
    return {
      id: atualizada.id,
      data: atualizada.data.toISOString().slice(0, 10),
      angulo: atualizada.angulo,
      observacao: atualizada.observacao,
      visivelPara: atualizada.visivelPara,
      url,
      urlExpiraEm: expiraEm,
    };
  }

  /** Soft delete: o arquivo sai do storage, o registro fica para a auditoria. */
  async remover(usuario: UsuarioAutenticado, fotoId: string): Promise<void> {
    const foto = await this.prisma.fotoEvolucao.findUnique({ where: { id: fotoId } });
    if (!foto || foto.deletadoEm || foto.alunoId !== usuario.id) {
      throw ErroDominio.naoEncontrado('Foto');
    }

    await this.prisma.fotoEvolucao.update({
      where: { id: fotoId },
      data: { deletadoEm: new Date() },
    });
    await this.midia.remover(foto.chaveArquivo).catch(() => undefined);
  }
}
