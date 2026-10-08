import { ErroApi } from '@vivio/sdk';
import { obterTema } from '@vivio/ui-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import * as ImagePicker from 'expo-image-picker';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { alertas, renderizar, responderAlerta } from './preparo';

/**
 * As fotos de evolução — a decisão mais difícil de desfazer no aplicativo.
 *
 * Tudo aqui gira em torno de uma promessa escrita na própria tela: "Suas fotos
 * são privadas. Nenhum profissional vê nada até você liberar, foto a foto." Uma
 * foto de corpo liberada por engano não se "desliberou": quem viu, viu. O banco
 * barra quem não foi liberado — isso tem prova própria em `packages/banco/` —
 * mas quem MONTA a lista de quem vê é esta tela, e nada abaixo dela sabe se a
 * lista que chegou é a que a pessoa quis.
 *
 * Por isso as provas são de três tipos, e não de aparência:
 *
 * 1. **O que sai do aparelho.** A foto nasce sem ninguém liberado, com o ângulo
 *    que a pessoa escolheu, e não sai nada quando ela cancela, nega a galeria ou
 *    escolhe arquivo grande demais.
 * 2. **Quem vê.** Liberar soma um papel e revogar tira só aquele; dois toques
 *    seguidos não apagam a liberação anterior; e falha de gravação não deixa a
 *    tela afirmando o que o servidor não gravou.
 * 3. **O que a tela diz quando recusam.** Formato recusado, falta de sinal e
 *    erro inesperado são três frases — "tente de novo" sobre um arquivo que
 *    nunca vai ser aceito é um convite a repetir o mesmo erro para sempre.
 */
const listar = vi.fn();
const registrar = vi.fn();
const definirVisibilidade = vi.fn();
const remover = vi.fn();
const enviarMidia = vi.fn();

vi.mock('../src/sdk', () => ({
  sdk: {
    fotos: {
      listar: (...a: unknown[]) => listar(...a),
      registrar: (...a: unknown[]) => registrar(...a),
      definirVisibilidade: (...a: unknown[]) => definirVisibilidade(...a),
      remover: (...a: unknown[]) => remover(...a),
    },
    midia: { enviar: (...a: unknown[]) => enviarMidia(...a) },
  },
}));

/*
  Objeto fixo: a recarga da tela está num `useCallback` que depende do `usuario`.
  Dublê que devolvesse objeto novo a cada render trocaria a identidade e poria a
  tela em laço — já aconteceu na primeira versão da suíte de nutrição.
*/
const usuario = { id: 'aluna-1', nome: 'Ana Souza', email: 'ana@exemplo.com', papel: 'ALUNO' };
const sessao = { tema: obterTema('claro'), nomeDoTema: 'claro', usuario, carregando: false };

vi.mock('../src/sessao', () => ({ useSessao: () => sessao }));

const foto = (visivelPara: string[] = []) => ({
  id: 'foto-1',
  data: '2026-09-20',
  angulo: 'FRENTE' as const,
  observacao: null,
  visivelPara,
  url: 'https://exemplo/assinada.jpg',
  urlExpiraEm: '2026-09-29T21:00:00.000Z',
});

/**
 * O "arquivo" escolhido na galeria.
 *
 * Um Blob de 20 MB de verdade custaria a memória do processo de teste para provar
 * uma comparação de número: a tela lê `size` e `type` e passa o corpo adiante,
 * então é isso que o dublê precisa ter.
 */
const arquivoDe = (bytes: number, type = 'image/jpeg') => ({ size: bytes, type }) as Blob;

function escolheu(arquivo: Blob): void {
  vi.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue({
    granted: true,
  } as never);
  vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///galeria/foto.jpg', mimeType: arquivo.type }],
  } as never);
  globalThis.fetch = vi.fn(() => Promise.resolve({ blob: () => Promise.resolve(arquivo) })) as never;
}

const textoDaTela = () => document.body.textContent ?? '';

async function abrirTela() {
  const { default: Fotos } = await import('../app/fotos');
  return renderizar(<Fotos />);
}

/** Toca em "+ Adicionar foto" e espera o envio terminar. */
async function adicionarFoto(): Promise<void> {
  fireEvent.click(screen.getByLabelText(/escolher foto da galeria/i));
  await waitFor(() => expect(screen.getByLabelText(/escolher foto da galeria/i)).toBeEnabled());
}

beforeEach(() => {
  alertas.length = 0;
  listar.mockResolvedValue([]);
  registrar.mockResolvedValue(foto());
  definirVisibilidade.mockResolvedValue(foto());
  remover.mockResolvedValue(undefined);
  enviarMidia.mockResolvedValue('fotos/aluna-1/abc.jpg');
  escolheu(arquivoDe(2 * 1024 * 1024));
});

describe('fotos de evolução: o que sai do aparelho', () => {
  it('a foto nasce privada — ninguém liberado no envio', async () => {
    /*
      A promessa impressa na tela. Se o envio já fosse com a equipe liberada,
      nenhuma outra camada reclamaria: o banco obedeceria a lista que chegou.
    */
    await abrirTela();

    await adicionarFoto();

    await waitFor(() =>
      expect(registrar).toHaveBeenCalledWith(
        'aluna-1',
        expect.objectContaining({ visivelPara: [] }) as unknown,
      ),
    );
  });

  it('o ângulo que vai é o que a pessoa escolheu', async () => {
    /*
      Ângulo errado não some: ele estraga a comparação de meses depois, quando a
      linha do tempo mistura costas com frente e a evolução deixa de significar
      nada.
    */
    await abrirTela();
    fireEvent.click(screen.getByLabelText(/ângulo costas/i));

    await adicionarFoto();

    await waitFor(() =>
      expect(registrar).toHaveBeenCalledWith(
        'aluna-1',
        expect.objectContaining({ angulo: 'COSTAS' }) as unknown,
      ),
    );
  });

  it('galeria negada: não sai nada, e a tela diz o que fazer', async () => {
    vi.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue({
      granted: false,
    } as never);
    await abrirTela();

    fireEvent.click(screen.getByLabelText(/escolher foto da galeria/i));

    await waitFor(() => expect(alertas).toHaveLength(1));
    expect(alertas[0]!.titulo).toMatch(/permissão/i);
    expect(enviarMidia).not.toHaveBeenCalled();
  });

  it('cancelar a escolha não envia nada — nem deixa o botão preso em "Enviando"', async () => {
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: true } as never);
    await abrirTela();

    fireEvent.click(screen.getByLabelText(/escolher foto da galeria/i));

    await waitFor(() => expect(textoDaTela()).toContain('+ Adicionar foto'));
    expect(enviarMidia).not.toHaveBeenCalled();
  });

  it('arquivo acima do limite nem sobe: a conta é feita no aparelho', async () => {
    /*
      Subir 20 MB para descobrir que passam de 15 gasta o pacote de dados da
      pessoa — e num plano móvel isso é dinheiro, não só tempo.
    */
    escolheu(arquivoDe(20 * 1024 * 1024));
    await abrirTela();

    await adicionarFoto();

    await waitFor(() => expect(textoDaTela()).toMatch(/passa de 15 MB/i));
    expect(enviarMidia).not.toHaveBeenCalled();
    expect(registrar).not.toHaveBeenCalled();
  });
});

describe('fotos de evolução: o que a tela diz quando recusam', () => {
  it('formato recusado diz QUAL é o problema, e não "tente de novo"', async () => {
    /*
      O defeito que esta prova fixa: o SDK recusa antes de subir com a frase
      exata, e a tela trocava por "Não foi possível enviar a foto. Tente de
      novo." — que faz a pessoa reenviar o mesmo arquivo para sempre.
    */
    enviarMidia.mockRejectedValue(
      new ErroApi('DADOS_INVALIDOS', 'Formato de arquivo não aceito: image/gif.', 422),
    );
    await abrirTela();

    await adicionarFoto();

    await waitFor(() => expect(textoDaTela()).toMatch(/formato de arquivo não aceito/i));
    expect(textoDaTela()).not.toMatch(/tente de novo/i);
    expect(registrar).not.toHaveBeenCalled();
  });

  it('sem sinal: não culpa o arquivo, e diz que a foto continua no aparelho', async () => {
    enviarMidia.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'Sem rede.', 0));
    await abrirTela();

    await adicionarFoto();

    await waitFor(() => expect(textoDaTela()).toMatch(/sem internet agora/i));
    expect(textoDaTela()).not.toMatch(/formato/i);
  });
});

describe('fotos de evolução: quem vê', () => {
  it('falha ao carregar NÃO diz que a pessoa não tem foto nenhuma', async () => {
    /*
      As duas frases apareciam juntas: a falha e "Nenhuma foto ainda. A primeira
      vira sua referência de 'antes'." São fotos do corpo da pessoa — ler isso
      com a linha do tempo cheia é entender que se perderam.
    */
    listar.mockRejectedValue(new Error('Failed to fetch'));
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toMatch(/não deu para buscar suas fotos/i));
    expect(textoDaTela()).not.toMatch(/nenhuma foto ainda/i);
    // E diz as duas coisas que importam: não se perderam, e continuam privadas.
    expect(textoDaTela()).toMatch(/continuam guardadas, e privadas/i);
  });

  it('a falha tem saída: um toque relê a linha do tempo', async () => {
    listar.mockRejectedValue(new Error('Failed to fetch'));
    await abrirTela();
    await waitFor(() => expect(screen.getByText('Tentar de novo')).toBeInTheDocument());

    listar.mockResolvedValue([]);
    fireEvent.click(screen.getByText('Tentar de novo'));

    await waitFor(() => expect(textoDaTela()).toMatch(/nenhuma foto ainda/i));
  });

  it('sem foto de verdade, convida a tirar a primeira', async () => {
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toMatch(/nenhuma foto ainda/i));
  });

  it('apagar que falha diz que a foto continua na linha do tempo', async () => {
    // O `.then(recarregar)` estava sem par: a rejeição não era tratada e a tela
    // não mudava nada. Quem confirmou "Apagar" vê a foto continuar ali.
    listar.mockResolvedValue([foto()]);
    remover.mockRejectedValue(new Error('Failed to fetch'));
    await abrirTela();
    await waitFor(() => expect(screen.getByLabelText(/apagar esta foto/i)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/apagar esta foto/i));
    await waitFor(() => expect(alertas).toHaveLength(1));
    await responderAlerta('apagar');

    await waitFor(() => expect(textoDaTela()).toMatch(/continua na sua linha do tempo/i));
  });

  it('liberar soma o papel tocado aos que já veem', async () => {
    listar.mockResolvedValue([foto(['NUTRICIONISTA'])]);
    await abrirTela();
    await waitFor(() => expect(textoDaTela()).toMatch(/visível para: nutricionista/i));

    fireEvent.click(screen.getByLabelText(/mostrar esta foto para personal/i));

    await waitFor(() =>
      expect(definirVisibilidade).toHaveBeenCalledWith('aluna-1', 'foto-1', [
        'NUTRICIONISTA',
        'PERSONAL',
      ]),
    );
  });

  it('revogar tira só aquele papel, e mantém o resto', async () => {
    listar.mockResolvedValue([foto(['PERSONAL', 'NUTRICIONISTA'])]);
    await abrirTela();
    await waitFor(() => expect(textoDaTela()).toMatch(/visível para/i));

    fireEvent.click(screen.getByLabelText(/mostrar esta foto para personal/i));

    await waitFor(() =>
      expect(definirVisibilidade).toHaveBeenCalledWith('aluna-1', 'foto-1', ['NUTRICIONISTA']),
    );
  });

  it('dois toques seguidos não apagam a liberação anterior', async () => {
    /*
      O segundo defeito que esta prova fixa. A chamada manda a lista INTEIRA de
      quem vê, montada do que a tela tem na mão; enquanto o primeiro pedido não
      volta, a tela ainda tem a lista antiga. Liberar personal e, em seguida,
      nutri mandava `['NUTRICIONISTA']` — apagando, em silêncio, a liberação que
      a pessoa acabara de fazer.
    */
    let concluir: () => void = () => undefined;
    definirVisibilidade.mockReturnValue(
      new Promise<void>((r) => {
        concluir = () => r();
      }),
    );
    listar.mockResolvedValue([foto([])]);
    await abrirTela();
    await waitFor(() => expect(textoDaTela()).toMatch(/só você vê esta foto/i));

    fireEvent.click(screen.getByLabelText(/mostrar esta foto para personal/i));
    fireEvent.click(screen.getByLabelText(/mostrar esta foto para nutri/i));

    await waitFor(() => expect(definirVisibilidade).toHaveBeenCalledTimes(1));
    expect(definirVisibilidade).toHaveBeenCalledWith('aluna-1', 'foto-1', ['PERSONAL']);
    // E o pedido que apagaria a liberação do personal não existe.
    expect(definirVisibilidade).not.toHaveBeenCalledWith('aluna-1', 'foto-1', ['NUTRICIONISTA']);
    /*
      A corrida já foi afirmada acima; isto só fecha a prova soltando o pedido
      que ela deixou pendurado. Dentro de `act` porque o `setState` que vem da
      resolução acontecia DEPOIS do fim do teste — e com a limpeza do DOM no
      lugar, atualizar um componente já desmontado é a próxima reclamação.
    */
    await act(async () => {
      concluir();
    });
  });

  it('se a gravação falhar, a tela NÃO diz que alguém passou a ver', async () => {
    /*
      A mentira perigosa é nos dois sentidos: dizer "visível para o personal"
      sobre uma liberação que não gravou faz a pessoa esperar um retorno que
      ninguém vai dar; dizer "só você vê" sobre o contrário é pior. Por isso a
      tela só mostra o que o servidor confirmou.
    */
    listar.mockResolvedValue([foto([])]);
    definirVisibilidade.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'Sem rede.', 0));
    await abrirTela();
    await waitFor(() => expect(textoDaTela()).toMatch(/só você vê esta foto/i));

    fireEvent.click(screen.getByLabelText(/mostrar esta foto para personal/i));

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível alterar quem vê/i));
    expect(textoDaTela()).toMatch(/só você vê esta foto/i);
  });

  it('a data mostrada é o dia da foto, e não o dia anterior', async () => {
    /*
      Fuso do Brasil é negativo: `new Date('2026-09-20')` puro cai em 19/09 às
      21h e a linha do tempo mostraria cada foto um dia antes. A tela ancora ao
      meio-dia justamente para isso, e é a única forma de a pessoa casar a foto
      com o peso que anotou naquele dia.
    */
    listar.mockResolvedValue([foto([])]);
    await abrirTela();

    await waitFor(() => expect(textoDaTela()).toContain('20/09/2026'));
  });
});

describe('fotos de evolução: apagar', () => {
  it('apagar PERGUNTA antes, e não apaga nada sem resposta', async () => {
    listar.mockResolvedValue([foto([])]);
    await abrirTela();
    await waitFor(() => expect(textoDaTela()).toMatch(/só você vê esta foto/i));

    fireEvent.click(screen.getByLabelText(/apagar esta foto/i));

    await waitFor(() => expect(alertas).toHaveLength(1));
    expect(alertas[0]!.titulo).toMatch(/apagar foto/i);
    expect(remover).not.toHaveBeenCalled();
  });

  it('confirmando, apaga a foto tocada', async () => {
    listar.mockResolvedValue([foto([])]);
    await abrirTela();
    await waitFor(() => expect(textoDaTela()).toMatch(/só você vê esta foto/i));
    fireEvent.click(screen.getByLabelText(/apagar esta foto/i));
    await waitFor(() => expect(alertas).toHaveLength(1));

    await responderAlerta('apagar');

    await waitFor(() => expect(remover).toHaveBeenCalledWith('aluna-1', 'foto-1'));
  });
});
