import Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { dietaExtraidaSchema, type DietaExtraida } from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { ARMAZENAMENTO, type Armazenamento } from '../midia/armazenamento';

/**
 * Lê a dieta que está no papel.
 *
 * Só isso: transforma o documento em texto estruturado. Não decide alimento do
 * catálogo, não salva nada, não julga a dieta. Quem casa com o catálogo é o
 * serviço ao lado; quem aprova é o profissional, na tela.
 *
 * O modelo é o Opus 5 porque o caso difícil aqui é manuscrito — letra de médico
 * em folha torta fotografada de lado. Num PDF digitado quase qualquer modelo
 * acerta; é na foto ruim que a diferença aparece, e é a foto ruim que chega.
 */

const MODELO = 'claude-opus-5';

/**
 * Teto por leitura. Uma dieta extensa (6 refeições, 30 itens) cabe folgada em
 * 8 mil tokens; o teto existe para um documento inesperado — um livro inteiro
 * enviado por engano — não virar uma conta alta em silêncio.
 */
const MAXIMO_DE_TOKENS = 8000;

const INSTRUCAO = `Você transcreve planos alimentares. Recebe um PDF ou a foto de uma folha, muitas vezes manuscrita, e devolve o conteúdo estruturado.

Regras que não se quebram:

1. Transcreva o que está escrito. Não corrija a dieta, não complete refeição que falta, não acrescente alimento que "faria sentido". Se o papel tem só duas refeições, devolva duas.

2. \`quantidadeG\` só quando o documento diz peso em gramas. Se diz "1 xícara", "2 colheres", "1 unidade", deixe \`quantidadeG\` como null e ponha o texto em \`medidaCaseiraLida\`. Converter medida caseira em grama depende do alimento e não é seu trabalho.

3. \`textoOriginal\` é a linha como está no papel, incluindo abreviação e erro de grafia. É o que a pessoa vai conferir contra o documento.

4. \`nomeLido\` é só o alimento, sem quantidade: de "150g de arroz branco" o nome é "arroz branco".

5. O que você não conseguir ler com segurança — rasura, número cortado, palavra ilegível — vai para \`avisos\`, em uma frase que diga onde está o problema. Não adivinhe número. Se o valor está ilegível, deixe null e avise.

6. Se o documento não for um plano alimentar, devolva \`refeicoes\` vazio e explique em \`avisos\`.`;

@Injectable()
export class LeitorDeDietaService {
  private readonly logger = new Logger(LeitorDeDietaService.name);
  private readonly cliente: Anthropic | null;

  constructor(
    private readonly config: ConfigService,
    @Inject(ARMAZENAMENTO) private readonly armazenamento: Armazenamento,
  ) {
    const chave = this.config.get<string>('ANTHROPIC_API_KEY');
    /*
      Sem chave o serviço sobe e só a importação fica indisponível. Derrubar a
      API inteira porque um recurso opcional não está configurado deixaria o
      app fora do ar por causa de uma função que ninguém tinha usado ainda.
    */
    this.cliente = chave ? new Anthropic({ apiKey: chave }) : null;
    if (!chave) {
      this.logger.warn('ANTHROPIC_API_KEY ausente — a leitura de dieta fica desligada.');
    }
  }

  get disponivel(): boolean {
    return this.cliente !== null;
  }

  async ler(chave: string, mimeType: string): Promise<DietaExtraida> {
    if (!this.cliente) {
      throw ErroDominio.conflito(
        'A leitura automática não está configurada neste servidor.',
        { faltando: 'ANTHROPIC_API_KEY' },
      );
    }

    const bytes = await this.armazenamento.ler(chave);
    const base64 = bytes.toString('base64');

    /*
      PDF vai como documento e foto como imagem — são blocos diferentes na API,
      e mandar PDF como imagem faz o modelo receber lixo binário.
    */
    const documento =
      mimeType === 'application/pdf'
        ? ({
            type: 'document' as const,
            source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 },
          })
        : ({
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
              data: base64,
            },
          });

    const resposta = await this.cliente.messages.create({
      model: MODELO,
      max_tokens: MAXIMO_DE_TOKENS,
      system: INSTRUCAO,
      /*
        Saída estruturada: o formato não é pedido em prosa e torcido para dar
        certo — a API garante que a resposta obedece ao schema. Sem isto seria
        preciso um analisador tolerante e uma repetição quando viesse torto.
      */
      output_config: { format: { type: 'json_schema', schema: SCHEMA_DA_DIETA } },
      messages: [
        {
          role: 'user',
          content: [documento, { type: 'text', text: 'Transcreva este plano alimentar.' }],
        },
      ],
    });

    const texto = resposta.content.find((b) => b.type === 'text');
    if (!texto || texto.type !== 'text') {
      throw ErroDominio.conflito('A leitura não devolveu conteúdo. Tente enviar o arquivo de novo.');
    }

    /*
      A saída estruturada garante o FORMATO, não os limites do domínio: nada
      impede o modelo de devolver 9000 g num item. O zod é a segunda porta, e é
      ela que impede um número absurdo de chegar à tela como se fosse leitura.
    */
    const analisado = dietaExtraidaSchema.safeParse(JSON.parse(texto.text));
    if (!analisado.success) {
      this.logger.warn(`leitura fora do contrato: ${analisado.error.message}`);
      throw ErroDominio.conflito(
        'A leitura veio com dados fora do esperado. Tente uma foto mais nítida ou o PDF original.',
      );
    }

    this.logger.log(
      `dieta lida: ${analisado.data.refeicoes.length} refeições, ` +
        `${resposta.usage.input_tokens} tokens de entrada, ${resposta.usage.output_tokens} de saída`,
    );
    return analisado.data;
  }
}

/**
 * O schema em JSON Schema, para a API.
 *
 * Duplica o `dietaExtraidaSchema` do zod de propósito: um valida a saída do
 * modelo em tempo de execução, o outro instrui a API sobre o formato. Gerar um
 * do outro traria uma dependência a mais para economizar trinta linhas que não
 * mudam.
 */
const SCHEMA_DA_DIETA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'nome',
    'observacao',
    'kcalAlvo',
    'proteinaAlvoG',
    'carboAlvoG',
    'gorduraAlvoG',
    'refeicoes',
    'avisos',
  ],
  properties: {
    nome: { type: 'string', description: 'Título do plano; se não houver, descreva em poucas palavras.' },
    observacao: { type: ['string', 'null'], description: 'Orientações gerais escritas no documento.' },
    kcalAlvo: { type: ['integer', 'null'] },
    proteinaAlvoG: { type: ['integer', 'null'] },
    carboAlvoG: { type: ['integer', 'null'] },
    gorduraAlvoG: { type: ['integer', 'null'] },
    avisos: {
      type: 'array',
      items: { type: 'string' },
      description: 'O que não deu para ler com segurança, e onde.',
    },
    refeicoes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nome', 'horarioSugerido', 'itens'],
        properties: {
          nome: { type: 'string' },
          horarioSugerido: { type: ['string', 'null'], description: 'HH:MM, só se o documento diz.' },
          itens: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['textoOriginal', 'nomeLido', 'quantidadeG', 'medidaCaseiraLida', 'observacao'],
              properties: {
                textoOriginal: { type: 'string' },
                nomeLido: { type: 'string' },
                quantidadeG: { type: ['number', 'null'], description: 'Só quando o papel diz gramas.' },
                medidaCaseiraLida: { type: ['string', 'null'] },
                observacao: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
    },
  },
} as const;
