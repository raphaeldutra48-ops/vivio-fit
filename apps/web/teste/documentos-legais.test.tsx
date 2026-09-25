import { VERSAO_TERMO_ATUAL } from '@vivio/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Privacidade from '../app/privacidade/page';
import Termos from '../app/termos/page';

/**
 * Os documentos legais, e o que neles não pode se perder.
 *
 * Um texto de privacidade só vale se descrever o sistema de verdade. O que este
 * arquivo protege são as afirmações que, se caírem do texto, deixam a pessoa sem
 * saber de algo que o software faz — a transferência do documento para fora do
 * país, o pagamento que não passa pela plataforma, a autorização separada para
 * leitura automática.
 *
 * E protege o par que importa enquanto o texto é rascunho: **enquanto houver
 * `[PREENCHER]`, o aviso de rascunho tem de estar visível**. Publicar documento
 * incompleto sem avisar é pior do que não ter documento — a pessoa acha que leu
 * um compromisso.
 */
describe('documentos legais', () => {
  const cadastroComSdkFalso = async () => {
    vi.doMock('../lib/sdk', () => ({
      sdk: { auth: { registrarProfissional: vi.fn() } },
    }));
    const { default: Cadastrar } = await import('../app/cadastrar/page');
    return Cadastrar;
  };

  it('a política descreve o que o sistema faz de fato', () => {
    render(<Privacidade />);
    const texto = document.body.textContent ?? '';

    // As três que nenhuma revisão de estilo pode enxugar.
    expect(texto).toMatch(/transferência internacional/i);
    expect(texto).toMatch(/leitura automática de documentos/i);
    expect(texto).toMatch(/não vendemos dados/i);

    // As seis autorizações, uma por finalidade, são o coração do produto.
    for (const finalidade of ['Treino', 'Nutrição', 'Evolução', 'Clínico', 'Mensagens']) {
      expect(texto).toContain(finalidade);
    }

    // O registro de acesso é direito do titular, e a tela existe.
    expect(texto).toMatch(/quem viu meus dados/i);
  });

  it('os termos dizem o que a plataforma NÃO faz', () => {
    render(<Termos />);
    const texto = document.body.textContent ?? '';

    expect(texto).toMatch(/não presta serviço de saúde/i);
    expect(texto).toMatch(/direto entre aluno e profissional/i);
    expect(texto).toMatch(/não sabe quando o pagamento cai/i);
    // Prescrição de medicamento é privativa do médico, e o texto não pode
    // prometer que a plataforma garante adequação do que foi prescrito.
    expect(texto).toMatch(/medicamento só é prescrito por médico/i);
  });

  it('a versão do documento é a mesma que fica gravada no consentimento', () => {
    // Sem isso, a pessoa autoriza sob a versão X e o registro guarda a versão Y.
    render(<Termos />);
    expect(document.body.textContent).toContain(VERSAO_TERMO_ATUAL);
  });

  it.each([
    ['privacidade', Privacidade],
    ['termos', Termos],
  ])('enquanto %s tiver [PREENCHER], o aviso de rascunho aparece', (_nome, Pagina) => {
    render(<Pagina />);
    const texto = document.body.textContent ?? '';
    if (texto.includes('[PREENCHER]')) {
      expect(texto).toMatch(/rascunho/i);
      expect(texto).toMatch(/não passou por revisão jurídica/i);
    } else {
      // Revisado: o aviso tem de sair, senão ele mente para o outro lado.
      expect(texto).not.toMatch(/não passou por revisão jurídica/i);
    }
  });

  it('um documento leva ao outro, e os dois ao login', () => {
    render(<Termos />);
    const destinos = Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(destinos).toContain('/privacidade');
    expect(destinos).toContain('/login');
  });

  it('o cadastro mostra a que a pessoa está concordando, com link', async () => {
    /*
      É o ponto em que a decisão acontece. Um redesenho do formulário que
      derrubasse esta linha deixaria o aceite implícito e sem texto para ler.
    */
    const Cadastrar = await cadastroComSdkFalso();
    render(<Cadastrar />);

    expect(screen.getByText(/Termos de uso/i).closest('a')).toHaveAttribute('href', '/termos');
    expect(screen.getByText(/Política de privacidade/i).closest('a')).toHaveAttribute(
      'href',
      '/privacidade',
    );
    expect(document.body.textContent).toMatch(/Ao criar a conta você concorda/i);
  });
});
