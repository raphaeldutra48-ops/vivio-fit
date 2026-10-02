import { ErroApi } from '@vivio/sdk';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Os três caminhos de recuperar acesso: pedir o link, escolher senha nova e
 * confirmar o e-mail.
 *
 * É a única parte do sistema em que o erro tranca a pessoa do lado de fora.
 * Quem não consegue entrar não abre um chamado — desiste, e o profissional perde
 * o aluno sem saber por quê.
 *
 * Duas regras atravessam as três telas:
 *
 * 1. **A resposta do "esqueci minha senha" é sempre a mesma.** Dizer "este
 *    e-mail não está cadastrado" transforma a tela num verificador de quem usa o
 *    sistema — e a lista de clientes de um profissional de saúde não é
 *    informação pública.
 * 2. **Link inválido e falha de rede são coisas diferentes.** O conselho que
 *    acompanha o primeiro ("peça um link novo") é o pior possível para o
 *    segundo: o link continua valendo, e pedir outro invalida o que a pessoa tem
 *    na mão.
 */
const esqueciSenha = vi.fn();
const sessaoAberta = vi.fn();
const redefinirSenha = vi.fn();
const verificarEmail = vi.fn();
const navegador = { push: vi.fn(), replace: vi.fn() };

vi.mock('../lib/sdk', () => ({
  sdk: {
    auth: {
      esqueciSenha: (...a: unknown[]) => esqueciSenha(...a),
      sessaoAberta: (...a: unknown[]) => sessaoAberta(...a),
      redefinirSenha: (...a: unknown[]) => redefinirSenha(...a),
      verificarEmail: (...a: unknown[]) => verificarEmail(...a),
    },
  },
}));

/** O que veio na URL — é por aqui que o Supabase avisa link expirado. */
let parametros = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => navegador,
  useSearchParams: () => parametros,
  usePathname: () => '/',
  useParams: () => ({}),
}));

const textoDaTela = () => document.body.textContent ?? '';

const campos = () => [...document.querySelectorAll('input')] as HTMLInputElement[];

beforeEach(() => {
  parametros = new URLSearchParams();
  esqueciSenha.mockResolvedValue(undefined);
  sessaoAberta.mockResolvedValue(true);
  redefinirSenha.mockResolvedValue({
    usuario: { id: 'prof-1', nome: 'Diego Personal', papel: 'PERSONAL' },
  });
  verificarEmail.mockResolvedValue({
    usuario: { id: 'prof-1', nome: 'Diego Personal', papel: 'PERSONAL' },
  });
});

describe('pedir o link de recuperação', () => {
  it('a resposta não revela se o e-mail tem conta', async () => {
    /*
      A regra que esta tela existe para cumprir. Confirmar a existência
      transformaria a página em um verificador: quem quisesse saber se uma pessoa
      é cliente de um profissional de saúde teria como descobrir, sem senha
      nenhuma.
    */
    const { default: Esqueci } = await import('../app/esqueci-senha/page');
    render(<Esqueci />);
    fireEvent.change(campos()[0]!, { target: { value: 'ninguem@exemplo.com' } });

    fireEvent.click(screen.getByText('Enviar link'));

    await waitFor(() => expect(textoDaTela()).toMatch(/se (existir|houver)|a caminho/i));
    expect(textoDaTela()).not.toMatch(/não encontrado|não está cadastrado|não existe/i);
  });

  it('a mesma resposta quando a API recusa — inclusive no erro', async () => {
    // Um erro visível só para e-mails inexistentes seria o mesmo vazamento, pela
    // porta dos fundos.
    esqueciSenha.mockRejectedValue(new ErroApi('RECURSO_NAO_ENCONTRADO', 'não achou', 404));
    const { default: Esqueci } = await import('../app/esqueci-senha/page');
    render(<Esqueci />);
    fireEvent.change(campos()[0]!, { target: { value: 'ninguem@exemplo.com' } });

    fireEvent.click(screen.getByText('Enviar link'));

    await waitFor(() => expect(textoDaTela()).toMatch(/se (existir|houver)|a caminho/i));
    expect(textoDaTela()).not.toMatch(/não achou|404/i);
  });
});

describe('escolher senha nova', () => {
  async function abrirRedefinir() {
    const { default: Redefinir } = await import('../app/redefinir-senha/page');
    return render(<Redefinir />);
  }

  it('sem sessão aberta, diz que o link não vale mais — e oferece pedir outro', async () => {
    // O link é o que prova a posse do e-mail. Sem ele, não há o que fazer nesta
    // tela além de pedir um novo.
    sessaoAberta.mockResolvedValue(false);
    await abrirRedefinir();

    await waitFor(() => expect(textoDaTela()).toMatch(/link expirado ou já usado/i));
    expect(screen.getByText('Pedir um link novo')).toBeInTheDocument();
  });

  it('falha ao CONFERIR o link não deixa a tela presa em "conferindo"', async () => {
    /*
      O `.then(setTemSessao)` estava sem par: a rejeição deixava o estado em
      `null` e a tela em "Conferindo o link…" para sempre — sem erro e sem
      saída, no único caminho de quem está trancado fora da conta. Dizer "link
      expirado" seria pior ainda: mandaria pedir outro link e queimar o bom.
    */
    sessaoAberta.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'fetch failed', 0));
    await abrirRedefinir();

    await waitFor(() => expect(textoDaTela()).toMatch(/não deu para conferir o link/i));
    expect(textoDaTela()).toMatch(/foi a conexão que falhou/i);
    expect(textoDaTela()).not.toMatch(/link expirado ou já usado/i);
    expect(textoDaTela()).not.toMatch(/conferindo o link/i);
  });

  it('link expirado avisado pelo Supabase na URL é tratado como expirado', async () => {
    parametros = new URLSearchParams({ error_description: 'Email link is invalid or has expired' });
    await abrirRedefinir();

    await waitFor(() => expect(textoDaTela()).toMatch(/link expirado ou já usado/i));
    // E nem chega a perguntar pela sessão: o link já se anunciou morto.
    expect(sessaoAberta).not.toHaveBeenCalled();
  });

  it('senha fraca é recusada pela MESMA regra do servidor', async () => {
    /*
      A validação usa `senhaSchema`, de `packages/contracts` — as duas pontas não
      têm como divergir. Uma regra reescrita aqui aceitaria o que o servidor
      recusa, e a pessoa descobriria isso depois de digitar duas vezes.
    */
    await abrirRedefinir();
    await waitFor(() => expect(campos().length).toBeGreaterThan(1));

    fireEvent.change(campos()[0]!, { target: { value: '123' } });

    await waitFor(() => expect(screen.getByText('Salvar senha nova')).toBeDisabled());
    expect(redefinirSenha).not.toHaveBeenCalled();
  });

  it('senhas diferentes não passam, e a tela diz qual é o problema', async () => {
    await abrirRedefinir();
    await waitFor(() => expect(campos().length).toBeGreaterThan(1));

    fireEvent.change(campos()[0]!, { target: { value: 'SenhaBoa123!' } });
    fireEvent.change(campos()[1]!, { target: { value: 'SenhaBoa124!' } });

    await waitFor(() => expect(textoDaTela()).toMatch(/as duas senhas precisam ser iguais/i));
    expect(screen.getByText('Salvar senha nova')).toBeDisabled();
  });

  it('senha boa e repetida salva, e leva o profissional para o painel', async () => {
    await abrirRedefinir();
    await waitFor(() => expect(campos().length).toBeGreaterThan(1));

    fireEvent.change(campos()[0]!, { target: { value: 'SenhaBoa123!' } });
    fireEvent.change(campos()[1]!, { target: { value: 'SenhaBoa123!' } });
    fireEvent.click(screen.getByText('Salvar senha nova'));

    await waitFor(() => expect(redefinirSenha).toHaveBeenCalled());
    await waitFor(() => expect(navegador.push).toHaveBeenCalledWith('/alunos'));
  });

  it('aluno que redefine na web é mandado para a entrada, não para o painel', async () => {
    // O painel não é dele, e cair lá dentro é a confusão que o portão da área
    // profissional passou a evitar.
    redefinirSenha.mockResolvedValue({
      usuario: { id: 'aluna-1', nome: 'Ana Souza', papel: 'ALUNO' },
    });
    await abrirRedefinir();
    await waitFor(() => expect(campos().length).toBeGreaterThan(1));

    fireEvent.change(campos()[0]!, { target: { value: 'SenhaBoa123!' } });
    fireEvent.change(campos()[1]!, { target: { value: 'SenhaBoa123!' } });
    fireEvent.click(screen.getByText('Salvar senha nova'));

    await waitFor(() => expect(navegador.push).toHaveBeenCalledWith('/login'));
  });

  it('avisa que salvar encerra as outras sessões', async () => {
    // É o que faz a troca de senha servir para expulsar quem não devia estar lá —
    // e a pessoa precisa saber disso antes, não depois de perder o acesso no
    // outro aparelho.
    await abrirRedefinir();

    await waitFor(() =>
      expect(textoDaTela()).toMatch(/todas as sessões abertas nesta conta serão encerradas/i),
    );
  });
});

describe('confirmar o e-mail', () => {
  async function abrirVerificacao() {
    const { default: Verificar } = await import('../app/verificar-email/page');
    return render(<Verificar />);
  }

  it('confirmado, chama a pessoa pelo primeiro nome e diz o próximo passo', async () => {
    await abrirVerificacao();

    await waitFor(() => expect(textoDaTela()).toMatch(/tudo certo, diego/i));
    expect(screen.getByText('Ir para o painel')).toBeInTheDocument();
  });

  it('aluno é mandado de volta ao aplicativo, e não ao painel', async () => {
    verificarEmail.mockResolvedValue({
      usuario: { id: 'aluna-1', nome: 'Ana Souza', papel: 'ALUNO' },
    });
    await abrirVerificacao();

    await waitFor(() => expect(textoDaTela()).toMatch(/volte para o aplicativo/i));
    expect(screen.queryByText('Ir para o painel')).not.toBeInTheDocument();
  });

  it('link realmente inválido manda pedir outro', async () => {
    verificarEmail.mockRejectedValue(new ErroApi('TOKEN_INVALIDO', 'inválido', 401));
    await abrirVerificacao();

    await waitFor(() => expect(textoDaTela()).toMatch(/link inválido ou expirado/i));
  });

  it('falha de REDE não manda pedir link novo — isso invalidaria o que ela tem', async () => {
    /*
      O defeito que esta prova fixa. Todo erro caía em "link inválido ou
      expirado", com o conselho de pedir um novo. Quem estava só sem sinal
      seguia o conselho e queimava o link bom — e o segundo e-mail pode levar
      minutos, ou esbarrar no limite de envio.
    */
    verificarEmail.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'fetch failed', 0));
    await abrirVerificacao();

    await waitFor(() => expect(textoDaTela()).toMatch(/não deu para confirmar agora/i));
    expect(textoDaTela()).toMatch(/foi a conexão, não o link/i);
    expect(textoDaTela()).not.toMatch(/link inválido ou expirado/i);
  });

  it('o link é gasto uma vez só, mesmo com a tela montando duas vezes', async () => {
    /*
      Em desenvolvimento o React monta duas vezes de propósito. Sem a trava, a
      segunda chamada gastaria o link e mostraria "inválido" para quem acabou de
      clicar — um defeito que só aparece em dev e assusta quem testa.
    */
    await abrirVerificacao();

    await waitFor(() => expect(verificarEmail).toHaveBeenCalledTimes(1));
  });
});
