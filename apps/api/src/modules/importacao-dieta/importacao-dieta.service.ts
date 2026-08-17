import { Injectable } from '@nestjs/common';
import { EscopoDado, Papel, Prisma, StatusVinculo } from '@prisma/client';
import {
  MAXIMO_DE_CANDIDATOS,
  PONTUACAO_MINIMA_PARA_SUGERIR,
  palavrasSignificativas,
  pontuarCandidato,
  type AlimentoCandidato,
  type DietaExtraida,
  type ItemLido,
  type LeituraDeDieta,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { consentimentoVigentePara } from '../../common/consentimento/regra';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';
import { LeitorDeDietaService } from './leitor-de-dieta.service';

@Injectable()
export class ImportacaoDietaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leitor: LeitorDeDietaService,
  ) {}

  /**
   * Lê o documento e devolve um rascunho para conferência.
   *
   * `alunoId` nulo é a importação do modelo do próprio profissional: o papel é
   * dele, não há dado de aluno saindo daqui, e por isso não há consentimento a
   * exigir. Com aluno, a exigência é dupla — ver a seção abaixo.
   */
  async importar(
    quemPede: UsuarioAutenticado,
    chave: string,
    mimeType: string,
    alunoId: string | null,
  ): Promise<LeituraDeDieta> {
    if (quemPede.papel === Papel.ALUNO) {
      throw ErroDominio.papelNaoAutorizado('Só profissionais importam dieta.');
    }
    /*
      A chave vem do cliente. Sem esta conferência, dava para mandar ler o
      arquivo de outra pessoa — inclusive um laudo de exame — só sabendo a
      chave dele.
    */
    if (!chave.startsWith(`materiais/${quemPede.id}/`)) {
      throw ErroDominio.conflito('Chave de arquivo não pertence a você.');
    }

    if (alunoId !== null) await this.exigirAutorizacoes(quemPede, alunoId);

    const extraida = await this.leitor.ler(chave, mimeType);
    return this.casarComCatalogo(extraida, quemPede.id);
  }

  /**
   * O que o aluno precisa ter autorizado.
   *
   * Duas coisas distintas, e é por isso que são dois consentimentos:
   *
   * `NUTRICAO` é quem pode ver a dieta dele — a autorização que ele já dá para
   * o profissional acompanhar. `LEITURA_AUTOMATICA` é outra pergunta: se o
   * documento de saúde dele pode ser enviado a um serviço de terceiro, fora do
   * país, para ser lido por máquina. Quem autoriza o profissional a ver não
   * autorizou, com isso, uma empresa estrangeira a processar.
   *
   * A LGPD trata dado de saúde como sensível e pede consentimento específico e
   * destacado para cada finalidade. Reaproveitar o de nutrição aqui seria usar
   * um "sim" dado para outra pergunta.
   */
  private async exigirAutorizacoes(quemPede: UsuarioAutenticado, alunoId: string): Promise<void> {
    const vinculo = await this.prisma.vinculo.findFirst({
      where: { alunoId, profissionalId: quemPede.id, status: StatusVinculo.ATIVO },
      select: { id: true },
    });
    if (!vinculo) throw ErroDominio.naoEncontrado('Aluno');

    const consentimentos = await this.prisma.consentimento.findMany({
      where: {
        alunoId,
        escopo: { in: [EscopoDado.NUTRICAO, EscopoDado.LEITURA_AUTOMATICA] },
        ...consentimentoVigentePara(quemPede.id),
      },
      select: { escopo: true },
    });
    const tem = new Set(consentimentos.map((c) => c.escopo));

    if (!tem.has(EscopoDado.NUTRICAO)) {
      throw ErroDominio.consentimentoAusente(EscopoDado.NUTRICAO);
    }
    if (!tem.has(EscopoDado.LEITURA_AUTOMATICA)) {
      throw ErroDominio.consentimentoAusente(EscopoDado.LEITURA_AUTOMATICA);
    }
  }

  /**
   * Cada nome lido vira candidatos do catálogo.
   *
   * A busca é por palavra significativa, e não por `contains` do texto inteiro:
   * "arroz branco cozido" não casaria com "Arroz, branco, cozido" num LIKE, e o
   * documento nunca escreve igual ao catálogo.
   */
  private async casarComCatalogo(
    extraida: DietaExtraida,
    profissionalId: string,
  ): Promise<LeituraDeDieta> {
    const nomes = extraida.refeicoes.flatMap((r) => r.itens.map((i) => i.nomeLido));
    const catalogo = await this.buscarCandidatos(nomes, profissionalId);

    let semCandidato = 0;
    const refeicoes = extraida.refeicoes.map((r) => ({
      nome: r.nome,
      horarioSugerido: r.horarioSugerido,
      itens: r.itens.map((i): ItemLido => {
        const candidatos = this.melhoresCandidatos(i.nomeLido, catalogo);
        if (candidatos.length === 0) semCandidato += 1;

        const melhor = candidatos[0];
        const pontuacaoDoMelhor = melhor ? pontuarCandidato(i.nomeLido, melhor.nome) : 0;

        return {
          textoOriginal: i.textoOriginal,
          nomeLido: i.nomeLido,
          quantidadeG: i.quantidadeG,
          medidaCaseiraLida: i.medidaCaseiraLida,
          observacao: i.observacao,
          candidatos,
          alimentoIdSugerido:
            melhor && pontuacaoDoMelhor >= PONTUACAO_MINIMA_PARA_SUGERIR ? melhor.id : null,
        };
      }),
    }));

    return {
      nome: extraida.nome,
      observacao: extraida.observacao,
      kcalAlvo: extraida.kcalAlvo,
      proteinaAlvoG: extraida.proteinaAlvoG,
      carboAlvoG: extraida.carboAlvoG,
      gorduraAlvoG: extraida.gorduraAlvoG,
      refeicoes,
      avisos: extraida.avisos,
      itensSemCandidato: semCandidato,
    };
  }

  /**
   * Uma consulta só para a dieta inteira.
   *
   * Uma dieta tem umas 25 linhas; consultar por linha seriam 25 idas ao banco
   * para montar uma tela. Buscamos o conjunto das palavras de todos os itens e
   * pontuamos em memória.
   */
  private async buscarCandidatos(
    nomes: string[],
    profissionalId: string,
  ): Promise<AlimentoCandidato[]> {
    const palavras = [...new Set(nomes.flatMap(palavrasSignificativas))];
    if (palavras.length === 0) return [];

    const alimentos = await this.prisma.alimento.findMany({
      where: {
        // O catálogo público mais o que este profissional cadastrou. A
        // biblioteca particular de outro não entra.
        OR: [{ criadoPorId: null }, { criadoPorId: profissionalId }],
        AND: [
          {
            OR: palavras.map((p) => ({
              nome: { contains: p, mode: Prisma.QueryMode.insensitive },
            })),
          },
        ],
      },
      select: {
        id: true,
        nome: true,
        medidaCaseira: true,
        medidaGramas: true,
        kcal: true,
      },
      // Teto largo: passa de mil alimentos, a pontuação em memória fica cara e
      // a busca por palavra estava larga demais para servir de sugestão.
      take: 1000,
    });

    return alimentos.map((a) => ({
      id: a.id,
      nome: a.nome,
      medidaCaseira: a.medidaCaseira,
      medidaGramas: a.medidaGramas === null ? null : Number(a.medidaGramas),
      kcalPor100g: Number(a.kcal),
    }));
  }

  private melhoresCandidatos(
    nomeLido: string,
    catalogo: AlimentoCandidato[],
  ): AlimentoCandidato[] {
    return catalogo
      .map((a) => ({ alimento: a, pontos: pontuarCandidato(nomeLido, a.nome) }))
      .filter((c) => c.pontos > 0)
      .sort((a, b) => b.pontos - a.pontos || a.alimento.nome.localeCompare(b.alimento.nome, 'pt-BR'))
      .slice(0, MAXIMO_DE_CANDIDATOS)
      .map((c) => c.alimento);
  }
}
