import { Injectable } from '@nestjs/common';
import {
  validadeDaCalorimetria,
  type CalorimetriaResumo,
  type RegistrarCalorimetriaInput,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';

type LinhaCalorimetria = {
  id: string;
  data: Date;
  tmbMedidaKcal: number;
  pesoNoExameKg: unknown;
  equipamento: string | null;
  observacao: string | null;
  criadoEm: Date;
  registradoPor: { id: string; nome: string };
};

@Injectable()
export class CalorimetriaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * O peso de hoje — é ele que decide se a medição antiga ainda descreve este
   * corpo. Sem peso atual, só o prazo controla a validade.
   */
  private async pesoAtual(alunoId: string): Promise<number | null> {
    const medida = await this.prisma.medida.findFirst({
      where: { alunoId, deletadoEm: null, pesoKg: { not: null } },
      orderBy: { data: 'desc' },
      select: { pesoKg: true },
    });
    return medida?.pesoKg ? Number(medida.pesoKg) : null;
  }

  async listar(alunoId: string): Promise<CalorimetriaResumo[]> {
    const [exames, peso] = await Promise.all([
      this.prisma.calorimetriaIndireta.findMany({
        where: { alunoId, deletadoEm: null },
        orderBy: { data: 'desc' },
        include: { registradoPor: { select: { id: true, nome: true } } },
      }),
      this.pesoAtual(alunoId),
    ]);
    return exames.map((e) => this.paraResumo(e, peso));
  }

  /**
   * Registra o exame. Lançam o aluno, com o laudo na mão, e o profissional que
   * o pediu — diferente do check-in e do cardio, que são autorrelato e só o
   * aluno escreve. Aqui o dado é de um laboratório, não da percepção de
   * ninguém, e quem digita fica gravado.
   */
  async registrar(
    alunoId: string,
    registradoPorId: string,
    dados: RegistrarCalorimetriaInput,
  ): Promise<CalorimetriaResumo> {
    const criado = await this.prisma.calorimetriaIndireta.create({
      data: {
        alunoId,
        registradoPorId,
        data: new Date(`${dados.data}T00:00:00.000Z`),
        tmbMedidaKcal: dados.tmbMedidaKcal,
        pesoNoExameKg: dados.pesoNoExameKg ?? null,
        equipamento: dados.equipamento ?? null,
        observacao: dados.observacao ?? null,
      },
      include: { registradoPor: { select: { id: true, nome: true } } },
    });

    return this.paraResumo(criado, await this.pesoAtual(alunoId));
  }

  async remover(alunoId: string, id: string): Promise<void> {
    const exame = await this.prisma.calorimetriaIndireta.findFirst({
      where: { id, alunoId, deletadoEm: null },
      select: { id: true },
    });
    if (!exame) throw ErroDominio.naoEncontrado('Calorimetria');

    await this.prisma.calorimetriaIndireta.update({
      where: { id },
      data: { deletadoEm: new Date() },
    });
  }

  private paraResumo(e: LinhaCalorimetria, pesoAtual: number | null): CalorimetriaResumo {
    const data = e.data.toISOString().slice(0, 10);
    const pesoNoExameKg = e.pesoNoExameKg === null ? null : Number(e.pesoNoExameKg);

    return {
      id: e.id,
      data,
      tmbMedidaKcal: e.tmbMedidaKcal,
      pesoNoExameKg,
      equipamento: e.equipamento,
      observacao: e.observacao,
      registradoPor: e.registradoPor,
      // Calculada na leitura, e nunca guardada: ela depende do peso de hoje, e
      // um campo gravado ficaria dizendo "válida" para sempre.
      validade: validadeDaCalorimetria({ tmbMedidaKcal: e.tmbMedidaKcal, data, pesoNoExameKg }, pesoAtual),
      criadoEm: e.criadoEm.toISOString(),
    };
  }
}
