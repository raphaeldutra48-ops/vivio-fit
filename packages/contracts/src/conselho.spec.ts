import { describe, expect, it } from 'vitest';
import { registroComConselho } from './conselho';

/**
 * O registro do conselho, e a sigla que não pode dobrar.
 *
 * O caso que gerou isto foi real: cadastrando pela tela, com "CREF 999999-G" no
 * campo que pede só o número, o banco guardou "CREF CREF 999999-G".
 */
describe('registro com a sigla do conselho', () => {
  it('só o número: a sigla entra uma vez', () => {
    expect(registroComConselho('CREF', '012345')).toBe('CREF 012345');
  });

  it('a pessoa digitou a sigla junto: não dobra', () => {
    // O jeito que está escrito na carteirinha, e o que a semente deste projeto
    // usa: "CREF 012345-G".
    expect(registroComConselho('CREF', 'CREF 012345-G')).toBe('CREF 012345-G');
    expect(registroComConselho('CRN', 'crn 54321')).toBe('CRN 54321');
    expect(registroComConselho('CRM', 'CRM: 98765')).toBe('CRM 98765');
    expect(registroComConselho('CREF', 'cref-012345')).toBe('CREF 012345');
  });

  it('espaço sobrando não vira registro diferente', () => {
    /*
      A unicidade é por (tipo, registro, UF). "CREF  012345" e "CREF 012345"
      conviveriam como dois profissionais, e o segundo cadastro passaria quando
      devia ser recusado.
    */
    expect(registroComConselho('CREF', '  012345  ')).toBe('CREF 012345');
    expect(registroComConselho('CREF', '012345   -G')).toBe('CREF 012345 -G');
  });

  it('sigla de OUTRO conselho fica visível, e não é apagada', () => {
    /*
      Escolher "Personal trainer" e digitar "CRN 123" são duas afirmações
      incompatíveis. Apagar uma em silêncio é decidir pela pessoa qual estava
      certa; deixar o conflito à vista é o que permite a verificação humana pegar.
    */
    expect(registroComConselho('CREF', 'CRN 123')).toBe('CREF CRN 123');
  });

  it('campo vazio não gera registro só com a sigla', () => {
    // "CREF " sozinho passaria pela obrigatoriedade do banco e não identifica
    // ninguém.
    expect(registroComConselho('CREF', '')).toBe('');
    expect(registroComConselho('CREF', '   ')).toBe('');
    expect(registroComConselho('CREF', 'CREF')).toBe('');
  });
});
