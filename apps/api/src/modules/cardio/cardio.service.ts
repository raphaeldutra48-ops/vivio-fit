import { Injectable } from '@nestjs/common';
import {
  MET_MUSCULACAO,
  estimarCalorias,
  gastoDiario,
  idadeEmAnos,
  metDe,
  type CardioResumo,
  type DadosParaTmb,
  type Intensidade,
  type RegistrarCardioInput,
  type ResumoDeCalorias,
  type SexoBiologico,
  type TipoCardio,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';

const DIA_EM_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CardioService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * O peso mais recente do aluno.
   *
   * Toda a estimativa calórica pende disto. Quando não há medida, o serviço
   * devolve `null` por toda a cadeia em vez de assumir um peso médio: um peso
   * chutado erra a conta em 30% para quem foge da média, e é justamente quem
   * foge da média que mais olha esse número.
   */
  private async pesoAtual(alunoId: string): Promise<number | null> {
    const medida = await this.prisma.medida.findFirst({
      where: { alunoId, deletadoEm: null, pesoKg: { not: null } },
      orderBy: { data: 'desc' },
      select: { pesoKg: true },
    });
    return medida?.pesoKg ? Number(medida.pesoKg) : null;
  }

  /**
   * O que a taxa metabólica precisa, cada peça do lugar onde ela já mora.
   *
   * A massa magra vem da medida mais recente que a tenha — e não da mais
   * recente de todas. Quem se pesou ontem e fez bioimpedância mês passado
   * ainda tem composição medida; ignorá-la jogaria a conta de volta para a
   * fórmula que depende de sexo, que é a menos precisa das duas.
   */
  private async dadosParaTmb(alunoId: string): Promise<DadosParaTmb> {
    const [comPeso, comMassaMagra, perfil] = await Promise.all([
      this.prisma.medida.findFirst({
        where: { alunoId, deletadoEm: null, pesoKg: { not: null } },
        orderBy: { data: 'desc' },
        select: { pesoKg: true },
      }),
      this.prisma.medida.findFirst({
        where: { alunoId, deletadoEm: null, massaMagraKg: { not: null } },
        orderBy: { data: 'desc' },
        select: { massaMagraKg: true },
      }),
      this.prisma.perfilAluno.findUnique({
        where: { userId: alunoId },
        select: { alturaCm: true, dataNascimento: true, sexoBiologico: true },
      }),
    ]);

    return {
      pesoKg: comPeso?.pesoKg ? Number(comPeso.pesoKg) : null,
      alturaCm: perfil?.alturaCm ?? null,
      idade: idadeEmAnos(perfil?.dataNascimento ?? null),
      sexo: (perfil?.sexoBiologico as SexoBiologico | null) ?? null,
      massaMagraKg: comMassaMagra?.massaMagraKg ? Number(comMassaMagra.massaMagraKg) : null,
    };
  }

  async registrar(alunoId: string, dados: RegistrarCardioInput): Promise<CardioResumo> {
    if (dados.execucaoId) {
      // A execução tem que ser do próprio aluno: sem esta conferência, dava
      // para pendurar cardio no treino de outra pessoa mandando o id dela.
      const execucao = await this.prisma.execucaoTreino.findFirst({
        where: { id: dados.execucaoId, alunoId },
        select: { id: true },
      });
      if (!execucao) throw ErroDominio.naoEncontrado('Execução de treino');
    }

    const criada = await this.prisma.atividadeCardio.create({
      data: {
        alunoId,
        execucaoId: dados.execucaoId ?? null,
        tipo: dados.tipo,
        intensidade: dados.intensidade,
        duracaoMin: dados.duracaoMin,
        distanciaKm: dados.distanciaKm ?? null,
        data: new Date(`${dados.data}T00:00:00.000Z`),
        observacao: dados.observacao ?? null,
      },
    });

    return this.paraResumo(criada, await this.pesoAtual(alunoId));
  }

  async listar(alunoId: string, dias: number): Promise<CardioResumo[]> {
    const de = new Date(Date.now() - dias * DIA_EM_MS);
    const [atividades, peso] = await Promise.all([
      this.prisma.atividadeCardio.findMany({
        where: { alunoId, deletadoEm: null, data: { gte: de } },
        orderBy: { data: 'desc' },
      }),
      this.pesoAtual(alunoId),
    ]);
    return atividades.map((a) => this.paraResumo(a, peso));
  }

  async remover(alunoId: string, id: string): Promise<void> {
    const atividade = await this.prisma.atividadeCardio.findFirst({
      where: { id, alunoId, deletadoEm: null },
      select: { id: true },
    });
    if (!atividade) throw ErroDominio.naoEncontrado('Atividade');
    await this.prisma.atividadeCardio.update({
      where: { id },
      data: { deletadoEm: new Date() },
    });
  }

  /**
   * Gasto calórico do período, separado entre musculação e cardio.
   *
   * Separado porque responde a perguntas diferentes: o cardio diz se o aluno
   * cumpriu o que foi combinado fora da sala, a musculação diz se o treino tem
   * o volume prescrito. Somados, nenhuma das duas dá para responder.
   */
  async resumoDeCalorias(alunoId: string, dias: number): Promise<ResumoDeCalorias> {
    const de = new Date(Date.now() - dias * DIA_EM_MS);

    const [dadosDoCorpo, execucoes, cardios] = await Promise.all([
      this.dadosParaTmb(alunoId),
      this.prisma.execucaoTreino.findMany({
        where: { alunoId, iniciadoEm: { gte: de } },
        select: { duracaoSeg: true, feedback: { select: { dificuldade: true } } },
      }),
      this.prisma.atividadeCardio.findMany({
        where: { alunoId, deletadoEm: null, data: { gte: de } },
        select: { tipo: true, intensidade: true, duracaoMin: true },
      }),
    ]);

    const peso = dadosDoCorpo.pesoKg;

    /*
      A dificuldade relatada vira a intensidade da musculação: quem terminou
      dizendo "muito difícil" gastou mais que quem achou leve, e é a única
      leitura de esforço que temos. Sem feedback, assume moderada — o meio da
      escala erra menos que qualquer extremo.
    */
    const intensidadeDoTreino = (dificuldade?: number): number => {
      if (dificuldade === undefined) return MET_MUSCULACAO.MODERADA;
      if (dificuldade <= 2) return MET_MUSCULACAO.LEVE;
      if (dificuldade >= 4) return MET_MUSCULACAO.INTENSA;
      return MET_MUSCULACAO.MODERADA;
    };

    let minutosMusculacao = 0;
    let kcalMusculacao = 0;
    let temAlgumaKcalDeMusculacao = false;

    for (const e of execucoes) {
      const minutos = Math.round((e.duracaoSeg ?? 0) / 60);
      if (minutos <= 0) continue;
      minutosMusculacao += minutos;
      const kcal = estimarCalorias(intensidadeDoTreino(e.feedback?.dificuldade), minutos, peso);
      if (kcal !== null) {
        kcalMusculacao += kcal;
        temAlgumaKcalDeMusculacao = true;
      }
    }

    let minutosCardio = 0;
    let kcalCardio = 0;
    let temAlgumaKcalDeCardio = false;

    for (const c of cardios) {
      minutosCardio += c.duracaoMin;
      const kcal = estimarCalorias(
        metDe(c.tipo as TipoCardio, c.intensidade as Intensidade),
        c.duracaoMin,
        peso,
      );
      if (kcal !== null) {
        kcalCardio += kcal;
        temAlgumaKcalDeCardio = true;
      }
    }

    const musculacao = {
      sessoes: execucoes.length,
      minutos: minutosMusculacao,
      kcal: temAlgumaKcalDeMusculacao ? kcalMusculacao : null,
    };
    const cardio = {
      sessoes: cardios.length,
      minutos: minutosCardio,
      kcal: temAlgumaKcalDeCardio ? kcalCardio : null,
    };

    // `null` quando nada pôde ser estimado — somar nulos como zero diria
    // "você não gastou nada", que é diferente de "não deu para calcular".
    const totalKcal =
      musculacao.kcal === null && cardio.kcal === null
        ? null
        : (musculacao.kcal ?? 0) + (cardio.kcal ?? 0);

    return {
      dias,
      pesoUsadoKg: peso,
      musculacao,
      cardio,
      totalKcal,
      gastoDiario: gastoDiario(dadosDoCorpo, totalKcal, dias),
    };
  }

  private paraResumo(
    a: {
      id: string;
      tipo: string;
      intensidade: string;
      duracaoMin: number;
      distanciaKm: unknown;
      data: Date;
      observacao: string | null;
      execucaoId: string | null;
      criadoEm: Date;
    },
    peso: number | null,
  ): CardioResumo {
    return {
      id: a.id,
      tipo: a.tipo as TipoCardio,
      intensidade: a.intensidade as Intensidade,
      duracaoMin: a.duracaoMin,
      distanciaKm: a.distanciaKm === null ? null : Number(a.distanciaKm),
      data: a.data.toISOString().slice(0, 10),
      observacao: a.observacao,
      execucaoId: a.execucaoId,
      caloriasEstimadas: estimarCalorias(
        metDe(a.tipo as TipoCardio, a.intensidade as Intensidade),
        a.duracaoMin,
        peso,
      ),
      criadoEm: a.criadoEm.toISOString(),
    };
  }
}
