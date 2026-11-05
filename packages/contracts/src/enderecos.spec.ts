import { describe, expect, it } from 'vitest';
import { CONTATO_DE_PRIVACIDADE, DOCUMENTOS_LEGAIS, ENDERECO_DO_APP, pedidoDeExclusaoPorEmail } from './enderecos';

describe('pedido de exclusão por e-mail', () => {
  it('enquanto o contato é [PREENCHER], NÃO monta link nenhum', () => {
    // Um mailto para "[PREENCHER…]" abriria o programa de e-mail com destinatário
    // inválido, e a pessoa acharia que pediu.
    expect(pedidoDeExclusaoPorEmail(CONTATO_DE_PRIVACIDADE)).toBeNull();
    expect(pedidoDeExclusaoPorEmail('')).toBeNull();
    expect(pedidoDeExclusaoPorEmail('privacidade@')).toBeNull();
    expect(pedidoDeExclusaoPorEmail('[privacidade@viviofit.com.br]')).toBeNull();
  });

  it('com endereço de verdade, abre o e-mail com assunto e texto prontos', () => {
    const link = pedidoDeExclusaoPorEmail('privacidade@viviofit.com.br')!;
    expect(link.startsWith('mailto:privacidade@viviofit.com.br?')).toBe(true);
    const params = new URLSearchParams(link.split('?')[1]);
    expect(params.get('subject')).toBe('Excluir minha conta');
    // Pedir do e-mail cadastrado é o que confirma que a conta é de quem pede.
    expect(params.get('body')).toMatch(/e-mail cadastrado/);
  });

  it('o contato de privacidade ainda está por preencher — e a prova acusa quando for preenchido', () => {
    /*
      Quando o dono preencher o contato, esta prova falha de propósito: é o
      lembrete de tirar o aviso de rascunho dos documentos e conferir o texto da
      página de exclusão contra o processo real.
    */
    expect(CONTATO_DE_PRIVACIDADE).toMatch(/\[PREENCHER/);
  });
});

describe('documentos legais', () => {
  it('os três moram no mesmo endereço do app, e a exclusão tem página própria', () => {
    expect(DOCUMENTOS_LEGAIS.exclusaoDeConta).toBe(`${ENDERECO_DO_APP}/excluir-conta`);
    for (const url of Object.values(DOCUMENTOS_LEGAIS)) expect(url.startsWith(ENDERECO_DO_APP)).toBe(true);
  });
});
