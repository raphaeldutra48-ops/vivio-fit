import { describe, expect, it } from 'vitest';
import { comandos } from '../prisma/aplicar-rls';

/**
 * O divisor de SQL, que já errou duas vezes contra o banco de verdade.
 *
 * Na primeira, comeu os `enable row level security` que vinham depois de um
 * comentário: as políticas foram criadas e ficaram sem efeito, e o teste de
 * vazamento acusou um buraco que era só ausência de aplicação. Na segunda, não
 * reconheceu `$funcao$` e cortou o corpo de uma função no meio.
 *
 * Nenhuma das duas precisava de banco para ser vista aqui — e é por isso que
 * agora tem teste. O caro deste código não é o que ele executa, é o que ele
 * decide não executar em silêncio.
 */
describe('comandos', () => {
  it('separa instruções simples', () => {
    expect(comandos('select 1; select 2;')).toEqual(['select 1', 'select 2']);
  });

  it('não perde o comando que vem depois de um comentário de linha', () => {
    // O defeito original, ao pé da letra.
    const sql = `
-- Liga a proteção nesta tabela.
alter table public."Exame" enable row level security;
`;
    expect(comandos(sql)).toEqual(['alter table public."Exame" enable row level security']);
  });

  it('não perde o comando depois de um bloco, nem se o bloco tiver bloco dentro', () => {
    const sql = `/* fora /* dentro */ ainda fora */ select 1;`;
    expect(comandos(sql)).toEqual(['select 1']);
  });

  it('o ponto e vírgula dentro de $$ não termina o comando', () => {
    const sql = `create function f() returns int language sql as $$ select 1; $$;\nselect 2;`;
    const r = comandos(sql);
    expect(r).toHaveLength(2);
    expect(r[0]).toContain('select 1;');
    expect(r[1]).toBe('select 2');
  });

  it('reconhece corpo com etiqueta nomeada', () => {
    const sql = `create function f() returns int language plpgsql as $funcao$
begin
  raise exception 'nao';
  return 1;
end;
$funcao$;
select 9;`;
    const r = comandos(sql);
    expect(r).toHaveLength(2);
    expect(r[1]).toBe('select 9');
  });

  it('duas etiquetas na MESMA linha abrem e fecham', () => {
    // A versão antiga alternava um estado booleano por linha e via este caso
    // como "abriu e ficou aberto", engolindo todo o resto do arquivo.
    const sql = `create function f() returns int language sql as $$ select 1 $$;\nselect 2;`;
    expect(comandos(sql)).toHaveLength(2);
  });

  it('não trata como comentário o que está dentro de texto', () => {
    const sql = `select 'a -- b';`;
    expect(comandos(sql)).toEqual([`select 'a -- b'`]);
  });

  it('o ponto e vírgula dentro de texto não separa', () => {
    const sql = `raise exception 'um; dois';`;
    expect(comandos(sql)).toEqual([`raise exception 'um; dois'`]);
  });

  it('aspa escapada por duplicação não fecha o texto', () => {
    const sql = `select 'n''ao; termina';\nselect 2;`;
    const r = comandos(sql);
    expect(r).toHaveLength(2);
    expect(r[0]).toBe(`select 'n''ao; termina'`);
  });

  it('o último comando conta mesmo sem ponto e vírgula final', () => {
    expect(comandos('select 1')).toEqual(['select 1']);
  });

  it('arquivo só de comentário não vira comando vazio', () => {
    expect(comandos('-- nada aqui\n/* nem aqui */\n')).toEqual([]);
  });
});
