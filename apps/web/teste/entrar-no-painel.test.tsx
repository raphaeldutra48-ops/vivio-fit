import { ErroApi } from '@vivio/sdk';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A entrada no painel do profissional.
 *
 * A autorização de verdade está no banco — esta tela não libera nada. O que ela
 * decide é o que a pessoa ENTENDE quando é recusada, e cada recusa pede uma ação
 * diferente: senha errada se resolve tentando de novo, e-mail não confirmado se
 * resolve abrindo o link, limite de tentativas se resolve esperando o tempo que o
 * servidor disse, e aluno no painel se resolve indo para o celular.
 *
 * O caso do ALUNO é o que custou defeito. A recusa era só uma frase: a sessão já
 * havia sido criada, e a barreira da área profissional só verifica se HÁ usuário.
 * Fechar a aba e voltar levava o aluno para dentro do painel — menu vazio, todas
 * as telas falhando, nenhuma explicação. Era o espelho exato do defeito que o
 * aplicativo tinha com o profissional.
 */
const entrar = vi.fn();
const sair = vi.fn();
const reenviarVerificacao = vi.fn();
const navegador = { push: vi.fn(), replace: vi.fn(), back: vi.fn() };

vi.mock('../lib/sdk', () => ({
  sdk: { auth: { reenviarVerificacao: (...a: unknown[]) => reenviarVerificacao(...a) } },
}));

vi.mock('../lib/sessao', () => ({
  useSessao: () => sessao,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navegador,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/login',
}));

const profissional = {
  id: 'prof-1',
  nome: 'Diego Personal',
  email: 'diego@exemplo.com',
  papel: 'PERSONAL',
};

let sessao: {
  usuario: unknown;
  carregando: boolean;
  entrar: typeof entrar;
  sair: typeof sair;
} = { usuario: null, carregando: false, entrar, sair };

const textoDaTela = () => document.body.textContent ?? '';

async function abrirLogin() {
  const { default: Login } = await import('../app/login/page');
  return render(<Login />);
}

function preencher(email: string, senha: string): void {
  const campos = [...document.querySelectorAll('input')];
  fireEvent.change(campos[0]!, { target: { value: email } });
  fireEvent.change(campos[1]!, { target: { value: senha } });
}

beforeEach(() => {
  sessao = { usuario: null, carregando: false, entrar, sair };
  entrar.mockResolvedValue(profissional);
  sair.mockResolvedValue(undefined);
  reenviarVerificacao.mockResolvedValue(undefined);
});

describe('entrar no painel', () => {
  it('profissional entra e vai para o resumo', async () => {
    await abrirLogin();
    preencher('diego@exemplo.com', 'senha-boa');

    fireEvent.click(screen.getByText('Entrar'));

    await waitFor(() => expect(entrar).toHaveBeenCalledWith('diego@exemplo.com', 'senha-boa'));
    expect(navegador.push).toHaveBeenCalledWith('/resumo');
  });

  it('aluno é recusado E TEM A SESSÃO ENCERRADA', async () => {
    /*
      O defeito que esta prova fixa. Sem o encerramento, o aluno fechava a aba e
      voltava para dentro do painel: a barreira só olha se há usuário, e ele
      ficaria preso numa ferramenta que não é dele, sem saída visível.
    */
    entrar.mockResolvedValue({ ...profissional, papel: 'ALUNO' });
    await abrirLogin();
    preencher('ana@exemplo.com', 'senha-boa');

    fireEvent.click(screen.getByText('Entrar'));

    await waitFor(() => expect(textoDaTela()).toMatch(/esta área é do profissional/i));
    expect(sair).toHaveBeenCalled();
    expect(navegador.push).not.toHaveBeenCalled();
  });

  it('senha errada diz senha errada — e não fala de tentar mais tarde', async () => {
    entrar.mockRejectedValue(new ErroApi('CREDENCIAIS_INVALIDAS', 'inválido', 401));
    await abrirLogin();
    preencher('diego@exemplo.com', 'errada');

    fireEvent.click(screen.getByText('Entrar'));

    await waitFor(() => expect(screen.getByText('E-mail ou senha incorretos.')).toBeInTheDocument());
  });

  it('limite de tentativas repassa o tempo que o servidor disse', async () => {
    /*
      "Tente novamente" seria mentira: tentar de novo é justamente o que não vai
      funcionar, e insistir mantém o bloqueio de pé.
    */
    entrar.mockRejectedValue(
      new ErroApi('LIMITE_EXCEDIDO', 'Muitas tentativas. Tente em 15 minutos.', 429),
    );
    await abrirLogin();
    preencher('diego@exemplo.com', 'senha-boa');

    fireEvent.click(screen.getByText('Entrar'));

    await waitFor(() => expect(textoDaTela()).toMatch(/tente em 15 minutos/i));
    expect(textoDaTela()).not.toMatch(/não foi possível entrar/i);
  });

  it('e-mail não confirmado não é tratado como senha errada', async () => {
    // São coisas opostas: uma diz que a senha está errada, a outra que ela está
    // certa e falta abrir o link. Quem lê a primeira redefine uma senha que serve.
    entrar.mockRejectedValue(new ErroApi('EMAIL_NAO_VERIFICADO', 'confirme', 403));
    await abrirLogin();
    preencher('diego@exemplo.com', 'senha-boa');

    fireEvent.click(screen.getByText('Entrar'));

    await waitFor(() => expect(textoDaTela()).toMatch(/confirme seu e-mail/i));
    expect(textoDaTela()).not.toMatch(/e-mail ou senha incorretos/i);
  });

  it('reenviar o link responde sem confirmar que a conta existe', async () => {
    /*
      A API não diz se o e-mail tem conta, e a tela não inventa o que ela não
      disse — senão a página de login vira um verificador de quem usa o sistema.
    */
    entrar.mockRejectedValue(new ErroApi('EMAIL_NAO_VERIFICADO', 'confirme', 403));
    await abrirLogin();
    preencher('diego@exemplo.com', 'senha-boa');
    fireEvent.click(screen.getByText('Entrar'));
    await waitFor(() => expect(textoDaTela()).toMatch(/confirme seu e-mail/i));

    fireEvent.click(screen.getByText(/reenviar/i));

    await waitFor(() =>
      expect(reenviarVerificacao).toHaveBeenCalledWith({ email: 'diego@exemplo.com' }),
    );
    await waitFor(() => expect(textoDaTela()).toMatch(/se existir|a caminho/i));
  });
});

describe('a porta da área profissional', () => {
  it('sem sessão, manda para o login', async () => {
    const { default: Layout } = await import('../app/(pro)/layout');
    render(<Layout>conteúdo do painel</Layout>);

    await waitFor(() => expect(navegador.replace).toHaveBeenCalledWith('/login'));
    expect(textoDaTela()).not.toContain('conteúdo do painel');
  });

  it('sessão de ALUNO é encerrada na porta — e o painel não aparece', async () => {
    /*
      A segunda porta, e a razão de ela existir: sessão de aluno aqui não vem só
      do formulário desta versão. Vem de sessão antiga guardada no navegador, de
      aba aberta antes da correção, de link compartilhado. Barrar só no login
      deixaria essas de fora.
    */
    sessao = {
      usuario: { id: 'aluna-1', nome: 'Ana Souza', email: 'ana@exemplo.com', papel: 'ALUNO' },
      carregando: false,
      entrar,
      sair,
    };
    const { default: Layout } = await import('../app/(pro)/layout');
    render(<Layout>conteúdo do painel</Layout>);

    await waitFor(() => expect(sair).toHaveBeenCalled());
    expect(textoDaTela()).not.toContain('conteúdo do painel');
  });

  it('profissional vê o painel', async () => {
    sessao = { usuario: profissional, carregando: false, entrar, sair };
    const { default: Layout } = await import('../app/(pro)/layout');
    render(<Layout>conteúdo do painel</Layout>);

    await waitFor(() => expect(textoDaTela()).toContain('conteúdo do painel'));
    expect(sair).not.toHaveBeenCalled();
  });
});
