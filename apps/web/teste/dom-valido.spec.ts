import { describe, expect, it } from 'vitest';
import { avisosDeDomInvalido, mensagemDoConsole } from './dom-valido';

/**
 * O portão de validade do DOM, provado com amostra boa e amostra ruim.
 *
 * As amostras ruins são texto REAL do React, copiado da saída da suíte no dia
 * em que o defeito do `Aviso` apareceu — e não uma frase que eu inventei para
 * casar com o meu próprio regex, que provaria apenas que sei escrever regex.
 */
const AMOSTRA_RUIM = [
  'In HTML, <p> cannot be a descendant of <p>.\nThis will cause a hydration error.\n\n  <ImportarDieta>\n    <div className="flex flex-...">',
  'In HTML, <ul> cannot be a descendant of <p>.\nThis will cause a hydration error.',
  '<p> cannot contain a nested <p>.\nSee this log for the ancestor stack trace.',
  'Warning: validateDOMNesting(...): <div> cannot appear as a descendant of <p>.',
];

/*
  As boas são erros que a suíte provoca de propósito. Reprovar por elas deixaria
  a suíte vermelha por ruído, e suíte vermelha por ruído deixa de ser portão.
*/
const AMOSTRA_BOA = [
  'Error: Uncaught [Error: fetch failed]',
  'Warning: An update to Tela inside a test was not wrapped in act(...)',
  'The above error occurred in the <CatalogoPrescritivel> component',
  'Erro ao carregar os materiais: ERRO_DE_REDE',
  // Um texto que CITA hidratação sem ser o aviso: prosa de comentário não
  // deveria reprovar nada... mas repare que este caso cai no padrão de
  // propósito, e é por isso que ele NÃO está nesta lista.
  'componente renderizado no servidor e no cliente',
];

describe('o portão de HTML inválido', () => {
  it('acusa CADA amostra ruim, uma por uma', () => {
    for (const m of AMOSTRA_RUIM) {
      expect(avisosDeDomInvalido([m]), m.slice(0, 45)).toHaveLength(1);
    }
  });

  it('NÃO acusa o erro que a suíte provoca de propósito', () => {
    expect(avisosDeDomInvalido(AMOSTRA_BOA)).toEqual([]);
  });

  it('devolve só a primeira linha, porque o React anexa a árvore inteira', () => {
    // Sem isto a mensagem de falha vem com trinta linhas de componentes e
    // ninguém lê qual era o aninhamento errado.
    const [aviso] = avisosDeDomInvalido([AMOSTRA_RUIM[0]!]);
    expect(aviso).toBe('In HTML, <p> cannot be a descendant of <p>.');
    expect(aviso).not.toMatch(/ImportarDieta/);
  });

  it('não repete o mesmo aviso, que o React emite uma vez por elemento', () => {
    // A tela de importar dieta emitia o mesmo aviso em cada item da lista de
    // avisos da leitura: o relatório viria com a frase dez vezes.
    const repetido = [AMOSTRA_RUIM[1]!, AMOSTRA_RUIM[1]!, AMOSTRA_RUIM[1]!];
    expect(avisosDeDomInvalido(repetido)).toHaveLength(1);
  });

  it('lista vazia não inventa achado', () => {
    expect(avisosDeDomInvalido([])).toEqual([]);
  });
});

describe('a mensagem que vai para o relatório', () => {
  /*
    O React não manda a frase pronta. Manda o molde e os valores separados, do
    mesmo jeito que `printf`. Este bloco existe porque a primeira versão do
    portão reprovava certo e relatava "In HTML, %s cannot be a descendant of
    <%s>." — fechava a porta sem dizer quem tentou passar.
  */
  it('resolve os %s com os argumentos que vêm depois', () => {
    expect(
      mensagemDoConsole(['In HTML, %s cannot be a descendant of <%s>.', '<p>', 'p']),
    ).toBe('In HTML, <p> cannot be a descendant of <p>.');
  });

  it('argumento que sobra vai para o fim, e não é perdido', () => {
    // A árvore de componentes vem como argumento extra. Ela não pode sumir da
    // coleta: é o que diz em qual tela o aninhamento aconteceu.
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

  it('o portão lê a mensagem JÁ resolvida, e acusa o aninhamento', () => {
    // As duas peças juntas: é assim que o `preparo.ts` as usa.
    const bruto = ['In HTML, %s cannot be a descendant of <%s>.', '<ul>', 'p'];
    expect(avisosDeDomInvalido([mensagemDoConsole(bruto)])).toEqual([
      'In HTML, <ul> cannot be a descendant of <p>.',
    ]);
  });
});
