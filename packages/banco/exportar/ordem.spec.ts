import { describe, expect, it } from 'vitest';
import { ordenarPorDependencia, paraJson } from './ordem';

/**
 * A ordem de restauração e a serialização do backup.
 *
 * As duas coisas que um backup pode perder em silêncio: ordem, que só cobra na
 * hora de restaurar (a pior hora possível), e precisão, que só cobra quando
 * alguém compara o peso de antes com o de depois.
 */
describe('ordem de restauração', () => {
  it('pai antes de filho', () => {
    const { ordem } = ordenarPorDependencia(
      ['ItemTreino', 'PlanoTreino', 'SessaoTreino', 'User'],
      [
        { tabela: 'PlanoTreino', depende: 'User' },
        { tabela: 'SessaoTreino', depende: 'PlanoTreino' },
        { tabela: 'ItemTreino', depende: 'SessaoTreino' },
      ],
    );
    expect(ordem.indexOf('User')).toBeLessThan(ordem.indexOf('PlanoTreino'));
    expect(ordem.indexOf('PlanoTreino')).toBeLessThan(ordem.indexOf('SessaoTreino'));
    expect(ordem.indexOf('SessaoTreino')).toBeLessThan(ordem.indexOf('ItemTreino'));
  });

  it('auto-referência não trava a tabela', () => {
    // Hierarquia dentro da própria tabela: as linhas entram juntas e se
    // referenciam. Tratar isso como dependência deixaria a tabela de fora.
    const { ordem, emCiclo } = ordenarPorDependencia(
      ['Categoria'],
      [{ tabela: 'Categoria', depende: 'Categoria' }],
    );
    expect(ordem).toEqual(['Categoria']);
    expect(emCiclo).toEqual([]);
  });

  it('ciclo sai separado, em vez de sumir da exportação', () => {
    /*
      Duas tabelas que se apontam existem em modelo legítimo, e nenhuma ordem as
      resolve. O erro que este caso previne é pior que o ciclo: uma implementação
      que pare no ciclo **deixaria as duas fora do backup**, sem avisar.
    */
    const { ordem, emCiclo } = ordenarPorDependencia(
      ['A', 'B', 'User'],
      [
        { tabela: 'A', depende: 'B' },
        { tabela: 'B', depende: 'A' },
        { tabela: 'A', depende: 'User' },
      ],
    );
    expect(ordem).toEqual(['User']);
    expect(emCiclo).toEqual(['A', 'B']);
  });

  it('dependência para tabela fora da lista é ignorada', () => {
    // `storage.objects` e as tabelas do Auth não entram na exportação; uma
    // referência a elas não pode travar a tabela que se exporta.
    const { ordem } = ordenarPorDependencia(['Foto'], [{ tabela: 'Foto', depende: 'auth.users' }]);
    expect(ordem).toEqual(['Foto']);
  });

  it('a mesma entrada dá a mesma ordem, sempre', () => {
    // Backup que muda de ordem entre execuções é impossível de comparar.
    const entrada: [string[], { tabela: string; depende: string }[]] = [
      ['Z', 'A', 'M'],
      [{ tabela: 'Z', depende: 'A' }],
    ];
    const uma = ordenarPorDependencia(...entrada).ordem;
    const outra = ordenarPorDependencia(...entrada).ordem;
    expect(uma).toEqual(outra);
    expect(uma).toEqual(['A', 'M', 'Z']);
  });
});

describe('serialização', () => {
  it('bigint vira texto em vez de derrubar o backup', () => {
    // `JSON.stringify` LANÇA em bigint: o backup morreria no meio.
    expect(paraJson({ n: 9007199254740993n })).toEqual({ n: '9007199254740993' });
  });

  it('data vai com fuso explícito', () => {
    expect(paraJson(new Date('2026-09-25T12:00:00.000Z'))).toBe('2026-09-25T12:00:00.000Z');
  });

  it('o Decimal do Prisma vira o número que ele representa, e não a tripa interna', () => {
    /*
      O defeito que a primeira exportação de verdade revelou, e que nenhum erro
      denunciava: `numeric` chega do `$queryRaw` como objeto `Decimal`, e o peso
      de 68,4 kg foi para o arquivo como `{"s":1,"e":1,"d":[68,4000000]}`. Um
      backup assim é ilegível exatamente no dado clínico.

      O dublê imita a forma do Decimal (sinal, expoente, dígitos, `toFixed`) sem
      depender do cliente gerado do Prisma.
    */
    const decimalFalso = { s: 1, e: 1, d: [68, 4000000], toFixed: () => '68.4', toString: () => '68.4' };
    expect(paraJson({ pesoKg: decimalFalso })).toEqual({ pesoKg: '68.4' });
  });

  it('numeric que já vem texto continua texto — virar número é perder precisão', () => {
    // O mesmo erro que o SDK teve com peso corporal, onde "100" < "82.50".
    expect(paraJson({ pesoKg: '82.50' })).toEqual({ pesoKg: '82.50' });
  });

  it('binário vira base64, e não objeto vazio', () => {
    const r = paraJson(Buffer.from('oi')) as { base64: string };
    expect(r.base64).toBe(Buffer.from('oi').toString('base64'));
  });

  it('nulo e indefinido viram nulo, e aninhado também é convertido', () => {
    expect(paraJson({ a: undefined, b: { c: [1n, new Date(0)] } })).toEqual({
      a: null,
      b: { c: ['1', '1970-01-01T00:00:00.000Z'] },
    });
  });
});
