import {
  Classificacao,
  REFERENCIAS,
  SexoBiologico,
  TipoCondicao,
  faixaPara,
  type Faixa,
  type Marcador,
} from '@vivio/contracts';
import { REGRAS } from './regras';
import { CUIDADO_POR_REGIAO, alertasDaCondicao } from './regras-condicao';

/**
 * As linhas que o banco **deveria** ter, calculadas da fonte em TypeScript.
 *
 * Três tabelas — `FaixaMarcador`, `MarcadorEscopo` e `RegraDeAlerta` — nascem
 * VAZIAS das migrações e só são preenchidas por `exportar-regras`, que precisa
 * do banco na mão. Enquanto não rodar, o comportamento é falha fechada em três
 * direções, e nenhuma delas aparece como erro em tela:
 *
 * - `classificar_marcador` não acha a faixa e devolve `ATENCAO` — todo
 *   resultado sai marcado para olhar, inclusive os perfeitos;
 * - o laço do gatilho não acha regra e **nenhum alerta cruzado nasce**, que é
 *   justamente o diferencial do produto;
 * - `pode_ver_marcador` não acha escopo e o nutricionista não vê marcador
 *   nenhum.
 *
 * Nada disso quebra: o app fica silenciosamente menor do que promete.
 *
 * Este módulo existe para que haja **uma** derivação, e não duas. Antes, quem
 * exportava era um script que só roda contra produção, e por isso não tinha
 * teste — e o comentário dentro do SQL já dizia que o risco era "o exportador
 * ficar para trás do TypeScript". Agora o exportador grava o que daqui sai, e o
 * diagnóstico compara o banco com o que daqui sai. Divergência passa a ser
 * detectável sem ninguém reparar à mão.
 */

export interface LinhaDeFaixa {
  marcador: string;
  sexo: SexoBiologico;
  labMin: number | null;
  labMax: number | null;
  funcMin: number | null;
  funcMax: number | null;
}

export interface LinhaDeEscopo {
  marcador: string;
  escopo: string;
}

export interface LinhaDeRegra {
  id: string;
  origem: 'MARCADOR' | 'CONDICAO';
  marcador: string | null;
  quando: string[];
  lado: 'ABAIXO' | 'ACIMA' | null;
  limites: Record<string, number> | undefined;
  tipoCondicao: string | null;
  regiao: string | null;
  papelDestino: string;
  severidade: string;
  titulo: string;
  orientacao: string;
  ativa: boolean;
}

/**
 * Texto improvável numa descrição de verdade, para achá-lo depois.
 *
 * A regra de condição interpola a descrição que o profissional escreveu, e ela
 * só existe na hora do alerta. Chamamos a função com a sentinela e trocamos
 * pelo marcador `{descricao}`, que o gatilho substitui.
 */
const SENTINELA = 'DESCRICAO';

/** O limite que `lado` compara, por sexo. `*` quando a faixa é única. */
export function limitesDe(marcador: Marcador, lado: 'ABAIXO' | 'ACIMA'): Record<string, number> {
  const { funcional } = REFERENCIAS[marcador];
  const bordaDe = (f: Faixa): number | undefined => (lado === 'ABAIXO' ? f.min : f.max);

  if ('min' in funcional || 'max' in funcional) {
    const v = bordaDe(funcional as Faixa);
    return v === undefined ? {} : { '*': v };
  }

  const porSexo = funcional as Record<SexoBiologico, Faixa>;
  const saida: Record<string, number> = {};
  for (const sexo of Object.keys(porSexo)) {
    const v = bordaDe(porSexo[sexo as SexoBiologico]);
    if (v !== undefined) saida[sexo] = v;
  }
  return saida;
}

/**
 * Uma linha por (marcador, sexo).
 *
 * Os dois sexos sempre, mesmo quando a faixa é única: o gatilho busca por
 * `marcador = x and sexo = y`, e faltar a linha de um sexo faria aquele exame
 * cair no padrão `ATENCAO` só por causa do sexo de quem fez.
 */
export function faixasEsperadas(): LinhaDeFaixa[] {
  const saida: LinhaDeFaixa[] = [];
  for (const [marcador, ref] of Object.entries(REFERENCIAS)) {
    for (const sexo of ['M', 'F'] as SexoBiologico[]) {
      const lab = faixaPara(ref.laboratorial, sexo);
      const func = faixaPara(ref.funcional, sexo);
      saida.push({
        marcador,
        sexo,
        labMin: lab.min ?? null,
        labMax: lab.max ?? null,
        funcMin: func.min ?? null,
        funcMax: func.max ?? null,
      });
    }
  }
  return saida;
}

/** Uma linha por marcador: quem pode ver o quê. */
export function escoposEsperados(): LinhaDeEscopo[] {
  return Object.entries(REFERENCIAS).map(([marcador, ref]) => ({
    marcador,
    escopo: ref.escopo,
  }));
}

/**
 * As regras, de marcador e de condição.
 *
 * Nada é transcrito. As de condição saem de **chamar** `alertasDaCondicao`, a
 * mesma função que a API usava — porque a primeira versão do exportador
 * transcreveu à mão e esqueceu alergia alimentar, gestação, medicação
 * contínua, doença crônica, restrição e cirurgia. No dia em que a API parou de
 * derivar, esses avisos deixaram de existir.
 */
export function regrasEsperadas(): LinhaDeRegra[] {
  const saida: LinhaDeRegra[] = [];

  for (const regra of REGRAS) {
    for (const aviso of regra.avisos) {
      // Uma linha por (regra, papel): cada papel recebe texto próprio, e é
      // isso que faz o personal ler conduta sem ler o marcador.
      saida.push({
        id: `${regra.id}:${aviso.papel}`,
        origem: 'MARCADOR',
        marcador: regra.marcador,
        quando: regra.quando as unknown as string[],
        lado: regra.lado ?? null,
        limites: regra.lado ? limitesDe(regra.marcador, regra.lado) : undefined,
        tipoCondicao: null,
        regiao: null,
        papelDestino: aviso.papel,
        /*
          Guardada, e ignorada pelo gatilho de marcador de propósito: a
          severidade de verdade vem da CLASSIFICAÇÃO do resultado — o mesmo
          achado pesa diferente se veio ATENCAO ou CRITICO. A coluna fica como
          valor de referência da regra, para a tela de curadoria.
        */
        severidade: regra.quando.includes(Classificacao.CRITICO as never) ? 'ALTA' : 'MEDIA',
        titulo: aviso.titulo,
        orientacao: aviso.orientacao,
        ativa: true,
      });
    }
  }

  /*
    LESAO e CIRURGIA_RECENTE dependem da região — uma linha por região. Os
    outros tipos não, e passam com região nula. Quem decide qual é qual não é
    uma lista aqui: é a função devolver vazio quando falta região.
  */
  for (const tipo of Object.values(TipoCondicao)) {
    const semRegiao = alertasDaCondicao({
      tipo,
      descricao: SENTINELA,
      regiao: null,
      gravidade: 'MODERADA',
    } as never);

    const regioes: Array<string | null> =
      semRegiao.length > 0 ? [null] : Object.keys(CUIDADO_POR_REGIAO);

    for (const regiao of regioes) {
      const avisos =
        regiao === null
          ? semRegiao
          : alertasDaCondicao({
              tipo,
              descricao: SENTINELA,
              regiao,
              gravidade: 'MODERADA',
            } as never);

      for (const a of avisos) {
        saida.push({
          /*
            O id carrega TUDO que o gatilho casa: regra, tipo, região e papel.

            Antes era `regra:papel`, e `INTOLERANCIA` e `RESTRICAO_ALIMENTAR`
            compartilham a regra `restricao-alimentar` de propósito — mesmo
            texto para as duas. A linha, porém, carrega `tipoCondicao`, e o
            gatilho casa por tipo. Com o id igual, o `upsert` da segunda
            sobrescrevia o tipo da primeira: **condição do tipo intolerância
            deixava de gerar alerta nenhum**. Lactose registrada como
            intolerância não avisava o nutricionista.

            O primeiro segmento continua sendo o slug, que é o que o gatilho lê
            com `split_part(id, ':', 1)` para a tela dizer de onde veio o
            alerta — inserir o tipo no meio não muda isso.
          */
          id: [a.regra, tipo, regiao, a.papelDestino].filter(Boolean).join(':'),
          origem: 'CONDICAO',
          marcador: null,
          quando: [],
          lado: null,
          limites: undefined,
          tipoCondicao: tipo,
          regiao,
          papelDestino: a.papelDestino,
          // Também ignorada no gatilho: para condição a severidade vem da
          // GRAVIDADE registrada — a mesma lesão pesa diferente se leve ou
          // incapacitante.
          severidade: a.severidade,
          titulo: a.titulo,
          orientacao: a.orientacao.split(SENTINELA).join('{descricao}'),
          ativa: true,
        });
      }
    }
  }

  return saida;
}
