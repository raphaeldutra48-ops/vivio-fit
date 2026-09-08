import { Injectable } from '@nestjs/common';
import { resumoDeAgua } from '@vivio/contracts';
import type {
  DefinirMetaAguaInput,
  RegistrarAguaInput,
  ResumoDeAgua,
} from '@vivio/contracts';
import { PrismaService } from '../../infra/prisma.service';

@Injectable()
export class AguaService {
  constructor(private readonly prisma: PrismaService) {}

  private soData(data: Date): Date {
    return new Date(data.toISOString().slice(0, 10));
  }

  async registrar(alunoId: string, dados: RegistrarAguaInput): Promise<ResumoDeAgua> {
    await this.prisma.registroAgua.create({
      data: { alunoId, data: this.soData(dados.data), volumeMl: dados.volumeMl },
    });
    return this.resumoDoDia(alunoId, dados.data);
  }

  async remover(alunoId: string, registroId: string): Promise<void> {
    // deleteMany com alunoId no filtro: apagar registro alheio não acontece.
    await this.prisma.registroAgua.deleteMany({ where: { id: registroId, alunoId } });
  }

  async definirMeta(
    alunoId: string,
    definidoPorId: string,
    dados: DefinirMetaAguaInput,
  ): Promise<{ metaMlDia: number; horaInicio: number; horaFim: number }> {
    const salvo = await this.prisma.metaAgua.upsert({
      where: { alunoId },
      create: {
        alunoId,
        definidoPorId,
        metaMlDia: dados.metaMlDia,
        horaInicio: dados.horaInicio,
        horaFim: dados.horaFim,
      },
      update: {
        definidoPorId,
        metaMlDia: dados.metaMlDia,
        horaInicio: dados.horaInicio,
        horaFim: dados.horaFim,
      },
    });
    return {
      metaMlDia: salvo.metaMlDia,
      horaInicio: salvo.horaInicio,
      horaFim: salvo.horaFim,
    };
  }

  /**
   * O copo do dia. A conta mora em `@vivio/contracts` — a MESMA função que o
   * SDK chama. É conta sobre linhas que quem pergunta já pode ler, e agregação
   * assim não precisa de servidor: precisa de um lugar com teste.
   */
  async resumoDoDia(alunoId: string, data = new Date(), agora = new Date()): Promise<ResumoDeAgua> {
    const dia = this.soData(data);

    const [meta, registros] = await Promise.all([
      this.prisma.metaAgua.findUnique({ where: { alunoId } }),
      this.prisma.registroAgua.findMany({
        where: { alunoId, data: dia },
        orderBy: { registradoEm: 'desc' },
      }),
    ]);

    return resumoDeAgua(
      dia.toISOString().slice(0, 10),
      meta?.metaMlDia ?? null,
      registros.map((r) => ({
        id: r.id,
        volumeMl: r.volumeMl,
        registradoEm: r.registradoEm.toISOString(),
      })),
      agora,
    );
  }

  /**
   * Regra do lembrete inteligente de água (item 3.2 da especificação):
   * avisar quando passaram N horas sem registro, mas só dentro da janela ativa
   * do aluno e só se ele ainda estiver atrás da meta.
   *
   * Sem essas duas condições o app viraria despertador — alertando de
   * madrugada e cobrando quem já bateu a meta.
   */
  async precisaDeLembrete(
    alunoId: string,
    horaLocal: number,
    agora: Date,
    horasSemBeber = 3,
  ): Promise<boolean> {
    const meta = await this.prisma.metaAgua.findUnique({ where: { alunoId } });
    const horaInicio = meta?.horaInicio ?? 7;
    const horaFim = meta?.horaFim ?? 22;
    if (horaLocal < horaInicio || horaLocal > horaFim) return false;

    const resumo = await this.resumoDoDia(alunoId, agora, agora);
    if (resumo.consumidoMl >= resumo.metaMlDia) return false;

    // Nenhum registro no dia: dentro da janela, já é motivo para lembrar.
    if (resumo.minutosDesdeUltimoRegistro === null) return horaLocal > horaInicio;

    return resumo.minutosDesdeUltimoRegistro >= horasSemBeber * 60;
  }
}
