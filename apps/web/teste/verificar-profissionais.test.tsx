import { ErroApi } from '@vivio/sdk';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A verificação de profissionais — o portão de entrada do sistema inteiro.
 *
 * Um clique aqui decide quem passa a ler dado de saúde de outra pessoa. Não é
 * uma aprovação administrativa: é a conferência de que aquele CRM, CRN ou CREF
 * existe, está ativo e pertence a quem se cadastrou. Verificar por engano coloca
 * alguém sem registro diante de exame, medicação e relato de dor de aluno — e
 * isso não se desfaz retroativamente, porque o que foi lido já foi lido.
 *
 * Por isso a pergunta de confirmação não é "tem certeza?": ela repete o número do
 * registro, a UF, o nome e o conselho, e diz o que a verificação libera. Quem
 * confirma sem ler ao menos teve o número na frente dos olhos.
 *
 * A recusa tem o problema oposto: ela vai para uma pessoa que investiu cadastro e
 * documento, e "não" sem explicação gera a resposta irritada no suporte. Daí o
 * motivo obrigatório — conferido na tela, para que falha de rede não seja
 * confundida com texto curto.
 */
const listarProfissionais = vi.fn();
const verificar = vi.fn();
const recusar = vi.fn();

vi.mock('../lib/sdk', () => ({
  sdk: {
    admin: {
      listarProfissionais: (...a: unknown[]) => listarProfissionais(...a),
      verificar: (...a: unknown[]) => verificar(...a),
      recusar: (...a: unknown[]) => recusar(...a),
    },
  },
}));

const profissional = (extras: Record<string, unknown> = {}) => ({
  id: 'prof-1',
  nome: 'Helena Martins',
  email: 'helena@exemplo.com',
  telefone: '11999990000',
  tipo: 'MEDICO',
  registroConselho: 'CRM 123456',
  ufRegistro: 'SP',
  status: 'PENDENTE',
  emailVerificado: true,
  bio: null,
  criadoEm: '2026-09-20T12:00:00.000Z',
  verificadoPor: null,
  verificadoEm: null,
  recusadoEm: null,
  motivoRecusa: null,
  ...extras,
});

const textoDaTela = () => document.body.textContent ?? '';

async function abrirTela() {
  const { default: Verificar } = await import('../app/(pro)/admin/profissionais/page');
  return render(<Verificar />);
}

const campoDoMotivo = () => document.querySelector('textarea') as HTMLTextAreaElement;

beforeEach(() => {
  listarProfissionais.mockResolvedValue([profissional()]);
  verificar.mockResolvedValue(undefined);
  recusar.mockResolvedValue(undefined);
});

describe('verificar profissional', () => {
  it('a pergunta mostra o registro, a UF, o nome e o conselho — e diz o que libera', async () => {
    /*
      "Tem certeza?" não ajuda ninguém a decidir. O número na frente dos olhos, no
      momento do clique, é o que permite comparar com a consulta que a pessoa
      acabou de fazer no site do conselho.
    */
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await abrirTela();
    await waitFor(() => expect(screen.getByText('Helena Martins')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Verificar'));

    const pergunta = confirmar.mock.calls[0]![0] as string;
    expect(pergunta).toContain('CRM 123456');
    expect(pergunta).toContain('SP');
    expect(pergunta).toContain('Helena Martins');
    expect(pergunta).toMatch(/dados de saúde/i);
    // E recusando a confirmação, ninguém é liberado.
    expect(verificar).not.toHaveBeenCalled();
    confirmar.mockRestore();
  });

  it('confirmando, libera — e recarrega a lista', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await abrirTela();
    await waitFor(() => expect(screen.getByText('Helena Martins')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Verificar'));

    await waitFor(() => expect(verificar).toHaveBeenCalledWith('prof-1'));
    await waitFor(() => expect(listarProfissionais.mock.calls.length).toBeGreaterThan(1));
    confirmar.mockRestore();
  });

  it('a tela mostra o registro e o link do conselho para conferir fora dela', async () => {
    // A verificação acontece no site do conselho; a tela só registra a decisão.
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toContain('CRM 123456/SP'));
    const link = document.querySelector('a[target="_blank"]') as HTMLAnchorElement;
    expect(link?.getAttribute('href')).toMatch(/^https?:\/\//);
  });

  it('e-mail não confirmado é sinalizado — verificar quem nem abriu o link é cedo', async () => {
    listarProfissionais.mockResolvedValue([profissional({ emailVerificado: false })]);
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toMatch(/e-mail não confirmado/i));
  });

  it('falha ao verificar não diz que verificou', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    verificar.mockRejectedValue(new Error('Failed to fetch'));
    await abrirTela();
    await waitFor(() => expect(screen.getByText('Helena Martins')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Verificar'));

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível verificar agora/i));
    expect(textoDaTela()).not.toMatch(/failed to fetch/i);
    confirmar.mockRestore();
  });
});

describe('recusar profissional', () => {
  async function abrirRecusa() {
    await abrirTela();
    await waitFor(() => expect(screen.getByText('Helena Martins')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Recusar'));
    await waitFor(() => expect(campoDoMotivo()).toBeInTheDocument());
  }

  it('motivo curto não sai da tela, e a frase diz por que ele existe', async () => {
    /*
      O motivo vai para quem se cadastrou. Recusar com "não" deixa a pessoa sem
      saber se o problema foi o número, a foto do documento ou o conselho errado —
      e a próxima tentativa repete o mesmo erro.
    */
    await abrirRecusa();

    fireEvent.change(campoDoMotivo(), { target: { value: 'não' } });
    fireEvent.click(screen.getByText('Confirmar recusa'));

    await waitFor(() => expect(textoDaTela()).toMatch(/pelo menos 5 letras/i));
    expect(recusar).not.toHaveBeenCalled();
  });

  it('motivo explicado é enviado, sem espaço sobrando', async () => {
    await abrirRecusa();

    fireEvent.change(campoDoMotivo(), {
      target: { value: '  O CRM informado consta como cancelado na consulta do conselho.  ' },
    });
    fireEvent.click(screen.getByText('Confirmar recusa'));

    await waitFor(() =>
      expect(recusar).toHaveBeenCalledWith('prof-1', {
        motivo: 'O CRM informado consta como cancelado na consulta do conselho.',
      }),
    );
  });

  it('falha de rede NÃO é confundida com motivo curto', async () => {
    /*
      O defeito que esta prova fixa: todo erro caía no mesmo `catch` e a tela
      acusava o texto — "o motivo precisa ter ao menos 5 caracteres" sobre três
      linhas escritas com cuidado. A pessoa reescreve o que já estava certo.
    */
    recusar.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'fetch failed', 0));
    await abrirRecusa();

    fireEvent.change(campoDoMotivo(), {
      target: { value: 'O CRM informado consta como cancelado na consulta do conselho.' },
    });
    fireEvent.click(screen.getByText('Confirmar recusa'));

    await waitFor(() => expect(textoDaTela()).toMatch(/sem conexão agora/i));
    expect(textoDaTela()).not.toMatch(/pelo menos 5 letras/i);
  });

  it('quem foi recusado mostra quando e por quê', async () => {
    // É o histórico que permite responder ao profissional que voltar cobrando.
    listarProfissionais.mockResolvedValue([
      profissional({
        status: 'RECUSADO',
        recusadoEm: '2026-09-25T12:00:00.000Z',
        motivoRecusa: 'Registro consta como cancelado.',
      }),
    ]);
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toMatch(/registro consta como cancelado/i));
    expect(textoDaTela()).toContain('25/09/2026');
  });
});

describe('a lista', () => {
  it('cada aba pergunta pelo seu status, e a busca é repassada', async () => {
    await abrirTela();
    await waitFor(() => expect(listarProfissionais).toHaveBeenCalled());
    expect(listarProfissionais.mock.calls[0]![0]).toMatchObject({ status: 'PENDENTE' });

    fireEvent.click(screen.getByText('Verificados'));

    await waitFor(() =>
      expect(
        listarProfissionais.mock.calls.some(
          (c) => (c[0] as { status: string }).status === 'VERIFICADO',
        ),
      ).toBe(true),
    );
  });

  it('falha ao carregar NÃO vira "nenhum profissional aguardando análise"', async () => {
    // A fila de análise parecendo vazia é a fila que ninguém volta a olhar — e do
    // outro lado há gente esperando para trabalhar.
    listarProfissionais.mockRejectedValue(new Error('rede'));
    await abrirTela();

    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar a lista.')).toBeInTheDocument(),
    );
    expect(textoDaTela()).not.toMatch(/nenhum profissional aguardando análise/i);
  });
});
