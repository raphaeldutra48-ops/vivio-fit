import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PADROES_PROIBIDOS, avisosProibidos, mensagemDoConsole } from './avisos-do-react';

/**
 * O portão dos avisos do React, provado com amostra boa e amostra ruim.
 *
 * As amostras ruins são texto **real** do React, copiado da saída da suíte nos
 * dias em que cada defeito apareceu — e não frases que eu inventei para casar
 * com o meu próprio regex, que provariam apenas que sei escrever regex.
 */
const AMOSTRA_RUIM = [
  'In HTML, <p> cannot be a descendant of <p>.\nThis will cause a hydration error.\n\n  <ImportarDieta>\n    <div className="flex flex-...">',
  'In HTML, <ul> cannot be a descendant of <p>.\nThis will cause a hydration error.',
  '<p> cannot contain a nested <p>.\nSee this log for the ancestor stack trace.',
  'Warning: validateDOMNesting(...): <div> cannot appear as a descendant of <p>.',
  'An update to Inicio inside a test was not wrapped in act(...).\n\nWhen testing, code that causes React state updates should be wrapped into act(...)',
];

/*
  As boas são erros que a suíte provoca de propósito: tela que recebe falha de
  rede, componente que estoura dentro da barreira de erro. Reprovar por elas
  deixaria a suíte vermelha por ruído, e suíte vermelha por ruído deixa de ser
  portão — quem vê falha que "sempre falha" para de olhar.
*/
const AMOSTRA_BOA = [
  'Error: Uncaught [Error: fetch failed]',
  'The above error occurred in the <CatalogoPrescritivel> component',
  'Erro ao carregar os materiais: ERRO_DE_REDE',
  'Warning: Each child in a list should have a unique "key" prop.',
  'Não foi possível carregar este plano.',
];

describe('o portão dos avisos do React', () => {
  it('acusa CADA amostra ruim, uma por uma', () => {
    for (const m of AMOSTRA_RUIM) {
      expect(avisosProibidos([m]), m.slice(0, 45)).toHaveLength(1);
    }
  });

  it('NÃO acusa o erro que a suíte provoca de propósito', () => {
    expect(avisosProibidos(AMOSTRA_BOA)).toEqual([]);
  });

  it('devolve só a primeira linha, porque o React anexa a árvore inteira', () => {
    const [aviso] = avisosProibidos([AMOSTRA_RUIM[0]!]);
    expect(aviso).toBe('In HTML, <p> cannot be a descendant of <p>.');
    expect(aviso).not.toMatch(/ImportarDieta/);
  });

  it('não repete o mesmo aviso, que o React emite uma vez por elemento', () => {
    const repetido = [AMOSTRA_RUIM[1]!, AMOSTRA_RUIM[1]!, AMOSTRA_RUIM[1]!];
    expect(avisosProibidos(repetido)).toHaveLength(1);
  });

  it('lista vazia não inventa achado', () => {
    expect(avisosProibidos([])).toEqual([]);
  });
});

describe('a mensagem que vai para o relatório', () => {
  /*
    O React não manda a frase pronta. Manda o molde e os valores separados, como
    `printf`. Este bloco existe porque a primeira versão do portão reprovava
    certo e relatava "In HTML, %s cannot be a descendant of <%s>." — fechava a
    porta sem dizer quem tentou passar.
  */
  it('resolve os %s com os argumentos que vêm depois', () => {
    expect(mensagemDoConsole(['In HTML, %s cannot be a descendant of <%s>.', '<p>', 'p'])).toBe(
      'In HTML, <p> cannot be a descendant of <p>.',
    );
  });

  it('argumento que sobra vai para o fim, e não é perdido', () => {
    // A árvore de componentes vem como argumento extra, e é ela que diz em qual
    // tela o aninhamento aconteceu.
    expect(mensagemDoConsole(['%s falhou', 'Tela', 'extra'])).toBe('Tela falhou extra');
  });

  it('molde com mais %s do que valores mantém o que sobrou', () => {
    // Não inventar "undefined" no meio da frase: marca sem valor fica como
    // está, que é o que o console do navegador também faz.
    expect(mensagemDoConsole(['%s e %s', 'um'])).toBe('um e %s');
  });

  it('primeiro argumento que não é texto cai no caminho simples', () => {
    expect(mensagemDoConsole([new Error('fetch failed')])).toMatch(/fetch failed/);
  });

  it('as duas peças juntas, como o preparo as usa', () => {
    const bruto = ['In HTML, %s cannot be a descendant of <%s>.', '<ul>', 'p'];
    expect(avisosProibidos([mensagemDoConsole(bruto)])).toEqual([
      'In HTML, <ul> cannot be a descendant of <p>.',
    ]);
  });
});

describe('as duas cópias do critério não podem divergir', () => {
  /**
   * O preço de não criar um pacote só para sessenta linhas.
   *
   * Cada aplicativo tem `setupFiles` próprio, então cada um tem sua cópia de
   * `avisos-do-react.ts`. Cópia sem guarda é a forma mais silenciosa de duas
   * verdades: alguém acrescenta um padrão aqui, o aplicativo segue sem ele, e a
   * suíte de lá volta a deixar passar o que a de cá barra.
   *
   * A comparação é da LISTA, não do arquivo inteiro — os comentários podem
   * divergir, e devem, porque cada suíte tem história própria.
   */
  it('a lista de padrões é a mesma no aplicativo', () => {
    const daqui = PADROES_PROIBIDOS.join('|');
    const fonteDeLa = readFileSync(
      join(__dirname, '..', '..', 'mobile', 'teste', 'avisos-do-react.ts'),
      'utf8',
    );

    const bloco = /export const PADROES_PROIBIDOS = \[([\s\S]*?)\] as const;/.exec(fonteDeLa);
    expect(bloco, 'o aplicativo não declara PADROES_PROIBIDOS como esperado').not.toBeNull();

    const deLa = [...bloco![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!).join('|');
    expect(deLa).toBe(daqui);
  });

  it('e a prova acima sabe falhar: lista diferente é acusada', () => {
    // A amostra ruim desta própria comparação. Sem ela, bastava o regex não
    // casar nada para a igualdade virar '' === '' e o guarda aprovar tudo.
    const bloco = /export const PADROES_PROIBIDOS = \[([\s\S]*?)\] as const;/.exec(
      "export const PADROES_PROIBIDOS = [\n  'um',\n  'dois',\n] as const;",
    );
    const lidos = [...bloco![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!).join('|');
    expect(lidos).toBe('um|dois');
    expect(lidos).not.toBe(PADROES_PROIBIDOS.join('|'));
  });
});
