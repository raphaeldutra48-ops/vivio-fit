import { describe, expect, it } from 'vitest';
import { colunaTemQuemPreencha } from './regras-da-auditoria';

/**
 * A regra que decide se uma coluna NOT NULL sem default tem quem a preencha.
 *
 * Ela existe porque a auditoria precisa separar duas coisas que se pareciam na
 * mesma lista: a coluna coberta por um gatilho (está tudo certo) e a coluna que
 * ninguém preenche (a primeira gravação de verdade falha). Enquanto as duas
 * conviviam como "informativo", a lista de 22 não pedia ação nenhuma — e a
 * vigésima terceira, a de verdade, entraria nela sem chamar atenção.
 *
 * Os três idiomas abaixo são os que ESTE banco usa. Um quarto que apareça volta
 * a reprovar — o que é o comportamento certo: melhor reprovar à toa e alguém
 * vir conferir do que aprovar uma coluna que vai estourar no primeiro INSERT.
 */
const FONTE_DIRETA = `CREATE OR REPLACE FUNCTION public.governar_meta()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new."atualizadoEm" := now();
  return new;
end;
$function$`;

const FONTE_JSONB = `CREATE OR REPLACE FUNCTION public.governar_conteudo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  coluna text := tg_argv[0];
  novo jsonb := to_jsonb(new);
begin
  novo := jsonb_set(novo, array[coluna], to_jsonb(public.usuario_atual()));
  novo := jsonb_set(novo, '{atualizadoEm}', to_jsonb(now()));
  return jsonb_populate_record(new, novo);
end;
$function$`;

const DECLARACAO_COM_ARGUMENTO =
  'CREATE TRIGGER governar_receita BEFORE INSERT OR UPDATE ON public."Receita" ' +
  "FOR EACH ROW EXECUTE FUNCTION public.governar_conteudo('autorId')";

describe('colunaTemQuemPreencha', () => {
  it('reconhece a atribuição direta', () => {
    expect(colunaTemQuemPreencha('atualizadoEm', [FONTE_DIRETA])).toBe(true);
  });

  it('reconhece o caminho jsonb escrito por extenso', () => {
    expect(colunaTemQuemPreencha('atualizadoEm', [FONTE_JSONB])).toBe(true);
  });

  /*
    O caso que o gatilho genérico cria: a coluna governada não aparece na fonte
    da função, só na declaração do gatilho. Quatro tabelas compartilham a mesma
    função com nomes de dono diferentes — `autorId`, `profissionalId`,
    `prescritorId` —, e foi por não olhar a declaração que a auditoria reprovou
    oito colunas corretas.
  */
  it('reconhece o nome da coluna passado como ARGUMENTO do gatilho', () => {
    expect(colunaTemQuemPreencha('autorId', [FONTE_JSONB, DECLARACAO_COM_ARGUMENTO])).toBe(true);
  });

  it('a coluna que ninguém preenche continua reprovando', () => {
    // É o ponto inteiro da verificação: esta estouraria no primeiro INSERT.
    expect(colunaTemQuemPreencha('prescritorId', [FONTE_DIRETA])).toBe(false);
  });

  it('tabela sem gatilho nenhum não preenche nada', () => {
    expect(colunaTemQuemPreencha('atualizadoEm', [])).toBe(false);
  });

  it('não confunde uma coluna com outra de nome parecido', () => {
    /*
      `new."atualizadoEm" :=` não pode valer por `atualizado`. Sem as aspas na
      comparação, um prefixo passaria — e a coluna de verdade ficaria aprovada
      por engano, que é o erro mais caro que esta função pode cometer.
    */
    expect(colunaTemQuemPreencha('atualizado', [FONTE_DIRETA])).toBe(false);
    expect(colunaTemQuemPreencha('autor', [DECLARACAO_COM_ARGUMENTO])).toBe(false);
  });
});
