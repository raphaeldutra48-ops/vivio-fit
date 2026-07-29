import { Injectable } from '@nestjs/common';
import { MetodoAvaliacao, Prisma, ProtocoloDobras } from '@prisma/client';
import type {
  AvaliacaoResumo,
  Dobra,
  RegistrarAvaliacaoInput,
  ResultadoComposicao,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';
import { ErroDeCalculo, calcularPorBioimpedancia, calcularPorDobras } from './antropometria';

type LinhaAvaliacao = Prisma.AvaliacaoFisicaGetPayload<{
  include: { avaliador: { select: { id: true; nome: true } } };
}>;

const num = (v: Prisma.Decimal | null): number | null => (v === null ? null : Number(v));

@Injectable()
export class AvaliacaoService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(alunoId: string): Promise<AvaliacaoResumo[]> {
    const avaliacoes = await this.prisma.avaliacaoFisica.findMany({
      where: { alunoId, deletadoEm: null },
      include: { avaliador: { select: { id: true, nome: true } } },
      orderBy: { data: 'desc' },
      take: 60,
    });

    // A variação é sempre contra a avaliação imediatamente anterior — é a
    // comparação que o profissional faz na consulta.
    return avaliacoes.map((a, i) => this.paraResumo(a, avaliacoes[i + 1]));
  }

  /**
   * Registra a avaliação E atualiza a `Medida` do dia.
   *
   * É essa segunda parte que faz a avaliação valer: os gráficos de composição
   * corporal leem de `Medida`, então uma adipometria feita hoje aparece na
   * curva do aluno sem ninguém digitar nada de novo.
   */
  async registrar(
    alunoId: string,
    avaliadorId: string,
    dados: RegistrarAvaliacaoInput,
  ): Promise<AvaliacaoResumo> {
    let resultado: ResultadoComposicao;

    try {
      resultado =
        dados.metodo === 'ADIPOMETRIA'
          ? calcularPorDobras({
              protocolo: dados.protocolo,
              sexo: dados.sexo,
              idade: dados.idade,
              pesoKg: dados.pesoKg,
              alturaCm: dados.alturaCm,
              dobras: dados.dobras as Partial<Record<Dobra, number>>,
            })
          : calcularPorBioimpedancia({
              pesoKg: dados.pesoKg,
              alturaCm: dados.alturaCm,
              percentualGordura: dados.percentualGordura,
              massaMagraKg: dados.massaMagraKg,
            });
    } catch (erro) {
      // Erro de cálculo é problema do que foi digitado, não falha do servidor.
      if (erro instanceof ErroDeCalculo) throw ErroDominio.conflito(erro.message);
      throw erro;
    }

    const data = new Date(dados.data.toISOString().slice(0, 10));

    const avaliacao = await this.prisma.$transaction(async (tx) => {
      const criada = await tx.avaliacaoFisica.create({
        data: {
          alunoId,
          avaliadorId,
          data,
          metodo: dados.metodo as MetodoAvaliacao,
          protocolo:
            dados.metodo === 'ADIPOMETRIA' ? (dados.protocolo as ProtocoloDobras) : undefined,
          sexo: dados.metodo === 'ADIPOMETRIA' ? dados.sexo : undefined,
          idade: dados.metodo === 'ADIPOMETRIA' ? dados.idade : undefined,
          pesoKg: dados.pesoKg,
          alturaCm: dados.alturaCm,
          dobras: dados.metodo === 'ADIPOMETRIA' ? (dados.dobras as Prisma.InputJsonValue) : undefined,
          bioimpedancia:
            dados.metodo === 'BIOIMPEDANCIA'
              ? ({
                  aguaCorporalPercentual: dados.aguaCorporalPercentual,
                  massaOsseaKg: dados.massaOsseaKg,
                  taxaMetabolicaBasal: dados.taxaMetabolicaBasal,
                  gorduraVisceral: dados.gorduraVisceral,
                } as Prisma.InputJsonValue)
              : undefined,
          percentualGordura: resultado.percentualGordura,
          massaGordaKg: resultado.massaGordaKg,
          massaMagraKg: resultado.massaMagraKg,
          densidadeCorporal: resultado.densidadeCorporal,
          somaDobrasMm: resultado.somaDobrasMm,
          imc: resultado.imc,
          observacao: dados.observacao,
        },
        include: { avaliador: { select: { id: true, nome: true } } },
      });

      const valores = {
        pesoKg: dados.pesoKg,
        percentualGordura: resultado.percentualGordura,
        massaMagraKg: resultado.massaMagraKg,
        fonte: dados.metodo === 'BIOIMPEDANCIA' ? ('BIOIMPEDANCIA' as const) : ('MANUAL' as const),
        registradoPorId: avaliadorId,
      };
      await tx.medida.upsert({
        where: { alunoId_data: { alunoId, data } },
        create: { alunoId, data, ...valores },
        update: { ...valores, deletadoEm: null },
      });

      return criada;
    });

    const anterior = await this.prisma.avaliacaoFisica.findFirst({
      where: { alunoId, deletadoEm: null, data: { lt: data } },
      include: { avaliador: { select: { id: true, nome: true } } },
      orderBy: { data: 'desc' },
    });

    return this.paraResumo(avaliacao, anterior ?? undefined);
  }

  private paraResumo(a: LinhaAvaliacao, anterior?: LinhaAvaliacao): AvaliacaoResumo {
    const percentual = Number(a.percentualGordura);
    const magra = Number(a.massaMagraKg);
    const peso = Number(a.pesoKg);

    return {
      id: a.id,
      data: a.data.toISOString().slice(0, 10),
      metodo: a.metodo,
      protocolo: a.protocolo,
      pesoKg: peso,
      alturaCm: a.alturaCm,
      resultado: {
        percentualGordura: percentual,
        massaGordaKg: Number(a.massaGordaKg),
        massaMagraKg: magra,
        densidadeCorporal: num(a.densidadeCorporal) ?? undefined,
        somaDobrasMm: num(a.somaDobrasMm) ?? undefined,
        imc: num(a.imc) ?? undefined,
      },
      dobras: (a.dobras as Partial<Record<Dobra, number>> | null) ?? null,
      bioimpedancia: (a.bioimpedancia as Record<string, number> | null) ?? null,
      observacao: a.observacao,
      avaliador: a.avaliador,
      variacao: anterior
        ? {
            percentualGordura: Math.round((percentual - Number(anterior.percentualGordura)) * 10) / 10,
            massaMagraKg: Math.round((magra - Number(anterior.massaMagraKg)) * 100) / 100,
            pesoKg: Math.round((peso - Number(anterior.pesoKg)) * 100) / 100,
          }
        : null,
    };
  }
}
