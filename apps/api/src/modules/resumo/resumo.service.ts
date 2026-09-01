import { Injectable } from '@nestjs/common';
import { EscopoDado, Papel, StatusCompromisso, StatusVinculo } from '@prisma/client';
import {
  ESCOPOS_ESSENCIAIS,
  estaSumido,
  type AlertaNoResumo,
  type AlunoSumido,
  type AutorizacaoPendente,
  type CompromissoDeHoje,
  type ResumoDoProfissional,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { consentimentoVigentePara } from '../../common/consentimento/regra';
import { PrismaService } from '../../infra/prisma.service';

/**
 * O resumo do profissional.
 *
 * Duas restrições moldaram este arquivo inteiro.
 *
 * **A primeira é o consentimento.** Um resumo é, por definição, leitura de dado
 * de muitos alunos de uma vez — exatamente o tipo de tela em que a regra de
 * acesso costuma ser esquecida, porque não há um `:alunoId` na rota para o
 * `ConsentGuard` conferir. Aqui o filtro é explícito: quem não autorizou
 * TREINO não entra na lista de sumidos, quem não autorizou CLINICO não tem
 * alerta lido. Não é uma verificação a mais — é a mesma regra, aplicada onde
 * nenhum guard alcança.
 *
 * **A segunda é o número de consultas.** A tentação era buscar os alunos e
 * depois perguntar por cada um; com sessenta alunos isso seria sessenta e uma
 * consultas a cada abertura da tela inicial. São seis, e seis continuam sendo
 * seis com seiscentos alunos: tudo que depende de aluno é resolvido com
 * `in: [ids]` ou `groupBy`.
 */

const MS_POR_DIA = 86_400_000;

/** Dias inteiros entre uma data e agora, nunca negativo. */
function diasAte(quando: Date, agora: Date): number {
  return Math.max(0, Math.floor((agora.getTime() - quando.getTime()) / MS_POR_DIA));
}

@Injectable()
export class ResumoService {
  constructor(private readonly prisma: PrismaService) {}

  async doProfissional(usuario: UsuarioAutenticado): Promise<ResumoDoProfissional> {
    const agora = new Date();

    const vinculos = await this.prisma.vinculo.findMany({
      where: { profissionalId: usuario.id, status: StatusVinculo.ATIVO },
      select: {
        alunoId: true,
        iniciadoEm: true,
        criadoEm: true,
        aluno: { select: { nome: true } },
      },
    });

    const convitesPendentes = await this.prisma.vinculo.count({
      where: { profissionalId: usuario.id, status: StatusVinculo.PENDENTE },
    });

    const alunoIds = vinculos.map((v) => v.alunoId);
    if (alunoIds.length === 0) {
      return {
        alunosAtivos: 0,
        convitesPendentes,
        sumidos: [],
        alertas: [],
        autorizacoesPendentes: [],
        agendaDeHoje: await this.agendaDeHoje(usuario.id, agora),
      };
    }

    /*
      Uma consulta traz os consentimentos de todos os alunos de uma vez. O
      `consentimentoVigentePara` é o mesmo que o guard usa — e existe como
      função justamente porque esta regra já divergiu uma vez, num relatório que
      ignorava o consentimento concedido à equipe inteira (`profissionalId`
      nulo) e mostrava aluno que autorizou tudo como se não tivesse autorizado
      nada.
    */
    const consentimentos = await this.prisma.consentimento.findMany({
      where: { alunoId: { in: alunoIds }, ...consentimentoVigentePara(usuario.id) },
      select: { alunoId: true, escopo: true },
    });

    const autorizados = new Map<string, Set<EscopoDado>>();
    for (const c of consentimentos) {
      const escopos = autorizados.get(c.alunoId) ?? new Set<EscopoDado>();
      escopos.add(c.escopo);
      autorizados.set(c.alunoId, escopos);
    }
    const autorizou = (alunoId: string, escopo: EscopoDado): boolean =>
      autorizados.get(alunoId)?.has(escopo) ?? false;

    const [sumidos, alertas, agendaDeHoje] = await Promise.all([
      this.sumidos(vinculos, autorizou, agora),
      this.alertas(alunoIds, usuario.papel, autorizou),
      this.agendaDeHoje(usuario.id, agora),
    ]);

    return {
      alunosAtivos: vinculos.length,
      convitesPendentes,
      sumidos,
      alertas,
      autorizacoesPendentes: this.pendencias(vinculos, usuario.papel, autorizou),
      agendaDeHoje,
    };
  }

  /**
   * Alunos sem registro de treino há tempo demais.
   *
   * Só entra quem autorizou TREINO — de quem não autorizou, o app **não sabe**
   * se sumiu, e listar como sumido seria afirmar o que não se mediu. Esse aluno
   * aparece na lista de autorizações pendentes, que é a informação verdadeira e
   * a que leva a uma ação possível.
   */
  private async sumidos(
    vinculos: Array<{ alunoId: string; iniciadoEm: Date | null; criadoEm: Date; aluno: { nome: string } }>,
    autorizou: (alunoId: string, escopo: EscopoDado) => boolean,
    agora: Date,
  ): Promise<AlunoSumido[]> {
    const visiveis = vinculos.filter((v) => autorizou(v.alunoId, EscopoDado.TREINO));
    if (visiveis.length === 0) return [];

    /*
      `groupBy` com `_max` resolve "o último treino de cada aluno" numa consulta
      só. A alternativa óbvia — um `findFirst` ordenado por aluno — seria uma
      consulta por pessoa, que é o N+1 que esta tela existe para não ter.
    */
    const ultimos = await this.prisma.execucaoTreino.groupBy({
      by: ['alunoId'],
      where: { alunoId: { in: visiveis.map((v) => v.alunoId) } },
      _max: { iniciadoEm: true },
    });
    const ultimoPorAluno = new Map(ultimos.map((u) => [u.alunoId, u._max.iniciadoEm]));

    return visiveis
      .map((v) => {
        const ultimo = ultimoPorAluno.get(v.alunoId) ?? null;
        // `iniciadoEm` nulo não deveria acontecer em vínculo ATIVO, mas o campo
        // é opcional no schema: cair no `criadoEm` é mais honesto que assumir.
        const desde = v.iniciadoEm ?? v.criadoEm;
        return {
          alunoId: v.alunoId,
          nome: v.aluno.nome,
          diasSemTreinar: ultimo === null ? null : diasAte(ultimo, agora),
          diasDeVinculo: diasAte(desde, agora),
        };
      })
      .filter((a) => estaSumido(a.diasSemTreinar, a.diasDeVinculo))
      // Mais tempo sumido primeiro: é quem corre mais risco de destravar o
      // vínculo antes de o profissional perceber.
      .sort(
        (a, b) =>
          (b.diasSemTreinar ?? b.diasDeVinculo) - (a.diasSemTreinar ?? a.diasDeVinculo),
      );
  }

  /**
   * Alertas clínicos não reconhecidos, endereçados ao meu papel.
   *
   * O personal entra aqui, e é de propósito: ele não vê marcador de exame
   * nenhum, e por isso precisa receber a orientação já derivada. O que ele não
   * pode ver é o número que a originou — e não vê, porque o alerta carrega
   * título e orientação, nunca o resultado.
   */
  private async alertas(
    alunoIds: string[],
    papel: Papel,
    autorizou: (alunoId: string, escopo: EscopoDado) => boolean,
  ): Promise<AlertaNoResumo[]> {
    const comClinico = alunoIds.filter((id) => autorizou(id, EscopoDado.CLINICO));
    if (comClinico.length === 0) return [];

    const encontrados = await this.prisma.alertaClinico.findMany({
      where: { alunoId: { in: comClinico }, papelDestino: papel, reconhecidoEm: null },
      select: {
        id: true,
        alunoId: true,
        titulo: true,
        severidade: true,
        criadoEm: true,
        aluno: { select: { nome: true } },
      },
      orderBy: { criadoEm: 'desc' },
      // Teto: um resumo com quarenta alertas deixa de ser resumo. Quem tem
      // mais que isso abre a ficha do aluno, que é onde a lista completa vive.
      take: 10,
    });

    return encontrados.map((a) => ({
      alertaId: a.id,
      alunoId: a.alunoId,
      alunoNome: a.aluno.nome,
      titulo: a.titulo,
      severidade: a.severidade,
      criadoEm: a.criadoEm.toISOString(),
    }));
  }

  /**
   * Quem está travado esperando autorização — a linha que nenhum concorrente
   * tem, porque nenhum deles tem consentimento por escopo.
   *
   * Sem isto o profissional descobre o bloqueio ao abrir a ficha e encontrar o
   * botão desligado, e a conclusão natural é "o app está quebrado".
   */
  private pendencias(
    vinculos: Array<{ alunoId: string; aluno: { nome: string } }>,
    papel: Papel,
    autorizou: (alunoId: string, escopo: EscopoDado) => boolean,
  ): AutorizacaoPendente[] {
    const essenciais = ESCOPOS_ESSENCIAIS[papel] ?? [];
    if (essenciais.length === 0) return [];

    return vinculos
      .map((v) => ({
        alunoId: v.alunoId,
        nome: v.aluno.nome,
        faltando: essenciais.filter((e) => !autorizou(v.alunoId, e as EscopoDado)),
      }))
      .filter((p) => p.faltando.length > 0);
  }

  /**
   * Compromissos de hoje.
   *
   * Cancelado fica de fora; "não compareceu" fica dentro, porque é justamente o
   * que o profissional precisa ver para decidir se cobra ou remarca.
   */
  private async agendaDeHoje(profissionalId: string, agora: Date): Promise<CompromissoDeHoje[]> {
    const inicio = new Date(agora);
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date(inicio);
    fim.setDate(fim.getDate() + 1);

    const compromissos = await this.prisma.compromisso.findMany({
      where: {
        profissionalId,
        inicioEm: { gte: inicio, lt: fim },
        status: { not: StatusCompromisso.CANCELADO },
      },
      select: {
        id: true,
        inicioEm: true,
        tipo: true,
        status: true,
        aluno: { select: { nome: true } },
      },
      orderBy: { inicioEm: 'asc' },
    });

    return compromissos.map((c) => ({
      id: c.id,
      alunoNome: c.aluno.nome,
      inicioEm: c.inicioEm.toISOString(),
      tipo: c.tipo,
      status: c.status,
    }));
  }
}
