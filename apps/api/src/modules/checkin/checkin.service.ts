import { Injectable } from '@nestjs/common';
import type {
  CheckinResumo,
  RegistrarCheckinInput,
  ResumoDeCheckins,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';

const DIA_EM_MS = 24 * 60 * 60 * 1000;

/**
 * Quanto para trás dá para registrar.
 *
 * Existe porque esquecer de registrar ontem é comum e proibir seria irritante;
 * e porque preencher três meses de uma vez, retroativamente, transformaria a
 * adesão num número que a pessoa escreve em vez de um que ela vive.
 */
const DIAS_RETROATIVOS = 3;

@Injectable()
export class CheckinService {
  constructor(private readonly prisma: PrismaService) {}

  /** Meia-noite UTC do dia informado — é assim que a coluna `@db.Date` guarda. */
  private dataDoDia(texto: string): Date {
    const d = new Date(`${texto}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) throw ErroDominio.conflito('Data inválida.');
    return d;
  }

  private hojeUtc(): Date {
    const agora = new Date();
    return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()));
  }

  /**
   * Registra o check-in do dia. Registrar de novo no mesmo dia **corrige** o
   * anterior em vez de criar outro: o aluno que marcou "não treinei" de manhã e
   * treinou à noite precisa poder consertar.
   */
  async registrar(alunoId: string, dados: RegistrarCheckinInput): Promise<CheckinResumo> {
    const data = this.dataDoDia(dados.data);
    const hoje = this.hojeUtc();

    /*
      Um dia de folga para o futuro, não zero: quem está em fuso à frente do
      UTC (não é o caso do Brasil, mas o app não é só do Brasil) veria o
      próprio "hoje" recusado como se fosse amanhã.
    */
    if (data.getTime() > hoje.getTime() + DIA_EM_MS) {
      throw ErroDominio.conflito('Não dá para fazer check-in de um dia que ainda não veio.');
    }

    if (data.getTime() < hoje.getTime() - DIAS_RETROATIVOS * DIA_EM_MS) {
      throw ErroDominio.conflito(
        `Só dá para registrar os últimos ${DIAS_RETROATIVOS} dias. Para corrigir algo mais antigo, fale com seu profissional.`,
      );
    }

    // Dor sem local é aceitável (nem sempre a pessoa sabe dizer onde), mas
    // local de dor sem dor é contradição — e ficaria guardado para sempre.
    const localDor = dados.teveDor ? (dados.localDor ?? null) : null;

    const registro = await this.prisma.checkinDiario.upsert({
      where: { alunoId_data: { alunoId, data } },
      create: {
        alunoId,
        data,
        treinou: dados.treinou,
        energia: dados.energia,
        teveDor: dados.teveDor,
        localDor,
        observacao: dados.observacao ?? null,
      },
      update: {
        treinou: dados.treinou,
        energia: dados.energia,
        teveDor: dados.teveDor,
        localDor,
        observacao: dados.observacao ?? null,
      },
    });

    return this.paraResumo(registro);
  }

  async listar(alunoId: string, dias: number): Promise<CheckinResumo[]> {
    const de = new Date(this.hojeUtc().getTime() - (dias - 1) * DIA_EM_MS);

    const registros = await this.prisma.checkinDiario.findMany({
      where: { alunoId, data: { gte: de } },
      orderBy: { data: 'desc' },
    });

    return registros.map((r) => this.paraResumo(r));
  }

  /**
   * Os números que o painel do profissional mostra.
   *
   * A decisão que importa aqui é o denominador da adesão: **dias com
   * check-in**, não dias do período. Quem não registrou nada não "deixou de
   * treinar" — apenas não contou. Usar o período inteiro daria 20% de adesão
   * para alguém que treina certo e só esquece de marcar, e o personal ligaria
   * cobrando a pessoa errada.
   *
   * Para "sumiu" existe campo próprio: `diasSemCheckin`.
   */
  async resumo(alunoId: string, dias: number): Promise<ResumoDeCheckins> {
    const registros = await this.listar(alunoId, dias);

    const comCheckin = registros.length;
    const treinou = registros.filter((r) => r.treinou).length;
    const diasComDor = registros.filter((r) => r.teveDor).length;

    const somaEnergia = registros.reduce((s, r) => s + r.energia, 0);
    const ultimo = registros[0] ?? null;

    return {
      dias,
      comCheckin,
      treinou,
      aderencia: comCheckin === 0 ? null : Math.round((treinou / comCheckin) * 100),
      energiaMedia: comCheckin === 0 ? null : Number((somaEnergia / comCheckin).toFixed(1)),
      diasComDor,
      diasSemCheckin: ultimo
        ? Math.floor((this.hojeUtc().getTime() - new Date(`${ultimo.data}T00:00:00.000Z`).getTime()) / DIA_EM_MS)
        : null,
      ultimoEm: ultimo?.data ?? null,
    };
  }

  private paraResumo(r: {
    id: string;
    data: Date;
    treinou: boolean;
    energia: number;
    teveDor: boolean;
    localDor: string | null;
    observacao: string | null;
    criadoEm: Date;
  }): CheckinResumo {
    return {
      id: r.id,
      // `toISOString().slice(0,10)` e não `toLocaleDateString`: a coluna é DATE
      // em UTC, e formatar pelo fuso do servidor deslocaria o dia.
      data: r.data.toISOString().slice(0, 10),
      treinou: r.treinou,
      energia: r.energia,
      teveDor: r.teveDor,
      localDor: r.localDor,
      observacao: r.observacao,
      criadoEm: r.criadoEm.toISOString(),
    };
  }
}
