import { Injectable } from '@nestjs/common';
import { EscopoExercicio, Papel, Prisma } from '@prisma/client';
import type {
  AtualizarExercicioInput,
  CriarExercicioInput,
  ExercicioResumo,
  GrupoMuscular,
  ListarExerciciosQuery,
  UrlAssinada,
  UsuarioAutenticado,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';
import { MidiaService } from '../midia/midia.service';

function paraResumo(e: {
  id: string;
  nome: string;
  grupoMuscular: string;
  equipamento: string | null;
  instrucoes: string | null;
  escopo: EscopoExercicio;
  videoChave: string | null;
  criadoPorId: string | null;
}): ExercicioResumo {
  return {
    id: e.id,
    nome: e.nome,
    grupoMuscular: e.grupoMuscular as GrupoMuscular,
    equipamento: e.equipamento,
    instrucoes: e.instrucoes,
    escopo: e.escopo,
    temVideo: e.videoChave !== null,
    criadoPorId: e.criadoPorId,
  };
}

@Injectable()
export class ExerciciosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly midia: MidiaService,
  ) {}

  /** Vincula ao exercício o vídeo já enviado ao storage. */
  async vincularVideo(
    usuario: UsuarioAutenticado,
    id: string,
    chave: string,
  ): Promise<ExercicioResumo> {
    const exercicio = await this.exigirPropriedade(usuario, id);
    if (!chave.startsWith(`exercicios/${usuario.id}/`)) {
      throw ErroDominio.conflito('Chave de arquivo não pertence a você.');
    }

    const atualizado = await this.prisma.exercicio.update({
      where: { id: exercicio.id },
      data: { videoChave: chave },
    });
    return paraResumo(atualizado);
  }

  /** Vídeo nunca é servido por URL pública — só por link assinado curto. */
  async urlDoVideo(usuario: UsuarioAutenticado, id: string): Promise<UrlAssinada> {
    const exercicio = await this.prisma.exercicio.findUnique({ where: { id } });
    if (!exercicio || exercicio.deletadoEm) throw ErroDominio.naoEncontrado('Exercício');
    if (exercicio.escopo === EscopoExercicio.PRIVADO && exercicio.criadoPorId !== usuario.id) {
      throw ErroDominio.naoEncontrado('Exercício');
    }
    if (!exercicio.videoChave) throw ErroDominio.naoEncontrado('Vídeo do exercício');

    return this.midia.urlDeLeitura(exercicio.videoChave);
  }

  /**
   * Lista o que o usuário pode ver: a biblioteca GLOBAL mais os exercícios
   * PRIVADOS que ele mesmo criou. Um personal nunca vê a biblioteca do outro.
   */
  async listar(
    usuario: UsuarioAutenticado,
    consulta: ListarExerciciosQuery,
  ): Promise<ExercicioResumo[]> {
    const filtros: Prisma.ExercicioWhereInput = {
      deletadoEm: null,
      OR: [{ escopo: EscopoExercicio.GLOBAL }, { criadoPorId: usuario.id }],
      ...(consulta.grupoMuscular ? { grupoMuscular: consulta.grupoMuscular } : {}),
      ...(consulta.q
        ? { nome: { contains: consulta.q, mode: Prisma.QueryMode.insensitive } }
        : {}),
    };

    const exercicios = await this.prisma.exercicio.findMany({
      where: filtros,
      orderBy: [{ grupoMuscular: 'asc' }, { nome: 'asc' }],
      take: consulta.limit,
    });
    return exercicios.map(paraResumo);
  }

  async obter(usuario: UsuarioAutenticado, id: string): Promise<ExercicioResumo> {
    const exercicio = await this.prisma.exercicio.findUnique({ where: { id } });
    if (!exercicio || exercicio.deletadoEm) throw ErroDominio.naoEncontrado('Exercício');
    if (exercicio.escopo === EscopoExercicio.PRIVADO && exercicio.criadoPorId !== usuario.id) {
      throw ErroDominio.naoEncontrado('Exercício');
    }
    return paraResumo(exercicio);
  }

  /** Só o admin cria exercício GLOBAL. Profissional cria para a própria biblioteca. */
  async criar(usuario: UsuarioAutenticado, dados: CriarExercicioInput): Promise<ExercicioResumo> {
    const escopo =
      usuario.papel === Papel.ADMIN ? EscopoExercicio.GLOBAL : EscopoExercicio.PRIVADO;

    const criado = await this.prisma.exercicio.create({
      data: {
        nome: dados.nome.trim(),
        grupoMuscular: dados.grupoMuscular,
        equipamento: dados.equipamento,
        instrucoes: dados.instrucoes,
        escopo,
        criadoPorId: usuario.id,
      },
    });
    return paraResumo(criado);
  }

  async atualizar(
    usuario: UsuarioAutenticado,
    id: string,
    dados: AtualizarExercicioInput,
  ): Promise<ExercicioResumo> {
    const exercicio = await this.exigirPropriedade(usuario, id);
    const atualizado = await this.prisma.exercicio.update({
      where: { id: exercicio.id },
      data: dados,
    });
    return paraResumo(atualizado);
  }

  /**
   * Soft delete: o exercício pode estar referenciado em planos antigos, e o
   * histórico do aluno precisa continuar legível.
   */
  async remover(usuario: UsuarioAutenticado, id: string): Promise<void> {
    const exercicio = await this.exigirPropriedade(usuario, id);
    await this.prisma.exercicio.update({
      where: { id: exercicio.id },
      data: { deletadoEm: new Date() },
    });
  }

  private async exigirPropriedade(usuario: UsuarioAutenticado, id: string) {
    const exercicio = await this.prisma.exercicio.findUnique({ where: { id } });
    if (!exercicio || exercicio.deletadoEm) throw ErroDominio.naoEncontrado('Exercício');

    if (exercicio.escopo === EscopoExercicio.GLOBAL) {
      if (usuario.papel !== Papel.ADMIN) {
        throw ErroDominio.papelNaoAutorizado('Exercícios da biblioteca global só o admin edita.');
      }
      return exercicio;
    }

    if (exercicio.criadoPorId !== usuario.id) throw ErroDominio.naoEncontrado('Exercício');
    return exercicio;
  }
}
