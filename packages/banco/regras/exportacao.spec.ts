import { REFERENCIAS, TipoCondicao } from '@vivio/contracts';
import { describe, expect, it } from 'vitest';
import {
  escoposEsperados,
  faixasEsperadas,
  limitesDe,
  regrasEsperadas,
} from './exportacao';
import { REGRAS } from './regras';

/**
 * A derivação que alimenta três tabelas do banco.
 *
 * Ela saiu de dentro de `exportar-regras.ts` justamente porque lá não tinha
 * prova: o script só roda com o Postgres na mão. E a parte que ele monta é a
 * que erra calado — a primeira versão transcreveu as regras de condição à mão e
 * esqueceu seis tipos, e os avisos simplesmente deixaram de existir no dia em
 * que a API parou de derivar.
 *
 * Por isso aqui **nada é conferido contra a própria função**. Cada contagem é
 * recontada do dado de origem por um caminho diferente — se eu comparasse
 * `regrasEsperadas()` com uma constante que eu mesmo escrevi olhando a saída, a
 * prova aprovaria qualquer saída futura.
 */
describe('faixas: uma linha por marcador e sexo', () => {
  it('cobre TODOS os marcadores, nos dois sexos', () => {
    /*
      Os dois sexos sempre, mesmo quando a faixa é única. O gatilho busca por
      `marcador = x and sexo = y`: faltar a linha de um sexo faz o exame cair no
      padrão `ATENCAO` só por causa do sexo de quem o fez.
    */
    const marcadores = Object.keys(REFERENCIAS);
    const faixas = faixasEsperadas();

    expect(faixas).toHaveLength(marcadores.length * 2);
    for (const m of marcadores) {
      const sexos = faixas.filter((f) => f.marcador === m).map((f) => f.sexo).sort();
      expect(sexos, m).toEqual(['F', 'M']);
    }
  });

  it('os números saem da referência, e não de uma segunda tabela', () => {
    // Conferido contra `REFERENCIAS` lido aqui, não contra a saída da função.
    const glicose = faixasEsperadas().find(
      (f) => f.marcador === 'GLICOSE_JEJUM' && f.sexo === 'M',
    )!;
    const ref = REFERENCIAS.GLICOSE_JEJUM;

    expect(glicose.labMin).toBe(ref.laboratorial.min);
    expect(glicose.labMax).toBe(ref.laboratorial.max);
    expect(glicose.funcMin).toBe(ref.funcional.min);
    expect(glicose.funcMax).toBe(ref.funcional.max);
  });

  it('marcador com faixa por sexo sai com números DIFERENTES nos dois', () => {
    /*
      Se a derivação ignorasse o sexo, os dois lados sairiam iguais e a prova
      anterior (que só olha um marcador de faixa única) continuaria passando.
      Esta pergunta separa as duas coisas.
    */
    const porSexo = Object.entries(REFERENCIAS).filter(
      ([, r]) => 'M' in r.laboratorial || 'F' in r.laboratorial,
    );
    expect(porSexo.length, 'o esquema deixou de ter faixa por sexo').toBeGreaterThan(0);

    const faixas = faixasEsperadas();
    const divergentes = porSexo.filter(([m]) => {
      const h = faixas.find((f) => f.marcador === m && f.sexo === 'M')!;
      const f = faixas.find((x) => x.marcador === m && x.sexo === 'F')!;
      return h.labMin !== f.labMin || h.labMax !== f.labMax;
    });
    expect(divergentes.length).toBeGreaterThan(0);
  });
});

describe('escopos: quem vê qual marcador', () => {
  it('um por marcador, sem sobra e sem falta', () => {
    // Marcador sem escopo faz `pode_ver_marcador` devolver falso, e o
    // nutricionista deixa de ver aquele marcador sem nenhum aviso.
    const escopos = escoposEsperados();
    expect(escopos).toHaveLength(Object.keys(REFERENCIAS).length);
    expect(new Set(escopos.map((e) => e.marcador)).size).toBe(escopos.length);
    for (const e of escopos) {
      expect(e.escopo, e.marcador).toBe(REFERENCIAS[e.marcador as 'HBA1C'].escopo);
    }
  });
});

describe('regras: nada transcrito à mão', () => {
  const regras = regrasEsperadas();

  it('as de marcador são uma por (regra, papel) — recontado de REGRAS', () => {
    const esperado = REGRAS.reduce((t, r) => t + r.avisos.length, 0);
    expect(regras.filter((r) => r.origem === 'MARCADOR')).toHaveLength(esperado);
  });

  it('TODO tipo de condição gera alguma regra', () => {
    /*
      Este é o defeito histórico, nomeado: alergia alimentar, gestação,
      medicação contínua, doença crônica, restrição e cirurgia ficaram fora da
      transcrição e seus avisos deixaram de existir. A pergunta é feita sobre o
      enum inteiro, e não sobre uma lista — tipo novo entra aqui sozinho.
    */
    const comRegra = new Set(
      regras.filter((r) => r.origem === 'CONDICAO').map((r) => r.tipoCondicao),
    );
    const semRegra = Object.values(TipoCondicao).filter((t) => !comRegra.has(t));
    expect(semRegra).toEqual([]);
  });

  it('nenhum id repetido, porque a gravação é upsert por id', () => {
    // Dois ids iguais não dariam erro: o segundo sobrescreveria o primeiro, e
    // uma regra desapareceria sem nenhum sinal.
    const ids = regras.map((r) => r.id);
    const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(repetidos).toEqual([]);
  });

  it('a sentinela NÃO sobra no texto gravado', () => {
    /*
      A orientação de condição interpola a descrição que o profissional
      escreveu. Ela é gerada com a sentinela `DESCRICAO` e trocada por
      `{descricao}`, que o gatilho substitui. Sentinela vazada deixaria a
      palavra "DESCRICAO" no meio do aviso que chega ao profissional.
    */
    for (const r of regras) {
      expect(r.orientacao, r.id).not.toMatch(/DESCRICAO/);
    }
  });

  it('regra com lado tem limite, porque sem limite ela não dispara', () => {
    /*
      O gatilho compara o valor com o limite da regra. `lado` sem limite para
      aquele sexo não dispara — e isso é o certo (melhor não avisar do que
      avisar o contrário do que o exame diz), mas significa que uma regra sem
      limite nenhum é uma regra morta que ninguém nota.
    */
    for (const r of regras.filter((x) => x.lado)) {
      expect(Object.keys(r.limites ?? {}), r.id).not.toHaveLength(0);
    }
  });

  it('`lado` ABAIXO lê o mínimo funcional e ACIMA lê o máximo', () => {
    // Trocar os dois inverteria todo alerta de "baixo demais" em "alto demais".
    const ref = REFERENCIAS.GLICOSE_JEJUM;
    expect(limitesDe('GLICOSE_JEJUM', 'ABAIXO')).toEqual({ '*': ref.funcional.min });
    expect(limitesDe('GLICOSE_JEJUM', 'ACIMA')).toEqual({ '*': ref.funcional.max });
  });

  it('toda regra nasce ativa e com papel de destino', () => {
    for (const r of regras) {
      expect(r.ativa, r.id).toBe(true);
      expect(r.papelDestino, r.id).toBeTruthy();
      expect(r.titulo, r.id).toBeTruthy();
      expect(r.orientacao, r.id).toBeTruthy();
    }
  });
});

describe('o id de regra de condição carrega o tipo', () => {
  /*
    O defeito que esta suíte encontrou ao nascer, e que vale uma pergunta
    própria porque a de "id repetido" avisa que existe colisão, mas não diz
    qual lado se perdeu.

    `INTOLERANCIA` e `RESTRICAO_ALIMENTAR` dividem a regra `restricao-alimentar`
    — mesmo texto, e isso é intencional. Mas a linha gravada carrega
    `tipoCondicao`, e o gatilho casa por tipo. Com o id sem o tipo, o `upsert`
    da segunda sobrescrevia a primeira, e intolerância parava de gerar alerta.
  */
  it('intolerância e restrição alimentar sobrevivem às duas, e não uma só', () => {
    const regras = regrasEsperadas();
    const porTipo = (t: string) =>
      regras.filter((r) => r.origem === 'CONDICAO' && r.tipoCondicao === t);

    expect(porTipo('INTOLERANCIA').length).toBeGreaterThan(0);
    expect(porTipo('RESTRICAO_ALIMENTAR').length).toBeGreaterThan(0);
    // E as duas apontam para o mesmo slug, que é o que a tela mostra.
    for (const r of [...porTipo('INTOLERANCIA'), ...porTipo('RESTRICAO_ALIMENTAR')]) {
      expect(r.id.split(':')[0]).toBe('restricao-alimentar');
    }
  });

  it('o primeiro segmento do id segue sendo o slug, que é o que o gatilho lê', () => {
    // `split_part(v_regra.id, ':', 1)` alimenta a coluna `regra` do alerta, e é
    // por ela que a tela explica de onde o aviso veio. Um id que começasse com
    // o tipo trocaria a explicação em todos os alertas de condição.
    for (const r of regrasEsperadas()) {
      expect(r.id.split(':')[0], r.id).not.toMatch(
        /^(LESAO|DOENCA_CRONICA|ALERGIA_ALIMENTAR|INTOLERANCIA|RESTRICAO_ALIMENTAR|MEDICACAO_CONTINUA|CIRURGIA_RECENTE|GESTACAO)$/,
      );
    }
  });

  it('todo tipo de condição tem ao menos uma linha que o gatilho acha', () => {
    /*
      A pergunta da colisão, feita pelo outro lado: não "há id repetido?" e sim
      "sobrou tipo nenhum sem linha?". As duas juntas fecham o furo — a primeira
      pega a sobrescrita, esta pega o tipo que nunca foi exportado.
    */
    const comLinha = new Set(
      regrasEsperadas().filter((r) => r.origem === 'CONDICAO').map((r) => r.tipoCondicao),
    );
    for (const t of Object.values(TipoCondicao)) {
      expect(comLinha.has(t), `${t} não gera linha nenhuma`).toBe(true);
    }
  });
});
