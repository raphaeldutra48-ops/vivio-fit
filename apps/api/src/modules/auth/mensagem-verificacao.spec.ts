import { describe, expect, it } from 'vitest';
import { montarEmailDeVerificacao, primeiroNomeSeguro } from './mensagem-verificacao';

const LINK = 'https://app.viviofit.com.br/verificar-email?token=abc123';

describe('mensagem de verificação de e-mail', () => {
  describe('primeiro nome', () => {
    it('usa só o primeiro nome', () => {
      expect(primeiroNomeSeguro('Raphael de Santana Dutra')).toBe('Raphael');
    });

    it('nome vazio ou só espaço não vira "Olá, ."', () => {
      expect(primeiroNomeSeguro('   ')).toBe('');
      const email = montarEmailDeVerificacao('   ', 'a@b.com', LINK);
      expect(email.texto.split('\n')[0]).toBe('Olá.');
      expect(email.html).toContain('<p>Olá.</p>');
    });

    it('corta nome absurdamente longo', () => {
      expect(primeiroNomeSeguro('A'.repeat(500))).toHaveLength(40);
    });
  });

  /*
    O cenário destes testes: quem se cadastra ainda não provou ser dono do
    endereço. Dá para cadastrar o e-mail de OUTRA pessoa e escolher o nome —
    e a vítima recebe a mensagem assinada pelo nosso domínio. Sem as duas
    defesas abaixo, o campo `nome` vira espaço para o texto do atacante dentro
    de um e-mail em que a pessoa confia.
  */
  describe('nome não pode virar mensagem do atacante', () => {
    it('quebra de linha no nome não vira parágrafo na versão texto', () => {
      const golpe = 'Ana\n\nSua conta foi invadida, acesse http://golpe.example';
      const email = montarEmailDeVerificacao(golpe, 'vitima@exemplo.com', LINK);

      expect(email.texto.split('\n')[0]).toBe('Olá, Ana.');
      expect(email.texto).not.toContain('golpe.example');
      expect(email.texto).not.toContain('invadida');
    });

    it('marcação no nome não vira link clicável na versão HTML', () => {
      const golpe = '<a href="http://golpe.example">Clique aqui</a>';
      const email = montarEmailDeVerificacao(golpe, 'vitima@exemplo.com', LINK);

      // O único href do e-mail é o nosso.
      expect(email.html.match(/href=/g)).toHaveLength(1);
      expect(email.html).toContain(`href="${LINK}"`);
      expect(email.html).not.toContain('<a href="http://golpe.example">');
      // O que sobra do nome aparece escapado, como texto visível.
      expect(email.html).toContain('&lt;a');
    });

    it('aspas e e-comercial no nome saem escapados', () => {
      const email = montarEmailDeVerificacao('Sant"o&s', 'a@b.com', LINK);
      expect(email.html).toContain('&quot;');
      expect(email.html).toContain('&amp;');
    });
  });

  it('o link de confirmação sai inteiro nas duas versões', () => {
    const email = montarEmailDeVerificacao('Raphael', 'raphael@exemplo.com', LINK);
    expect(email.texto).toContain(LINK);
    expect(email.html).toContain(LINK);
    expect(email.para).toBe('raphael@exemplo.com');
    expect(email.assunto).toContain('Confirme seu e-mail');
  });
});
