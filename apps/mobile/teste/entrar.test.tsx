import { ErroApi } from '@vivio/sdk';
import { obterTema } from '@vivio/ui-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { navegacao } from './preparo';

/**
 * A porta de entrada.
 *
 * Toda a segurança de verdade está no banco — esta tela não autoriza nada. O
 * que ela decide é o que a pessoa ENTENDE quando é recusada, e cada recusa tem
 * uma causa diferente com uma ação diferente do outro lado:
 *
 * - senha errada: tentar de novo;
 * - e-mail não confirmado: abrir o link, ou pedir outro;
 * - limite de tentativas: esperar o tempo que o servidor disse;
 * - profissional no app do aluno: usar o painel na web.
 *
 * Trocar qualquer uma pela frase genérica "verifique sua conexão" manda a
 * pessoa mexer no wi-fi por um problema que não é de rede. Foi o que já
 * acontecia no cadastro, e o que estas provas impedem de voltar aqui.
 */
const reenviarVerificacao = vi.fn();
vi.mock('../src/sdk', () => ({
  sdk: { auth: { reenviarVerificacao: (...a: unknown[]) => reenviarVerificacao(...a) } },
}));

const entrar = vi.fn();
const sair = vi.fn();
const sessao = {
  tema: obterTema('claro'),
  nomeDoTema: 'claro',
  usuario: null,
  carregando: false,
  entrar,
  sair,
};
vi.mock('../src/sessao', () => ({ useSessao: () => sessao }));

const aluna = { id: 'aluna-1', nome: 'Ana Souza', email: 'ana@exemplo.com', papel: 'ALUNO' };

const textoDaTela = () => document.body.textContent ?? '';

async function abrirTela() {
  const { default: Login } = await import('../app/login');
  return render(<Login />);
}

function preencher(email: string, senha: string): void {
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: senha } });
}

beforeEach(() => {
  entrar.mockResolvedValue(aluna);
  sair.mockResolvedValue(undefined);
  reenviarVerificacao.mockResolvedValue(undefined);
});

describe('entrar', () => {
  it('aluna entra e vai para o app', async () => {
    await abrirTela();
    preencher('  ana@exemplo.com  ', 'senha-boa');

    fireEvent.click(screen.getByText('Entrar'));

    // O e-mail vai sem os espaços que o teclado do celular adiciona sozinho.
    await waitFor(() => expect(entrar).toHaveBeenCalledWith('ana@exemplo.com', 'senha-boa'));
    expect(navegacao.replace).toHaveBeenCalledWith('/');
  });

  it('profissional é recusado E TEM A SESSÃO ENCERRADA', async () => {
    /*
      O defeito que esta prova fixa. `entrar` já gravou a sessão no aparelho
      antes de a tela olhar o papel: o profissional lia "este aplicativo é do
      aluno", fechava o app e, na abertura seguinte, entrava direto nas abas —
      porque a barreira só verifica se HÁ usuário. Lá dentro, como aluno de si
      mesmo, todas as telas falham (o banco não devolve nada), e não há saída
      visível.
    */
    entrar.mockResolvedValue({ ...aluna, papel: 'PERSONAL' });
    await abrirTela();
    preencher('diego@exemplo.com', 'senha-boa');

    fireEvent.click(screen.getByText('Entrar'));

    await waitFor(() => expect(textoDaTela()).toMatch(/este aplicativo é do aluno/i));
    expect(sair).toHaveBeenCalled();
    expect(navegacao.replace).not.toHaveBeenCalled();
  });

  it('senha errada diz senha errada — e não fala em conexão', async () => {
    entrar.mockRejectedValue(new ErroApi('CREDENCIAIS_INVALIDAS', 'inválido', 401));
    await abrirTela();
    preencher('ana@exemplo.com', 'errada');

    fireEvent.click(screen.getByText('Entrar'));

    await waitFor(() => expect(screen.getByText('E-mail ou senha incorretos.')).toBeInTheDocument());
    expect(textoDaTela()).not.toMatch(/verifique sua conexão/i);
  });

  it('limite de tentativas repassa o que o servidor disse, com o tempo', async () => {
    /*
      O servidor respondeu — o que ele disse foi "espere". Traduzir isso como
      problema de conexão faz a pessoa reiniciar o roteador e tentar de novo
      imediatamente, que é exatamente o que mantém o bloqueio de pé.
    */
    entrar.mockRejectedValue(
      new ErroApi('LIMITE_EXCEDIDO', 'Muitas tentativas. Tente de novo em 15 minutos.', 429),
    );
    await abrirTela();
    preencher('ana@exemplo.com', 'senha-boa');

    fireEvent.click(screen.getByText('Entrar'));

    await waitFor(() => expect(textoDaTela()).toMatch(/tente de novo em 15 minutos/i));
    expect(textoDaTela()).not.toMatch(/verifique sua conexão/i);
  });

  it('erro sem código conhecido é o único que fala de conexão', async () => {
    entrar.mockRejectedValue(new Error('caiu'));
    await abrirTela();
    preencher('ana@exemplo.com', 'senha-boa');

    fireEvent.click(screen.getByText('Entrar'));

    await waitFor(() => expect(textoDaTela()).toMatch(/verifique sua conexão/i));
  });
});

describe('entrar: e-mail não confirmado', () => {
  it('não é tratado como senha errada', async () => {
    /*
      São coisas opostas: uma diz "sua senha está errada", a outra diz "sua
      senha está certa, falta abrir o link". Quem lê a primeira vai redefinir
      uma senha que funciona.
    */
    entrar.mockRejectedValue(new ErroApi('EMAIL_NAO_VERIFICADO', 'confirme', 403));
    await abrirTela();
    preencher('ana@exemplo.com', 'senha-boa');

    fireEvent.click(screen.getByText('Entrar'));

    await waitFor(() => expect(screen.getByText('Confirme seu e-mail')).toBeInTheDocument());
    expect(textoDaTela()).not.toMatch(/e-mail ou senha incorretos/i);
  });

  it('reenviar manda o link e responde SEM confirmar que a conta existe', async () => {
    /*
      A API não diz se o e-mail tem conta, e a tela não inventa o que ela não
      disse: "se existir uma conta pendente". Confirmar aqui transformaria a
      tela num verificador de quem usa o app.
    */
    entrar.mockRejectedValue(new ErroApi('EMAIL_NAO_VERIFICADO', 'confirme', 403));
    await abrirTela();
    preencher('  ana@exemplo.com ', 'senha-boa');
    fireEvent.click(screen.getByText('Entrar'));
    await waitFor(() => expect(screen.getByText('Confirme seu e-mail')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Reenviar o link'));

    await waitFor(() =>
      expect(reenviarVerificacao).toHaveBeenCalledWith({ email: 'ana@exemplo.com' }),
    );
    await waitFor(() => expect(textoDaTela()).toMatch(/se existir uma conta pendente/i));
  });

  it('o aviso some ao tentar entrar de novo', async () => {
    // Senão a pessoa confirma o e-mail, erra a senha, e continua lendo que o
    // problema é o link — que ela acabou de resolver.
    entrar.mockRejectedValueOnce(new ErroApi('EMAIL_NAO_VERIFICADO', 'confirme', 403));
    await abrirTela();
    preencher('ana@exemplo.com', 'senha-boa');
    fireEvent.click(screen.getByText('Entrar'));
    await waitFor(() => expect(screen.getByText('Confirme seu e-mail')).toBeInTheDocument());

    entrar.mockRejectedValue(new ErroApi('CREDENCIAIS_INVALIDAS', 'inválido', 401));
    fireEvent.click(screen.getByText('Entrar'));

    await waitFor(() => expect(screen.getByText('E-mail ou senha incorretos.')).toBeInTheDocument());
    expect(screen.queryByText('Confirme seu e-mail')).not.toBeInTheDocument();
  });
});
