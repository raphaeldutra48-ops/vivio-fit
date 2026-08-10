import { Injectable } from '@nestjs/common';
import { ordenarMarcas, type MarcaPessoal, type MeusRecordes } from '@vivio/contracts';
import { PrismaService } from '../../infra/prisma.service';
import { estimar1rm, seriesDeTrabalho } from './metricas';

type SerieComData = {
  exercicioId: string;
  cargaKg: number;
  repsFeitas: number;
  tipo: string;
  dia: string;
  exercicioNome: string;
};

@Injectable()
export class RecordesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * As marcas pessoais do aluno, uma por exercício.
   *
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

    const porExercicio = new Map<string, SerieComData[]>();
    for (const s of series) {
      const linha: SerieComData = {
        exercicioId: s.exercicioId,
        cargaKg: Number(s.cargaKg),
        repsFeitas: s.repsFeitas,
        tipo: s.tipo,
        dia: s.execucao.iniciadoEm.toISOString().slice(0, 10),
        exercicioNome: s.exercicio.nome,
      };
      const lista = porExercicio.get(s.exercicioId);
      if (lista) lista.push(linha);
      else porExercicio.set(s.exercicioId, [linha]);
    }

    const marcas: MarcaPessoal[] = [];
    for (const [exercicioId, todas] of porExercicio) {
      // Mesma regra do resto do app: aquecimento não vira recorde, a não ser
      // que seja tudo o que existe.
      const consideradas = seriesDeTrabalho(todas);
      if (consideradas.length === 0) continue;

      /*
        A série da carga máxima, e a MAIS ANTIGA em caso de empate: a data que
        interessa é a da conquista, não a da última vez que a pessoa repetiu o
        mesmo peso. Dizer "seu recorde é de ontem" quando ele foi batido há
        três meses e só repetido ontem tira o sentido do número.
      */
      const cargaMaxima = Math.max(...consideradas.map((s) => s.cargaKg));
      const diaDaCargaMaxima = consideradas
        .filter((s) => s.cargaKg === cargaMaxima)
        .map((s) => s.dia)
        .sort()[0]!;

      marcas.push({
        exercicioId,
        exercicioNome: consideradas[0]!.exercicioNome,
        cargaMaximaKg: cargaMaxima,
        cargaMaximaEm: diaDaCargaMaxima,
        melhor1rmKg: Math.max(...consideradas.map((s) => estimar1rm(s.cargaKg, s.repsFeitas))),
        volumeMaximoSerieKg: Math.max(...consideradas.map((s) => s.cargaKg * s.repsFeitas)),
        diasTreinados: new Set(consideradas.map((s) => s.dia)).size,
        ultimaEm: consideradas.map((s) => s.dia).sort().at(-1)!,
      });
    }

    return { total: marcas.length, marcas: ordenarMarcas(marcas) };
  }
}
