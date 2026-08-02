import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  Classificacao,
  Papel,
  classificarMarcador,
  referenciaDe,
  type ExameResumo,
  type Marcador,
  type MarcadorNoExame,
  type RegistrarExameInput,
  type SexoBiologico,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';
import { AlertasService } from '../alertas/alertas.service';
import { podeVerArquivo, podeVerMarcador } from './escopo';

type LinhaExame = Prisma.ExameGetPayload<{
  include: {
    registradoPor: { select: { id: true; nome: true } };
    resultados: true;
  };
}>;

@Injectable()
export class ExamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alertas: AlertasService,
  ) {}

  async listar(alunoId: string, papel: Papel): Promise<ExameResumo[]> {
    const exames = await this.prisma.exame.findMany({
      where: { alunoId, deletadoEm: null },
      include: {
        registradoPor: { select: { id: true, nome: true } },
        resultados: true,
      },
      orderBy: { dataColeta: 'desc' },
      take: 60,
    });

    return exames.map((e) => this.paraResumo(e, papel));
  }

  async obter(alunoId: string, exameId: string, papel: Papel): Promise<ExameResumo> {
    const exame = await this.prisma.exame.findFirst({
      where: { id: exameId, alunoId, deletadoEm: null },
      include: {
        registradoPor: { select: { id: true, nome: true } },
        resultados: true,
      },
    });

    if (!exame) throw ErroDominio.naoEncontrado('Exame');
    return this.paraResumo(exame, papel);
  }

  /**
   * Registra o exame com a classificação **congelada**.
   *
   * A tabela de referências evolui; o que o profissional viu e discutiu com o
   * paciente não pode mudar sozinho depois. Reclassificar é ação explícita.
   */
  async registrar(
    alunoId: string,
    autorId: string,
    papel: Papel,
    dados: RegistrarExameInput,
  ): Promise<ExameResumo> {
    // Quem registra só pode lançar o que pode ver. Sem isto, o nutricionista
    // digitaria um TSH e o receberia de volta filtrado — dado gravado que o
    // autor não pode reler é pior que a recusa.
    const foraDoEscopo = dados.resultados
      .map((r) => r.marcador)
      .filter((m) => !podeVerMarcador(papel, m));

    if (foraDoEscopo.length > 0) {
      throw ErroDominio.papelNaoAutorizado(
        `Estes marcadores exigem avaliação médica: ${foraDoEscopo
          .map((m) => referenciaDe(m).rotulo)
          .join(', ')}.`,
      );
    }

    const dataColeta = new Date(dados.dataColeta.toISOString().slice(0, 10));

    const exame = await this.prisma.exame.create({
      data: {
        alunoId,
        registradoPorId: autorId,
        laboratorio: dados.laboratorio.trim(),
        dataColeta,
        sexo: dados.sexo,
        observacao: dados.observacao,
        resultados: {
          create: dados.resultados.map((r) => ({
            marcador: r.marcador,
            valor: r.valor,
            classificacao: classificarMarcador(r.marcador, r.valor, dados.sexo).classificacao,
          })),
        },
      },
      include: {
        registradoPor: { select: { id: true, nome: true } },
        resultados: true,
      },
    });

    /*
      Os alertas cruzados nascem aqui — é o registro do exame que avisa o resto
      da equipe de cuidado. Fica FORA da transação de propósito: se a geração
      falhar, o exame continua gravado e correto. Perder um aviso é ruim;
      perder o exame que o profissional acabou de digitar é pior, e a geração é
      idempotente (a unique por regra + exame deixa reprocessar).
    */
    await this.alertas.gerarParaExame(
      alunoId,
      exame.id,
      exame.resultados.map((r) => ({
        marcador: r.marcador as Marcador,
        valor: Number(r.valor),
        classificacao: r.classificacao as Classificacao,
      })),
      dados.sexo,
    );

    return this.paraResumo(exame, papel);
  }

  private paraResumo(e: LinhaExame, papel: Papel): ExameResumo {
    const sexo = e.sexo as SexoBiologico;

    const resultados: MarcadorNoExame[] = e.resultados
      .filter((r) => podeVerMarcador(papel, r.marcador as Marcador))
      .map((r) => {
        const marcador = r.marcador as Marcador;
        const ref = referenciaDe(marcador);
        // Recalcula só as faixas para exibição; a classificação vem gravada.
        const { laboratorial, funcional } = classificarMarcador(marcador, Number(r.valor), sexo);

        return {
          marcador,
          rotulo: ref.rotulo,
          unidade: ref.unidade,
          sistema: ref.sistema,
          valor: Number(r.valor),
          classificacao: r.classificacao as Classificacao,
          laboratorial,
          funcional,
          fonteLaboratorial: ref.fonteLaboratorial,
          fonteFuncional: ref.fonteFuncional,
          nota: ref.nota,
        };
      });

    const contagem = {
      [Classificacao.OTIMO]: 0,
      [Classificacao.ATENCAO]: 0,
      [Classificacao.CRITICO]: 0,
    };
    for (const r of resultados) contagem[r.classificacao] += 1;

    return {
      id: e.id,
      laboratorio: e.laboratorio,
      dataColeta: e.dataColeta.toISOString().slice(0, 10),
      sexo,
      observacao: e.observacao,
      registradoPor: e.registradoPor,
      resultados,
      // Conta só o que este papel enxerga: dizer "45 marcadores" e listar 16
      // seria pior que não dizer nada.
      contagem,
      // Link assinado ainda não é emitido (o upload entra junto com o storage
      // externo, pendência 19). Quando entrar, é aqui que `podeVerArquivo`
      // decide — e só médico e aluno recebem URL.
      arquivoUrl: null,
      // Existir arquivo não é segredo: o nutricionista saber que ele existe é
      // honesto e ainda lhe permite pedir a leitura ao médico. O que ele nunca
      // recebe é o conteúdo.
      temArquivo: e.chaveArquivo !== null,
    };
  }
}
