import { EscopoDado, FINALIDADE_POR_ESCOPO } from '@vivio/contracts';
import { obterTema } from '@vivio/ui-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { alertas, responderAlerta } from './preparo';

/**
 * A tela onde o aluno decide o que compartilha — a mais sensível do aplicativo.
 *
 * Aqui não se prova aparência: prova-se que um toque **não** retira autorização
 * sem confirmar, que a autorização pedida é a do escopo tocado, e que o texto que
 * a pessoa lê antes de decidir é o mesmo que fica gravado no consentimento. As
 * três coisas são o que a LGPD chama de consentimento específico e informado; as
 * três estavam sem teste.
 *
 * Quem barra o acesso de fato é o banco, e isso já tem prova própria em
 * `packages/banco/teste/`. O que falha AQUI é diferente e não aparece lá: uma
 * tela que revoga por engano faz o plano de treino desaparecer sem a pessoa
 * entender por quê.
 */
const meusProfissionais = vi.fn();
const listarConsentimentos = vi.fn();
const conceder = vi.fn();
const revogar = vi.fn();
const aceitar = vi.fn();
const recusar = vi.fn();

vi.mock('../src/sdk', () => ({
  sdk: {
    vinculos: {
      meusProfissionais: (...a: unknown[]) => meusProfissionais(...a),
      aceitar: (...a: unknown[]) => aceitar(...a),
      recusar: (...a: unknown[]) => recusar(...a),
    },
    consentimentos: {
      listar: (...a: unknown[]) => listarConsentimentos(...a),
      conceder: (...a: unknown[]) => conceder(...a),
      revogar: (...a: unknown[]) => revogar(...a),
    },
  },
}));

/*
  Objeto fixo, e não um novo a cada chamada: a identidade do `usuario` decide se
  o efeito da tela recarrega. O provedor real o mantém estável, porque ele é
  estado; um dublê descuidado põe a tela em laço e o teste fica lento sem motivo.
*/
const textoDaTela = () => document.body.textContent ?? '';

const sessao = {
  tema: obterTema('claro'),
  usuario: { id: 'aluna-1', nome: 'Ana Souza', email: 'ana@exemplo.com', papel: 'ALUNO' },
  carregando: false,
};

vi.mock('../src/sessao', () => ({ useSessao: () => sessao }));

const personal = {
  id: 'vinculo-1',
  status: 'ATIVO',
  aguardandoMinhaResposta: false,
  tipo: 'PERSONAL',
  contraparte: { id: 'prof-1', nome: 'Diego Personal', papel: 'PERSONAL', avatarUrl: null },
};

/** O mesmo profissional, mas ainda como convite esperando resposta. */
const convite = {
  ...personal,
  id: 'vinculo-2',
  status: 'PENDENTE',
  aguardandoMinhaResposta: true,
};

const consentimentoDeTreino = {
  id: 'consentimento-treino',
  escopo: EscopoDado.TREINO,
  finalidade: FINALIDADE_POR_ESCOPO[EscopoDado.TREINO],
  versaoTermo: '2026-07-v1',
  concedidoEm: new Date().toISOString(),
  revogadoEm: null,
  profissional: null,
};

async function abrirTela(consentimentos: unknown[] = []): Promise<void> {
  meusProfissionais.mockResolvedValue([personal]);
  listarConsentimentos.mockResolvedValue(consentimentos);
  const { default: Equipe } = await import('../app/equipe');
  render(<Equipe />);
  await waitFor(() => expect(screen.getByText('Diego Personal')).toBeInTheDocument());
}

async function abrirComConvite(): Promise<void> {
  meusProfissionais.mockResolvedValue([convite]);
  listarConsentimentos.mockResolvedValue([]);
  const { default: Equipe } = await import('../app/equipe');
  render(<Equipe />);
  await waitFor(() => expect(screen.getByText('Recusar')).toBeInTheDocument());
}

beforeEach(() => {
  alertas.length = 0;
  conceder.mockResolvedValue(undefined);
  revogar.mockResolvedValue(undefined);
  recusar.mockResolvedValue(undefined);
  aceitar.mockResolvedValue(undefined);
});

describe('o que eu compartilho', () => {
  it('autorizar é um toque, e vale para o escopo tocado', async () => {
    await abrirTela([]);

    fireEvent.click(screen.getByText('Treino'));

    await waitFor(() => expect(conceder).toHaveBeenCalledWith({ escopo: EscopoDado.TREINO }));
    // E não pede confirmação: conceder é reversível, e a fricção estaria no
    // lugar errado.
    expect(alertas).toHaveLength(0);
  });

  it('retirar autorização PERGUNTA antes, e não retira nada sem resposta', async () => {
    /*
      A regra que este arquivo existe para defender. Retirar sem querer faz o
      plano de treino sumir da tela do aluno sem explicação, e o susto é pior
      que o toque a mais.
    */
    await abrirTela([consentimentoDeTreino]);

    fireEvent.click(screen.getByText('Treino'));

    await waitFor(() => expect(alertas).toHaveLength(1));
    expect(alertas[0]!.titulo).toMatch(/parar de compartilhar treino/i);
    // O ponto: até aqui, NADA foi revogado.
    expect(revogar).not.toHaveBeenCalled();
  });

  it('confirmando, retira — e retira o consentimento certo', async () => {
    await abrirTela([consentimentoDeTreino]);
    fireEvent.click(screen.getByText('Treino'));
    await waitFor(() => expect(alertas).toHaveLength(1));

    responderAlerta('parar de compartilhar');

    await waitFor(() => expect(revogar).toHaveBeenCalledWith('consentimento-treino'));
  });

  it('cancelando, não retira', async () => {
    await abrirTela([consentimentoDeTreino]);
    fireEvent.click(screen.getByText('Treino'));
    await waitFor(() => expect(alertas).toHaveLength(1));

    responderAlerta('cancelar');

    await new Promise((r) => setTimeout(r, 100));
    expect(revogar).not.toHaveBeenCalled();
  });

  it('recusar o convite PERGUNTA antes — o botão fica do lado do de aceitar', async () => {
    /*
      Os dois botões do convite têm o mesmo tamanho e ficam lado a lado. Um
      toque errado no da direita apagava o convite sem volta, e quem acabou de
      instalar o app não sabe que precisa pedir outro: fica com a tela inicial
      dizendo que não tem profissional nenhum.
    */
    await abrirComConvite();

    fireEvent.click(screen.getByText('Recusar'));

    await waitFor(() => expect(alertas).toHaveLength(1));
    expect(alertas[0]!.titulo).toMatch(/recusar diego personal/i);
    // O ponto: até aqui, nada foi recusado.
    expect(recusar).not.toHaveBeenCalled();
  });

  it('confirmando, recusa o convite certo', async () => {
    await abrirComConvite();
    fireEvent.click(screen.getByText('Recusar'));
    await waitFor(() => expect(alertas).toHaveLength(1));

    responderAlerta('recusar');

    await waitFor(() => expect(recusar).toHaveBeenCalledWith('vinculo-2'));
  });

  it('cancelando, o convite continua esperando resposta', async () => {
    await abrirComConvite();
    fireEvent.click(screen.getByText('Recusar'));
    await waitFor(() => expect(alertas).toHaveLength(1));

    responderAlerta('cancelar');

    await new Promise((r) => setTimeout(r, 100));
    expect(recusar).not.toHaveBeenCalled();
    expect(screen.getByText('Recusar')).toBeInTheDocument();
  });

  it('aceitar continua sendo um toque só — a pergunta é só na direção que desfaz', async () => {
    await abrirComConvite();

    fireEvent.click(screen.getByText('Aceitar e liberar treino'));

    await waitFor(() => expect(aceitar).toHaveBeenCalledWith('vinculo-2'));
    expect(alertas).toHaveLength(0);
  });

  it('falha ao carregar NÃO mostra as chaves de autorização desligadas', async () => {
    /*
      A mentira mais caríssima desta tela. Com a leitura falhando, `vinculos` e
      `consentimentos` ficavam em `[]`: a tela dizia "Ninguém ainda" a quem tem
      profissional e mostrava TODAS as autorizações desligadas a quem autorizou
      tudo. A pessoa reautoriza o que já estava autorizado, e o registro de
      consentimento — que é documento de LGPD — ganha uma linha que não
      corresponde a decisão nenhuma dela.
    */
    meusProfissionais.mockRejectedValue(new Error('Failed to fetch'));
    listarConsentimentos.mockResolvedValue([]);
    const { default: Equipe } = await import('../app/equipe');
    render(<Equipe />);

    await waitFor(() => expect(textoDaTela()).toMatch(/não deu para carregar sua equipe/i));
    expect(textoDaTela()).toMatch(/o que você já autorizou continua valendo/i);
    // Nenhuma afirmação sobre vínculo nem sobre escopo.
    expect(textoDaTela()).not.toMatch(/ninguém ainda/i);
    expect(screen.queryByText('Treino')).not.toBeInTheDocument();
    expect(conceder).not.toHaveBeenCalled();
  });

  it('o texto que a pessoa lê é o mesmo que fica gravado no consentimento', async () => {
    /*
      A finalidade vem do contrato, e é ela que é registrada. Se a tela escrevesse
      outra frase, a pessoa teria autorizado uma coisa e o sistema guardaria
      outra — o que anula o "específico e informado" da LGPD.
    */
    await abrirTela([]);

    for (const escopo of [EscopoDado.TREINO, EscopoDado.EVOLUCAO, EscopoDado.NUTRICAO]) {
      expect(screen.getByText(FINALIDADE_POR_ESCOPO[escopo])).toBeInTheDocument();
    }
  });

  it('falha ao carregar não finge que a pessoa não compartilha nada', async () => {
    /*
      Lista vazia e "não deu para carregar" se leem igual na tela e significam
      coisas opostas: a segunda, se mentisse, faria o aluno achar que já revogou
      tudo.
    */
    meusProfissionais.mockRejectedValue(new Error('rede'));
    listarConsentimentos.mockRejectedValue(new Error('rede'));
    const { default: Equipe } = await import('../app/equipe');
    render(<Equipe />);

    await waitFor(() => expect(textoDaTela()).toMatch(/não deu para carregar sua equipe/i));
    /*
      E tem saída: a causa quase sempre é rede intermitente, e um toque resolve.
      Sem o botão, a única saída visível seria fechar o app — numa tela de onde
      depende tudo o que o aluno consegue fazer.
    */
    fireEvent.click(screen.getByText('Tentar de novo'));
    await waitFor(() => expect(meusProfissionais).toHaveBeenCalledTimes(2));
  });
});
