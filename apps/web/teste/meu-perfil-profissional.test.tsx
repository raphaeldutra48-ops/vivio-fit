import { Papel, type MeuPerfil } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MeuPerfilPagina from '../app/(pro)/cadastros/perfil/page';

/**
 * O perfil do profissional — e a ação mais irreversível do painel, até agora sem
 * prova nenhuma.
 *
 * **Trocar o registro no conselho DERRUBA a verificação.** Não é escolha de
 * produto: a plataforma confere o número no site do conselho antes de liberar, e
 * um número novo não foi conferido por ninguém. Quem perde a verificação para de
 * receber aluno novo e sai do ar na página pública — e isso acontece ao salvar um
 * formulário que também guarda nome e telefone.
 *
 * Por isso a tela faz três coisas, e esta prova trava as três:
 *
 * 1. **Avisa ANTES**, no corpo da tela, assim que o campo muda — não só no
 *    momento de salvar.
 * 2. **Pergunta ao salvar**, dizendo o que se perde.
 * 3. **Confirma depois** que a verificação caiu, em vez de só dizer "salvo" — o
 *    profissional precisa saber que o estado dele mudou.
 *
 * E o que ela NÃO pode fazer: perguntar quando não há verificação a perder. Quem
 * ainda está em análise corrigindo um dígito errado não deve ser assustado com um
 * aviso sobre perder algo que não tem.
 */
const meuPerfil = vi.fn();
const atualizarPerfil = vi.fn();

vi.mock('../lib/sdk', () => ({
  sdk: {
    me: {
      perfil: (...a: unknown[]) => meuPerfil(...a),
      atualizarPerfil: (...a: unknown[]) => atualizarPerfil(...a),
    },
  },
}));

/*
  O `profissional` é mesclado, e não substituído.

  A primeira versão tinha `...extras` DEPOIS do objeto montado, e por isso um
  `{ profissional: { verificadoEm: null } }` apagava registro, UF e tipo — a
  prova morreu procurando o campo "Registro no CREF", que tinha deixado de
  existir. Fixture que substitui onde devia mesclar falha longe da causa.
*/
const perfil = (extras: Partial<MeuPerfil> = {}): MeuPerfil =>
  ({
    id: 'prof-1',
    nome: 'Diego Ramos',
    email: 'diego@exemplo.com',
    telefone: '85999990000',
    papel: Papel.PERSONAL,
    emailVerificado: true,
    aluno: null,
    ...extras,
    profissional: {
      tipo: Papel.PERSONAL,
      registroConselho: '012345-G',
      ufRegistro: 'CE',
      especialidades: ['hipertrofia'],
      bio: null,
      verificadoEm: '2026-09-01T12:00:00.000Z',
      recusadoEm: null,
      motivoRecusa: null,
      ...(extras.profissional ?? {}),
    },
  }) as MeuPerfil;

const textoDaTela = () => document.body.textContent ?? '';
const campoDoRegistro = () => screen.getByLabelText(/registro no CREF/i);

/*
  O tipo vem do próprio espião, e não de `ReturnType<typeof vi.spyOn>`: o
  genérico sem argumento não casa com a assinatura de `window.confirm`, e o
  typecheck reprova com uma mensagem que não aponta para cá.
*/
const espiarConfirm = () => vi.spyOn(window, 'confirm');
let confirmar: ReturnType<typeof espiarConfirm>;

beforeEach(() => {
  meuPerfil.mockResolvedValue(perfil());
  atualizarPerfil.mockImplementation((d: Record<string, unknown>) =>
    Promise.resolve(perfil({ nome: String(d.nome) })),
  );
  confirmar = espiarConfirm().mockReturnValue(true);
});

afterEach(() => {
  confirmar.mockRestore();
});

describe('perfil: trocar o registro derruba a verificação', () => {
  it('avisa no corpo da tela assim que o campo muda, antes de salvar', async () => {
    /*
      O aviso na hora de salvar chega tarde: a pessoa já digitou, já conferiu o
      formulário e está com o dedo no botão. Aqui ele aparece junto do campo, no
      instante em que o número deixa de ser o verificado.
    */
    render(<MeuPerfilPagina />);
    await waitFor(() => expect(campoDoRegistro()).toHaveValue('012345-G'));
    expect(textoDaTela()).not.toMatch(/remove sua verificação/i);

    fireEvent.change(campoDoRegistro(), { target: { value: '099999-G' } });

    expect(textoDaTela()).toMatch(/remove sua verificação e exige nova análise/i);
  });

  it('PERGUNTA ao salvar, dizendo o que se perde — e não salva sem resposta', async () => {
    confirmar.mockReturnValue(false);
    render(<MeuPerfilPagina />);
    await waitFor(() => expect(campoDoRegistro()).toHaveValue('012345-G'));

    fireEvent.change(campoDoRegistro(), { target: { value: '099999-G' } });
    fireEvent.click(screen.getByText('Salvar'));

    expect(confirmar).toHaveBeenCalled();
    const pergunta = String(confirmar.mock.calls[0]![0]);
    expect(pergunta).toMatch(/remover sua verificação/i);
    // As duas consequências concretas, e não só "você perde a verificação".
    expect(pergunta).toMatch(/não recebe alunos novos/i);
    expect(pergunta).toMatch(/página pública/i);
    expect(atualizarPerfil).not.toHaveBeenCalled();
  });

  it('confirmando, salva — e diz que a verificação CAIU, não só "salvo"', async () => {
    render(<MeuPerfilPagina />);
    await waitFor(() => expect(campoDoRegistro()).toHaveValue('012345-G'));

    fireEvent.change(campoDoRegistro(), { target: { value: '099999-G' } });
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() => expect(atualizarPerfil).toHaveBeenCalled());
    expect(atualizarPerfil.mock.calls[0]![0]).toMatchObject({ registroConselho: '099999-G' });
    // "Perfil salvo." sozinho esconderia a consequência que a pessoa acabou de aceitar.
    await waitFor(() => expect(textoDaTela()).toMatch(/verificação foi removida/i));
    expect(textoDaTela()).toMatch(/nova análise/i);
  });

  it('mudar só o nome não pergunta nada — a fricção é do registro', async () => {
    render(<MeuPerfilPagina />);
    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveValue('Diego Ramos'));

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Diego R. Ramos' } });
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() => expect(atualizarPerfil).toHaveBeenCalled());
    expect(confirmar).not.toHaveBeenCalled();
    await waitFor(() => expect(textoDaTela()).toMatch(/perfil salvo/i));
    expect(textoDaTela()).not.toMatch(/verificação foi removida/i);
  });

  it('quem NÃO está verificado corrige o registro sem susto', async () => {
    /*
      Quem está em análise e digitou um dígito errado precisa corrigir. Perguntar
      "você vai perder a verificação" a quem não tem nenhuma é assustar sem
      motivo — e aviso que assusta sem motivo deixa de ser lido quando importa.
    */
    meuPerfil.mockResolvedValue(
      perfil({ profissional: { verificadoEm: null } as MeuPerfil['profissional'] }),
    );
    render(<MeuPerfilPagina />);
    await waitFor(() => expect(textoDaTela()).toMatch(/aguardando análise/i));

    fireEvent.change(campoDoRegistro(), { target: { value: '099999-G' } });
    expect(textoDaTela()).not.toMatch(/remove sua verificação/i);

    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() => expect(atualizarPerfil).toHaveBeenCalled());
    expect(confirmar).not.toHaveBeenCalled();
  });
});

describe('perfil: a situação do registro', () => {
  it('verificado mostra a data, porque é a prova de que passou pela análise', async () => {
    render(<MeuPerfilPagina />);

    await waitFor(() => expect(screen.getByText('Verificado')).toBeInTheDocument());
    expect(textoDaTela()).toMatch(/verificado em 01\/09\/2026/i);
  });

  it('recusado mostra o MOTIVO — sem ele ninguém sabe o que corrigir', async () => {
    meuPerfil.mockResolvedValue(
      perfil({
        profissional: {
          verificadoEm: null,
          recusadoEm: '2026-09-20T12:00:00.000Z',
          motivoRecusa: 'Registro não encontrado no conselho informado.',
        } as MeuPerfil['profissional'],
      }),
    );
    render(<MeuPerfilPagina />);

    await waitFor(() => expect(screen.getByText('Recusado')).toBeInTheDocument());
    expect(textoDaTela()).toMatch(/registro não encontrado no conselho informado/i);
  });

  it('o e-mail não se edita aqui, e a tela diz para onde ir', async () => {
    // Trocar e-mail exige confirmar o novo endereço; um campo editável aqui
    // prometeria uma troca que esta tela não consegue fazer.
    render(<MeuPerfilPagina />);

    await waitFor(() => expect(screen.getByLabelText('E-mail')).toBeDisabled());
    expect(textoDaTela()).toMatch(/fale com o suporte/i);
  });
});

describe('perfil: o que a tela afirma', () => {
  it('falha ao carregar diz isso, em vez de abrir o formulário vazio', async () => {
    /*
      Formulário vazio aqui é perigoso: salvar dali apagaria nome, telefone e
      registro de quem não conseguiu carregar — a tela manda o que está nos
      campos.
    */
    meuPerfil.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'fetch failed', 0));
    render(<MeuPerfilPagina />);

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível carregar seu perfil/i));
    expect(screen.queryByText('Salvar')).not.toBeInTheDocument();
    expect(textoDaTela()).not.toMatch(/fetch failed/i);
  });

  it('se o salvamento falhar, a tela não diz que salvou', async () => {
    atualizarPerfil.mockRejectedValue(
      new ErroApi('CONFLITO', 'Este registro já pertence a outro profissional.', 409),
    );
    render(<MeuPerfilPagina />);
    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveValue('Diego Ramos'));

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Diego R.' } });
    fireEvent.click(screen.getByText('Salvar'));

    // A frase do servidor passa: ela diz o que está errado, e a genérica não diria.
    await waitFor(() => expect(textoDaTela()).toMatch(/já pertence a outro profissional/i));
    expect(textoDaTela()).not.toMatch(/perfil salvo/i);
  });
});
