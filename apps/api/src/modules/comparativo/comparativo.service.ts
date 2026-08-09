import { Injectable } from '@nestjs/common';
import { Papel } from '@prisma/client';
import type {
  ComparativoDeEvolucao,
  FotoDoComparativo,
  LadoDoComparativo,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';
import { MidiaService } from '../midia/midia.service';
import { volumeKg } from '../treinos/metricas';

const DIA_EM_MS = 24 * 60 * 60 * 1000;

/**
 * Tolerância ao redor da data-alvo do "antes".
 *
 * Ninguém se mede exatamente 60 dias antes. Sem uma janela, o comparativo de
 * quem mediu no dia 57 viria vazio — e a pessoa concluiria que o app perdeu
 * seus dados.
 */
const JANELA_DO_ANTES_DIAS = 21;

type LinhaMedida = {
  data: Date;
  pesoKg: unknown;
  percentualGordura: unknown;
  massaMagraKg: unknown;
  cinturaCm: unknown;
  quadrilCm: unknown;
  bracoCm: unknown;
  coxaCm: unknown;
  toraxCm: unknown;
};

const numero = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

@Injectable()
export class ComparativoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly midia: MidiaService,
  ) {}

  async montar(
    alunoId: string,
    dias: number,
    papelDeQuemPede: Papel,
  ): Promise<ComparativoDeEvolucao> {
    const aluno = await this.prisma.user.findFirst({
      where: { id: alunoId, deletadoEm: null },
      select: { id: true, nome: true },
    });
    if (!aluno) throw ErroDominio.naoEncontrado('Aluno');

    const agoraEm = new Date();
    const alvoDoAntes = new Date(agoraEm.getTime() - dias * DIA_EM_MS);

    const [medidaAgora, medidaAntes] = await Promise.all([
      this.prisma.medida.findFirst({
        where: { alunoId, deletadoEm: null },
        orderBy: { data: 'desc' },
      }),
      /*
        A medição mais recente DENTRO da janela em torno do alvo — não a mais
        antiga que existir. Pegar a mais antiga faria um aluno de dois anos de
        casa comparar hoje com o primeiro dia, o que não é um comparativo de
        60 dias.
      */
      this.prisma.medida.findFirst({
        where: {
          alunoId,
          deletadoEm: null,
          data: {
            gte: new Date(alvoDoAntes.getTime() - JANELA_DO_ANTES_DIAS * DIA_EM_MS),
            lte: new Date(alvoDoAntes.getTime() + JANELA_DO_ANTES_DIAS * DIA_EM_MS),
          },
        },
        orderBy: { data: 'desc' },
      }),
    ]);

    const [fotosAgora, fotosAntes, treino] = await Promise.all([
      this.fotosProximasDe(alunoId, agoraEm, papelDeQuemPede),
      this.fotosProximasDe(alunoId, alvoDoAntes, papelDeQuemPede),
      this.resumoDeTreino(alunoId, alvoDoAntes),
    ]);

    const antes = this.paraLado(medidaAntes, fotosAntes);
    const nova = this.paraLado(medidaAgora, fotosAgora);

    return {
      dias,
      aluno,
      antes,
      agora: nova,
      diferenca: {
        pesoKg: this.delta(antes.pesoKg, nova.pesoKg),
        percentualGordura: this.delta(antes.percentualGordura, nova.percentualGordura),
        massaMagraKg: this.delta(antes.massaMagraKg, nova.massaMagraKg),
        cinturaCm: this.delta(antes.cinturaCm, nova.cinturaCm),
        quadrilCm: this.delta(antes.quadrilCm, nova.quadrilCm),
        bracoCm: this.delta(antes.bracoCm, nova.bracoCm),
        coxaCm: this.delta(antes.coxaCm, nova.coxaCm),
        toraxCm: this.delta(antes.toraxCm, nova.toraxCm),
      },
      treino,
      geradoEm: agoraEm.toISOString(),
    };
  }

  /**
   * `null` quando falta um dos lados — e não zero.
   *
   * Zero significaria "não mudou", que é uma afirmação sobre o corpo da
   * pessoa. Ausência de medida é ausência, e o documento vai para a mão dela.
   */
  private delta(antes: number | null, agora: number | null): number | null {
    if (antes === null || agora === null) return null;
    return Number((agora - antes).toFixed(1));
  }

  private paraLado(medida: LinhaMedida | null, fotos: FotoDoComparativo[]): LadoDoComparativo {
    return {
      data: medida ? medida.data.toISOString().slice(0, 10) : null,
      pesoKg: numero(medida?.pesoKg),
      percentualGordura: numero(medida?.percentualGordura),
      massaMagraKg: numero(medida?.massaMagraKg),
      cinturaCm: numero(medida?.cinturaCm),
      quadrilCm: numero(medida?.quadrilCm),
      bracoCm: numero(medida?.bracoCm),
      coxaCm: numero(medida?.coxaCm),
      toraxCm: numero(medida?.toraxCm),
      fotos,
    };
  }

  /**
   * Uma foto por ângulo, a mais próxima da data.
   *
   * O filtro de visibilidade é o mesmo do módulo de fotos: a foto de evolução
   * é o dado mais íntimo do app e o padrão é não compartilhar. Um comparativo
   * bonito não é motivo para furar isso — se o aluno não liberou, o documento
   * sai só com os números.
   */
  private async fotosProximasDe(
    alunoId: string,
    alvo: Date,
    papel: Papel,
  ): Promise<FotoDoComparativo[]> {
    const candidatas = await this.prisma.fotoEvolucao.findMany({
      where: {
        alunoId,
        deletadoEm: null,
        data: {
          gte: new Date(alvo.getTime() - JANELA_DO_ANTES_DIAS * DIA_EM_MS),
          lte: new Date(alvo.getTime() + JANELA_DO_ANTES_DIAS * DIA_EM_MS),
        },
        ...(papel === Papel.ALUNO ? {} : { visivelPara: { has: papel } }),
      },
      orderBy: { data: 'desc' },
    });

    const porAngulo = new Map<string, (typeof candidatas)[number]>();
    for (const f of candidatas) {
      const atual = porAngulo.get(f.angulo);
      const distancia = (d: Date) => Math.abs(d.getTime() - alvo.getTime());
      if (!atual || distancia(f.data) < distancia(atual.data)) porAngulo.set(f.angulo, f);
    }

    return Promise.all(
      [...porAngulo.values()].map(async (f) => ({
        id: f.id,
        data: f.data.toISOString().slice(0, 10),
        angulo: f.angulo,
        url: (await this.midia.urlDeLeitura(f.chaveArquivo)).url,
      })),
    );
  }

  /** O esforço que explica o resultado — sem isso o documento é só o corpo. */
  private async resumoDeTreino(
    alunoId: string,
    de: Date,
  ): Promise<ComparativoDeEvolucao['treino']> {
    const execucoes = await this.prisma.execucaoTreino.findMany({
      where: { alunoId, iniciadoEm: { gte: de } },
      include: { series: true },
    });

    if (execucoes.length === 0) return null;

    const volume = execucoes.reduce(
      (soma, e) =>
        soma +
        volumeKg(
          e.series.map((s) => ({
            cargaKg: Number(s.cargaKg),
            repsFeitas: s.repsFeitas,
            tipo: s.tipo,
          })),
        ),
      0,
    );

    const segundos = execucoes.reduce((s, e) => s + (e.duracaoSeg ?? 0), 0);

    return {
      sessoes: execucoes.length,
      volumeKg: Number(volume.toFixed(2)),
      minutos: Math.round(segundos / 60),
    };
  }
}
