import { Injectable } from '@nestjs/common';
import { StatusPlano } from '@prisma/client';
import {
  SECAO_POR_GRUPO,
  SECOES_MERCADO,
  formatarQuantidade,
  type ItemDeCompra,
  type ListaDeCompras,
  type SecaoDaLista,
  type SecaoMercado,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';

@Injectable()
export class ComprasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista de compras derivada do plano ativo.
   *
   * Não existe tabela de lista: ela é sempre calculada do plano no momento em
   * que é pedida. Guardar uma cópia significaria manter duas verdades — e a
   * lista ficaria desatualizada assim que o nutricionista ajustasse a dieta.
   */
  async gerar(alunoId: string, dias: number): Promise<ListaDeCompras> {
    const plano = await this.prisma.planoDieta.findFirst({
      where: { alunoId, status: StatusPlano.ATIVO },
      include: {
        refeicoes: {
          orderBy: { ordem: 'asc' },
          include: { itens: { include: { alimento: true } } },
        },
      },
    });
    if (!plano) throw ErroDominio.naoEncontrado('Plano alimentar ativo');

    /** alimentoId -> acumulado. Um alimento repetido em refeições diferentes vira uma linha só. */
    const acumulado = new Map<
      string,
      {
        nome: string;
        grupo: string;
        medidaCaseira: string | null;
        medidaGramas: number | null;
        gramasPorDia: number;
        refeicoes: Set<string>;
      }
    >();

    for (const refeicao of plano.refeicoes) {
      for (const item of refeicao.itens) {
        const atual = acumulado.get(item.alimentoId) ?? {
          nome: item.alimento.nome,
          grupo: item.alimento.grupo,
          medidaCaseira: item.alimento.medidaCaseira,
          medidaGramas: item.alimento.medidaGramas === null ? null : Number(item.alimento.medidaGramas),
          gramasPorDia: 0,
          refeicoes: new Set<string>(),
        };
        atual.gramasPorDia += Number(item.quantidadeG);
        atual.refeicoes.add(refeicao.nome);
        acumulado.set(item.alimentoId, atual);
      }
    }

    const porSecao = new Map<SecaoMercado, ItemDeCompra[]>();

    for (const [alimentoId, dados] of acumulado) {
      const total = dados.gramasPorDia * dias;
      const secao = SECAO_POR_GRUPO[dados.grupo] ?? 'Outros';

      // "≈ 14 unidades" é mais útil na gôndola que "700 g de ovo".
      //
      // A medida caseira já vem com uma contagem embutida ("2 unidades" = 100 g,
      // "4 colheres de sopa" = 100 g). Ignorar esse número daria 7 unidades para
      // 700 g de ovo, quando são 14 — por isso ele multiplica, não é descartado.
      let equivalencia: string | null = null;
      if (dados.medidaGramas && dados.medidaGramas > 0 && dados.medidaCaseira) {
        const porMedida = Number(/^(\d+)/.exec(dados.medidaCaseira)?.[1] ?? 1);
        const unidade = dados.medidaCaseira.replace(/^\d+\s*/, '');
        const quantas = (total / dados.medidaGramas) * porMedida;
        equivalencia = `≈ ${Math.ceil(quantas)} ${unidade}`;
      }

      const item: ItemDeCompra = {
        alimentoId,
        nome: dados.nome,
        quantidadeTotalG: Math.round(total * 100) / 100,
        quantidadeFormatada: formatarQuantidade(total),
        equivalencia,
        aparecEm: [...dados.refeicoes],
      };

      (porSecao.get(secao) ?? porSecao.set(secao, []).get(secao)!).push(item);
    }

    // Ordem fixa das seções: é o caminho do supermercado, não alfabético.
    const secoes: SecaoDaLista[] = SECOES_MERCADO.filter((s) => porSecao.has(s)).map((secao) => ({
      secao,
      itens: (porSecao.get(secao) ?? []).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    }));

    return {
      planoNome: plano.nome,
      dias,
      totalItens: acumulado.size,
      secoes,
      geradaEm: new Date().toISOString(),
    };
  }
}
