import { Injectable } from '@nestjs/common';
import { EscopoExercicio, Papel, Prisma, StatusVinculo } from '@prisma/client';
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
   * Links assinados da demonstração de vários exercícios de uma vez.
   *
   * Existe por causa da tela de execução: o plano de treino não traz
   * `imagemUrl` de propósito — assinatura vale poucos minutos e o plano fica
   * em cache offline, então o link chegaria morto. Mas quem está treinando
   * precisa **ver o movimento na hora**, e pedir uma assinatura por exercício
   * seriam seis idas à rede no meio da academia.
   *
   * Aqui é uma só, no começo do treino, para os exercícios daquela sessão.
   * Exercício sem mídia simplesmente não aparece no mapa — a tela trata a
   * ausência, que é o caso da maioria do catálogo hoje.
   */
  async midiaDeVarios(
    usuario: UsuarioAutenticado,
    ids: string[],
  ): Promise<Record<string, { imagemUrl: string | null; videoUrl: string | null }>> {
    const exercicios = await this.prisma.exercicio.findMany({
      where: {
        id: { in: ids },
        deletadoEm: null,
        // Mesma regra do link individual: ninguém alcança a biblioteca alheia.
        OR: [{ escopo: EscopoExercicio.GLOBAL }, { criadoPorId: usuario.id }],
      },
      select: { id: true, imagemChave: true, videoChave: true },
    });

    const doProfissional = await this.demonstracoesParaEsteUsuario(usuario, ids);

    const mapa: Record<string, { imagemUrl: string | null; videoUrl: string | null }> = {};
    for (const e of exercicios) {
      /*
        A gravação do profissional que acompanha esta pessoa vence a do
        acervo: ela mostra o aparelho da academia dele, a variação que ele
        prescreve e a voz que o aluno reconhece. O vídeo genérico é a reserva.
      */
      const chaveDeVideo = doProfissional.get(e.id) ?? e.videoChave;
      if (!e.imagemChave && !chaveDeVideo) continue;
      mapa[e.id] = {
        imagemUrl: e.imagemChave ? (await this.midia.urlDeLeitura(e.imagemChave)).url : null,
        videoUrl: chaveDeVideo ? (await this.midia.urlDeLeitura(chaveDeVideo)).url : null,
      };
    }
    return mapa;
  }

  /**
   * As demonstrações gravadas por quem acompanha esta pessoa.
   *
   * Para o ALUNO, são as dos profissionais com vínculo ativo; para o
   * profissional, as dele mesmo — ele precisa ver a própria gravação para
   * conferir se ficou boa.
   *
   * Com mais de um profissional na equipe, o desempate é pelo mais recente:
   * quem gravou por último provavelmente gravou sabendo do outro.
   */
  private async demonstracoesParaEsteUsuario(
    usuario: UsuarioAutenticado,
    exercicioIds: string[],
  ): Promise<Map<string, string>> {
    let profissionalIds: string[];

    if (usuario.papel === Papel.ALUNO) {
      const vinculos = await this.prisma.vinculo.findMany({
        where: { alunoId: usuario.id, status: StatusVinculo.ATIVO },
        select: { profissionalId: true },
      });
      profissionalIds = vinculos.map((v) => v.profissionalId);
    } else {
      profissionalIds = [usuario.id];
    }

    if (profissionalIds.length === 0) return new Map();

    const demonstracoes = await this.prisma.demonstracaoProfissional.findMany({
      where: { exercicioId: { in: exercicioIds }, profissionalId: { in: profissionalIds } },
      orderBy: { atualizadoEm: 'asc' },
      select: { exercicioId: true, videoChave: true },
    });

    // `asc` mais sobrescrita: o último a entrar no mapa é o mais recente.
    const mapa = new Map<string, string>();
    for (const d of demonstracoes) mapa.set(d.exercicioId, d.videoChave);
    return mapa;
  }

  /**
   * Grava (ou substitui) a demonstração do profissional para um exercício.
   *
   * Funciona inclusive nos exercícios GLOBAIS, e é justamente esse o ponto:
   * o personal quer gravar o supino da academia dele, não criar um "supino do
   * Diego" que quebraria o histórico de carga do aluno — que é indexado por
   * exercício e se perderia na troca.
   */
  async gravarDemonstracao(
    usuario: UsuarioAutenticado,
    exercicioId: string,
    chave: string,
  ): Promise<void> {
    if (usuario.papel === Papel.ALUNO) {
      throw ErroDominio.papelNaoAutorizado('Só profissionais gravam demonstração.');
    }
    if (!chave.startsWith(`exercicios/${usuario.id}/`)) {
      throw ErroDominio.conflito('Chave de arquivo não pertence a você.');
    }

    const exercicio = await this.prisma.exercicio.findFirst({
      where: {
        id: exercicioId,
        deletadoEm: null,
        OR: [{ escopo: EscopoExercicio.GLOBAL }, { criadoPorId: usuario.id }],
      },
      select: { id: true },
    });
    if (!exercicio) throw ErroDominio.naoEncontrado('Exercício');

    const anterior = await this.prisma.demonstracaoProfissional.findUnique({
      where: { profissionalId_exercicioId: { profissionalId: usuario.id, exercicioId } },
      select: { videoChave: true },
    });

    await this.prisma.demonstracaoProfissional.upsert({
      where: { profissionalId_exercicioId: { profissionalId: usuario.id, exercicioId } },
      update: { videoChave: chave },
      create: { profissionalId: usuario.id, exercicioId, videoChave: chave },
    });

    // Regravar apaga o arquivo anterior: são até 100 MB cada, e sem isso
    // regravar algumas vezes enche o disco com arquivos inalcançáveis.
    // Depois da gravação, para uma falha aqui não deixar o registro apontando
    // para um arquivo que já não existe.
    if (anterior && anterior.videoChave !== chave) {
      await this.midia.remover(anterior.videoChave).catch(() => undefined);
    }
  }

  async removerDemonstracao(usuario: UsuarioAutenticado, exercicioId: string): Promise<void> {
    const existente = await this.prisma.demonstracaoProfissional.findUnique({
      where: { profissionalId_exercicioId: { profissionalId: usuario.id, exercicioId } },
    });
    if (!existente) throw ErroDominio.naoEncontrado('Demonstração');

    await this.prisma.demonstracaoProfissional.delete({
      where: { profissionalId_exercicioId: { profissionalId: usuario.id, exercicioId } },
    });
    await this.midia.remover(existente.videoChave).catch(() => undefined);
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
