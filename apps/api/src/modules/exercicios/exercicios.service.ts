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

interface LinhaExercicio {
  id: string;
  nome: string;
  grupoMuscular: string;
  equipamento: string | null;
  instrucoes: string | null;
  escopo: EscopoExercicio;
  videoChave: string | null;
  criadoPorId: string | null;
  passos?: string[];
  imagemChave?: string | null;
  imagemCredito?: string | null;
  videoCredito?: string | null;
}

function paraResumo(e: LinhaExercicio, imagemUrl: string | null = null): ExercicioResumo {
  return {
    id: e.id,
    nome: e.nome,
    grupoMuscular: e.grupoMuscular as GrupoMuscular,
    equipamento: e.equipamento,
    instrucoes: e.instrucoes,
    passos: e.passos ?? [],
    escopo: e.escopo,
    temVideo: e.videoChave !== null,
    criadoPorId: e.criadoPorId,
    imagemUrl,
    imagemCredito: e.imagemCredito ?? null,
    videoCredito: e.videoCredito ?? null,
  };
}

@Injectable()
export class ExerciciosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly midia: MidiaService,
  ) {}

  /** Resumo com o link assinado da imagem, quando houver. */
  private async comImagem(e: LinhaExercicio): Promise<ExercicioResumo> {
    if (!e.imagemChave) return paraResumo(e);
    const { url } = await this.midia.urlDeLeitura(e.imagemChave);
    return paraResumo(e, url);
  }

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

    // Trocar o vídeo tem de apagar o anterior: são até 100 MB cada, e sem isso
    // regravar a demonstração de um exercício algumas vezes enche o disco com
    // arquivos que ninguém alcança mais.
    // Depois do update, para uma falha aqui não deixar o exercício apontando
    // para um arquivo que já não existe.
    if (exercicio.videoChave && exercicio.videoChave !== chave) {
      await this.midia.remover(exercicio.videoChave).catch(() => undefined);
    }

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
    /*
      A imagem é assinada AQUI, na listagem, e não só no exercício individual —
      diferente do laudo de exame, onde a decisão foi a oposta. O motivo é o
      uso: a biblioteca é navegada olhando, e uma lista de nomes sem figura não
      serve para escolher exercício. Assinar é um HMAC por item, barato.
    */
    return Promise.all(exercicios.map((e) => this.comImagem(e)));
  }

  async obter(usuario: UsuarioAutenticado, id: string): Promise<ExercicioResumo> {
    const exercicio = await this.prisma.exercicio.findUnique({ where: { id } });
    if (!exercicio || exercicio.deletadoEm) throw ErroDominio.naoEncontrado('Exercício');
    if (exercicio.escopo === EscopoExercicio.PRIVADO && exercicio.criadoPorId !== usuario.id) {
      throw ErroDominio.naoEncontrado('Exercício');
    }
    return this.comImagem(exercicio);
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
