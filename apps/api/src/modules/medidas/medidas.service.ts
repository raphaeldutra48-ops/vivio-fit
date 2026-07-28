import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { MedidaResumo, RegistrarMedidaInput } from '@vivio/contracts';
import { PrismaService } from '../../infra/prisma.service';

/** Decimal do Prisma -> number, para o JSON não sair como string. */
const num = (v: Prisma.Decimal | null): number | null => (v === null ? null : Number(v));

function paraResumo(m: {
  id: string;
  data: Date;
  pesoKg: Prisma.Decimal | null;
  percentualGordura: Prisma.Decimal | null;
  massaMagraKg: Prisma.Decimal | null;
  cinturaCm: Prisma.Decimal | null;
  quadrilCm: Prisma.Decimal | null;
  bracoCm: Prisma.Decimal | null;
  coxaCm: Prisma.Decimal | null;
  toraxCm: Prisma.Decimal | null;
  fonte: string;
}): MedidaResumo {
  return {
    id: m.id,
    data: m.data.toISOString().slice(0, 10),
    pesoKg: num(m.pesoKg),
    percentualGordura: num(m.percentualGordura),
    massaMagraKg: num(m.massaMagraKg),
    cinturaCm: num(m.cinturaCm),
    quadrilCm: num(m.quadrilCm),
    bracoCm: num(m.bracoCm),
    coxaCm: num(m.coxaCm),
    toraxCm: num(m.toraxCm),
    fonte: m.fonte,
  };
}

@Injectable()
export class MedidasService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(alunoId: string): Promise<MedidaResumo[]> {
    const medidas = await this.prisma.medida.findMany({
      where: { alunoId, deletadoEm: null },
      orderBy: { data: 'desc' },
      take: 100,
    });
    return medidas.map(paraResumo);
  }

  /** Remedir no mesmo dia atualiza a linha em vez de criar outra. */
  async registrar(
    alunoId: string,
    registradoPorId: string,
    dados: RegistrarMedidaInput,
  ): Promise<MedidaResumo> {
    const data = new Date(dados.data.toISOString().slice(0, 10));
    const valores = {
      pesoKg: dados.pesoKg,
      percentualGordura: dados.percentualGordura,
      massaMagraKg: dados.massaMagraKg,
      cinturaCm: dados.cinturaCm,
      quadrilCm: dados.quadrilCm,
      bracoCm: dados.bracoCm,
      coxaCm: dados.coxaCm,
      toraxCm: dados.toraxCm,
      fonte: dados.fonte,
      registradoPorId,
    };

    const medida = await this.prisma.medida.upsert({
      where: { alunoId_data: { alunoId, data } },
      create: { alunoId, data, ...valores },
      update: { ...valores, deletadoEm: null },
    });
    return paraResumo(medida);
  }
}
