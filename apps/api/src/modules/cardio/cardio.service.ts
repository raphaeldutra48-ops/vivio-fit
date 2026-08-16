import { Injectable } from '@nestjs/common';
import { EscopoDado } from '@prisma/client';
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
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { consentimentoVigentePara } from '../../common/consentimento/regra';
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
    const [comPeso, comMassaMagra, perfil, calorimetria] = await Promise.all([
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
      /*
        A calorimetria mais recente. Quem tiver duas, a nova manda — e se ela
        já não valer, `taxaMetabolicaBasal` cai sozinha para a fórmula e diz
        o motivo. Buscar a "mais recente que ainda vale" aqui esconderia da
        tela a informação de que houve uma e ela expirou.
      */
      this.prisma.calorimetriaIndireta.findFirst({
        where: { alunoId, deletadoEm: null },
        orderBy: { data: 'desc' },
        select: { tmbMedidaKcal: true, data: true, pesoNoExameKg: true },
      }),
    ]);

    return {
      pesoKg: comPeso?.pesoKg ? Number(comPeso.pesoKg) : null,
      alturaCm: perfil?.alturaCm ?? null,
      idade: idadeEmAnos(perfil?.dataNascimento ?? null),
      sexo: (perfil?.sexoBiologico as SexoBiologico | null) ?? null,
      massaMagraKg: comMassaMagra?.massaMagraKg ? Number(comMassaMagra.massaMagraKg) : null,
      calorimetria: calorimetria
        ? {
            tmbMedidaKcal: calorimetria.tmbMedidaKcal,
            data: calorimetria.data.toISOString().slice(0, 10),
            pesoNoExameKg:
              calorimetria.pesoNoExameKg === null ? null : Number(calorimetria.pesoNoExameKg),
          }
        : null,
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

  /**
   * Atividades do período.
   *
   * A caloria de cada uma só vai para quem pode ver o corpo. Não é preciosismo:
   * `kcal = MET × 3,5 × peso / 200 × min` se inverte com uma divisão, e o
   * tipo, a intensidade e a duração estão na mesma resposta. Entregar a
   * caloria a quem só autorizou treino seria entregar o peso por caminho
   * indireto — e o aluno teria autorizado uma coisa e revelado outra.
   */
  async listar(alunoId: string, quemPede: UsuarioAutenticado, dias: number): Promise<CardioResumo[]> {
    const de = new Date(Date.now() - dias * DIA_EM_MS);
    const [atividades, peso, podeVerOCorpo] = await Promise.all([
      this.prisma.atividadeCardio.findMany({
        where: { alunoId, deletadoEm: null, data: { gte: de } },
        orderBy: { data: 'desc' },
      }),
      this.pesoAtual(alunoId),
      this.autorizadoAVerEvolucao(alunoId, quemPede),
    ]);
    return atividades.map((a) => this.paraResumo(a, podeVerOCorpo ? peso : null));
  }

  /** O aluno sempre vê o próprio corpo; o profissional, só com EVOLUCAO. */
  private async autorizadoAVerEvolucao(
    alunoId: string,
    quemPede: UsuarioAutenticado,
  ): Promise<boolean> {
    if (quemPede.id === alunoId) return true;

    const consentimento = await this.prisma.consentimento.findFirst({
      where: {
        alunoId,
        escopo: EscopoDado.EVOLUCAO,
        ...consentimentoVigentePara(quemPede.id),
      },
      select: { id: true },
    });
    return consentimento !== null;
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

    /*
      Duas ausências diferentes, e por muito tempo elas foram a mesma aqui.

      Não houve sessão nenhuma na janela: a resposta é ZERO. "Você não queimou
      nada esta semana" é um fato, e é justamente o que o contador precisa
      dizer para servir de cobrança. Devolver `null` fazia a tela mostrar um
      travessão, que se lê como "não carregou" — e o aluno que passou a semana
      parado via o app quebrado em vez de ver a própria semana parada.

      Houve sessão mas não deu para estimar (falta o peso): aí sim é `null`.
      Somar como zero afirmaria que ela treinou de graça.
    */
    const kcalOuZero = (sessoes: number, temAlguma: boolean, soma: number): number | null => {
      if (sessoes === 0) return 0;
      return temAlguma ? soma : null;
    };

    const musculacao = {
      sessoes: execucoes.length,
      minutos: minutosMusculacao,
      kcal: kcalOuZero(execucoes.length, temAlgumaKcalDeMusculacao, kcalMusculacao),
    };
    const cardio = {
      sessoes: cardios.length,
      minutos: minutosCardio,
      kcal: kcalOuZero(cardios.length, temAlgumaKcalDeCardio, kcalCardio),
    };

    /*
      Basta UMA parte desconhecida para o total ser desconhecido: somar o que
      se sabe com o que não se sabe e chamar de total dá um número menor que o
      real, com cara de exato. Antes a condição era `&&`, e o total virava a
      soma parcial sempre que só uma das duas pudesse ser estimada.
    */
    const totalKcal =
      musculacao.kcal === null || cardio.kcal === null ? null : musculacao.kcal + cardio.kcal;

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
