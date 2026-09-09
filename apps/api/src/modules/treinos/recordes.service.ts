import { Injectable } from '@nestjs/common';
import { montarMeusRecordes, type MeusRecordes } from '@vivio/contracts';
import { PrismaService } from '../../infra/prisma.service';

/**
 * As marcas pessoais do aluno.
 *
 * O serviço busca; a conta mora em `@vivio/contracts`, porque o SDK falando
 * direto com o Postgres monta a mesma tela. Duas implementações da mesma
 * apuração dariam recordes diferentes na web e no celular sobre o mesmo
 * histórico.
 */
@Injectable()
export class RecordesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Derivadas de todas as séries já registradas, e não de uma tabela: recorde
   * gravado envelhece no dia em que uma execução é corrigida, e passaria a
   * dizer que a pessoa levantou um peso que ela apagou do histórico.
   *
   * Uma consulta só. Com um aluno de dois anos de casa isso é um punhado de
   * milhares de linhas — muito menos do que uma consulta por exercício, que é
   * o que a apuração de recorde do envio faz (lá vale, porque compara só os
   * exercícios daquela sessão).
   */
  async doAluno(alunoId: string): Promise<MeusRecordes> {
    const series = await this.prisma.serieExecutada.findMany({
      where: { execucao: { alunoId } },
      select: {
        exercicioId: true,
        cargaKg: true,
        repsFeitas: true,
        tipo: true,
        exercicio: { select: { nome: true } },
        execucao: { select: { iniciadoEm: true } },
      },
    });

    return montarMeusRecordes(
      series.map((s) => ({
        exercicioId: s.exercicioId,
        exercicioNome: s.exercicio.nome,
        cargaKg: Number(s.cargaKg),
        repsFeitas: s.repsFeitas,
        tipo: s.tipo,
        dia: s.execucao.iniciadoEm.toISOString().slice(0, 10),
      })),
    );
  }
}
