/**
 * Lê a dieta que está no papel — a única coisa que a API ainda fazia.
 *
 * Transforma um PDF ou a foto de uma folha em texto estruturado. Não decide
 * alimento do catálogo, não salva nada, não julga a dieta: quem casa com o
 * catálogo é o SDK, com a função que mora em `@vivio/contracts`, e quem aprova é
 * o profissional, na tela.
 *
 * ## Por que isto não é uma função do banco
 *
 * Porque precisa de uma chave de API e de uma chamada à internet. O Postgres não
 * é lugar para nenhuma das duas. O que É do banco ficou lá: a pergunta sobre
 * autorização (`falta_para_ler_dieta`), que esta função faz antes de mandar
 * qualquer byte para fora.
 *
 * ## O que ela confere, e por quê
 *
 * 1. **Sessão.** A função roda com o token de quem chamou, não com a chave de
 *    serviço. Sem token, o Supabase nem chega aqui.
 * 2. **A chave do arquivo é dele.** `materiais/<eu>/…`. Sem esta conferência,
 *    bastava saber a chave alheia para mandar ler o arquivo de outra pessoa —
 *    inclusive um laudo de exame.
 * 3. **As duas autorizações.** Pergunta ao banco, que responde o que falta. Ver
 *    a dieta e mandá-la a um serviço estrangeiro são permissões diferentes.
 *
 * ## Implantar
 *
 *   supabase functions deploy ler-dieta
 *   supabase secrets set ANTHROPIC_API_KEY=...
 *
 * Sem o segredo, a função responde 503 com o motivo — e a tela mostra que a
 * leitura automática não está configurada, em vez de um erro sem explicação.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.117.1';

/**
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

/** O mesmo schema do zod, em JSON Schema, para a API garantir o formato. */
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
};

/** As frases que a tela mostra, uma por motivo que o banco devolve. */
const RECUSA: Record<string, { codigo: string; mensagem: string; status: number }> = {
  SESSAO: { codigo: 'NAO_AUTENTICADO', mensagem: 'Sua sessão expirou. Entre de novo.', status: 401 },
  PAPEL: {
    codigo: 'PAPEL_NAO_AUTORIZADO',
    mensagem: 'Só profissionais importam dieta.',
    status: 403,
  },
  VINCULO: { codigo: 'RECURSO_NAO_ENCONTRADO', mensagem: 'Aluno não encontrado.', status: 404 },
  NUTRICAO: {
    codigo: 'CONSENTIMENTO_AUSENTE',
    mensagem: 'O aluno ainda não autorizou o acompanhamento nutricional.',
    status: 403,
  },
  LEITURA_AUTOMATICA: {
    codigo: 'CONSENTIMENTO_AUSENTE',
    mensagem:
      'O aluno ainda não autorizou a leitura automática de documentos. ' +
      'É uma autorização separada, porque o documento sai do app para ser lido por máquina.',
    status: 403,
  },
};

const JSON_UTF8 = { 'Content-Type': 'application/json; charset=utf-8' };

function erro(codigo: string, mensagem: string, status: number, detalhes?: unknown): Response {
  return new Response(JSON.stringify({ codigo, mensagem, detalhes }), {
    status,
    headers: JSON_UTF8,
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return erro('METODO_INVALIDO', 'Use POST.', 405);

  const autorizacao = req.headers.get('Authorization');
  if (!autorizacao) {
    return erro('NAO_AUTENTICADO', 'Sua sessão expirou. Entre de novo.', 401);
  }

  let corpo: { chave?: string; mimeType?: string; alunoId?: string | null };
  try {
    corpo = await req.json();
  } catch {
    return erro('DADOS_INVALIDOS', 'Corpo do pedido inválido.', 422);
  }

  const { chave, mimeType, alunoId = null } = corpo;
  if (!chave || !mimeType) {
    return erro('DADOS_INVALIDOS', 'Informe a chave do arquivo e o tipo.', 422);
  }

  const chaveDaApi = Deno.env.get('ANTHROPIC_API_KEY');
  if (!chaveDaApi) {
    /*
      Sem a chave, a leitura fica indisponível e o resto do app segue. Derrubar
      com 500 faria a tela dizer "erro inesperado" sobre uma configuração que
      falta — e ninguém saberia o que configurar.
    */
    return erro(
      'CONFLITO',
      'A leitura automática não está configurada.',
      503,
      { faltando: 'ANTHROPIC_API_KEY' },
    );
  }

  /*
    O cliente usa o token de QUEM CHAMOU, não a chave de serviço: tudo o que
    esta função lê do banco e do armazenamento passa pelas mesmas políticas que
    valeriam se a pessoa tivesse consultado direto.
  */
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: autorizacao } }, auth: { persistSession: false } },
  );

  const { data: falta, error: erroDaPergunta } = await supabase.rpc('falta_para_ler_dieta', {
    p_aluno_id: alunoId,
  });
  if (erroDaPergunta) {
    return erro('ERRO_INTERNO', 'Não foi possível conferir a autorização.', 500);
  }
  if (falta) {
    const r = RECUSA[falta] ?? {
      codigo: 'ACESSO_NEGADO',
      mensagem: 'Você não tem acesso a este conteúdo.',
      status: 403,
    };
    return erro(r.codigo, r.mensagem, r.status, { escopo: falta });
  }

  /*
    A chave tem de ser de um arquivo DELE. Sem esta conferência, bastava saber a
    chave alheia para mandar ler o arquivo de outra pessoa — inclusive um laudo
    de exame, que é o documento mais restrito do app.

    A pergunta é feita aqui e no Storage: o download abaixo usa a sessão dele, e
    a política do compartimento recusaria de qualquer jeito. Esta é a que dá a
    frase; a de lá é a que vale.
  */
  /*
    Quem é o dono da pasta vem do BANCO, e não de `auth.getUser()`.

    A primeira versão lia `vivio_id` do metadata e caía no id do Auth quando não
    achava. Só que o hook do token põe `vivio_id` nas CLAIMS, não no metadata —
    e os dois ids são diferentes em toda conta que nasceu antes do Supabase Auth
    (as sete de hoje, todas). O efeito: a chave `materiais/<id do app>/...`, que
    é a que o Storage exige, nunca batia com o id comparado aqui, e a importação
    recusava com "chave não pertence a você" para todo mundo.

    `usuario_atual()` deriva o id da claim do token já verificado — é a mesma
    função que as políticas usam para decidir tudo o mais.
  */
  const { data: meuId } = await supabase.rpc('usuario_atual');
  if (!meuId || !chave.startsWith(`materiais/${meuId}/`)) {
    return erro('CONFLITO', 'Chave de arquivo não pertence a você.', 409);
  }

  const caminho = chave.slice('materiais/'.length);
  const { data: arquivo, error: erroDoArquivo } = await supabase.storage
    .from('materiais')
    .download(caminho);
  if (erroDoArquivo || !arquivo) {
    return erro('RECURSO_NAO_ENCONTRADO', 'Arquivo não encontrado.', 404);
  }

  const base64 = btoa(
    String.fromCharCode(...new Uint8Array(await arquivo.arrayBuffer())),
  );

  /*
    PDF vai como documento e foto como imagem — são blocos diferentes na API, e
    mandar PDF como imagem faz o modelo receber lixo binário.
  */
  const documento =
    mimeType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } };

  const anthropic = new Anthropic({ apiKey: chaveDaApi });

  let resposta;
  try {
    resposta = await anthropic.messages.create({
      model: MODELO,
      max_tokens: MAXIMO_DE_TOKENS,
      system: INSTRUCAO,
      // Saída estruturada: o formato não é pedido em prosa e torcido para dar
      // certo — a API garante que a resposta obedece ao schema.
      output_config: { format: { type: 'json_schema', schema: SCHEMA_DA_DIETA } },
      messages: [
        {
          role: 'user',
          content: [documento, { type: 'text', text: 'Transcreva este plano alimentar.' }],
        },
      ],
    });
  } catch (e) {
    console.error('falha na leitura:', e);
    return erro('ERRO_INTERNO', 'A leitura falhou. Tente de novo em alguns instantes.', 502);
  }

  const texto = resposta.content.find((b: { type: string }) => b.type === 'text');
  if (!texto || texto.type !== 'text') {
    return erro(
      'CONFLITO',
      'A leitura não devolveu conteúdo. Tente enviar o arquivo de novo.',
      409,
    );
  }

  console.log(
    `dieta lida: ${resposta.usage.input_tokens} tokens de entrada, ` +
      `${resposta.usage.output_tokens} de saída`,
  );

  /*
    Devolve o que o modelo leu, cru. Quem valida contra o contrato é o SDK, com
    o mesmo zod que a tela usa — a saída estruturada garante o FORMATO, não os
    limites do domínio, e nada impede o modelo de devolver 9000 g num item.
  */
  return new Response(texto.text, { status: 200, headers: JSON_UTF8 });
});
