import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { avisosProibidos, mensagemDoConsole } from './avisos-do-react';

/**
 * O DOM de uma prova não sobra para a seguinte.
 *
 * A suíte da web tem isto desde o começo, com o motivo escrito: sem a limpeza,
 * `getByLabelText` acha dois campos "Dose" vindos de renderizações diferentes.
 * A do aplicativo **não tinha** — cada tela montada ficava de pé até o fim do
 * arquivo, e era essa a origem dos "Found multiple elements" que apareciam
 * quando a máquina estava sob carga.
 *
 * Conferido antes de afirmar mais do que isto: ao acrescentar a limpeza, as 226
 * provas continuaram passando. Nenhuma estava lendo o DOM da anterior — a
 * suspeita era razoável e era falsa.
 */
afterEach(cleanup);

/**
 * Aviso proibido do React REPROVA a prova, em vez de virar linha de log.
 *
 * Esta suíte imprimia **440** avisos de atualização fora de `act` numa corrida
 * só. Nenhum era defeito de produto — mas 440 linhas de ruído são o que faz o
 * aviso seguinte passar em branco, e foi exatamente assim que dois avisos de
 * HTML inválido ficaram semanas na saída da suíte da web sem ninguém ver.
 *
 * O critério, com prova própria de amostra boa e ruim, está em
 * `avisos-do-react.ts`. Aqui só a coleta.
 */
let erroOriginal: typeof console.error;
let mensagens: string[] = [];

beforeEach(() => {
  mensagens = [];
  erroOriginal = console.error;
  console.error = (...args: unknown[]) => {
    mensagens.push(mensagemDoConsole(args));
    erroOriginal(...args);
  };
});

afterEach(() => {
  console.error = erroOriginal;
  const proibidos = avisosProibidos(mensagens);
  if (proibidos.length > 0) {
    const lista = proibidos.map((m) => `  ${m}`).join('\n');
    expect.fail(`Aviso do React que não pode aparecer:\n${lista}`);
  }
});

/**
 * Monta a tela e **espera os efeitos assentarem**, dentro de `act`.
 *
 * Toda tela do aplicativo busca no `useEffect` e guarda o resultado no estado.
 * `render` é síncrono: ele volta antes de a promessa do dublê resolver, e o
 * `setState` que vem depois acontece fora de `act`. O React avisa — "An update
 * to X inside a test was not wrapped in act(...)" — e eram **440 linhas** desse
 * aviso numa corrida da suíte.
 *
 * Nenhuma era defeito de produto. O problema é o que 440 linhas de ruído fazem
 * com a leitura: foi exatamente assim que dois avisos de HTML inválido ficaram
 * semanas na saída da suíte da web sem ninguém ver. Ruído não é inofensivo —
 * ele esconde o aviso seguinte.
 *
 * Vive aqui, e não copiado em cada arquivo, porque são 26 pontos de montagem em
 * 17 provas e duas versões disto divergiriam na primeira vez que uma mudasse.
 */
export async function renderizar(elemento: ReactElement) {
  let resultado: ReturnType<typeof render> | undefined;
  await act(async () => {
    resultado = render(elemento);
  });
  return resultado!;
}

/**
 * Toca em algo que dispara trabalho assíncrono, e espera assentar.
 *
 * O irmão do `renderizar`, para o outro momento em que o estado muda fora de
 * `act`: enviar formulário, confirmar remoção, mandar mensagem. O clique é
 * síncrono, o `await sdk.x()` de dentro do manipulador não é, e o `setState`
 * que vem depois cai fora.
 *
 * Só para os cliques que REALMENTE disparam busca ou envio. Trocar todo
 * `fireEvent.click` por isto faria a suíte esperar por nada em dezenas de
 * lugares e esconderia, atrás de uma espera genérica, justamente a corrida que
 * algumas destas provas existem para pegar.
 */
export async function tocar(elemento: Element | null): Promise<void> {
  await act(async () => {
    fireEvent.click(elemento!);
  });
}

/**
 * O que o aplicativo espera do sistema operacional, e que o navegador de teste
 * não tem.
 *
 * Cada dublê aqui é um módulo NATIVO: ele não roda fora do aparelho, e sem
 * substituto o arquivo de teste nem carrega. O que se prova com eles é a fiação
 * da tela — o que ela mostra, o que ela chama, o que ela diz quando dá errado.
 * Comportamento nativo de verdade (Keychain, seletor de fotos, vídeo) continua
 * sem cobertura, e isso está dito no `vitest.config.ts`.
 */

// O armazenamento seguro do sistema: no teste, um mapa em memória.
const cofre = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
  getItemAsync: (c: string) => Promise.resolve(cofre.get(c) ?? null),
  setItemAsync: (c: string, v: string) => {
    cofre.set(c, v);
    return Promise.resolve();
  },
  deleteItemAsync: (c: string) => {
    cofre.delete(c);
    return Promise.resolve();
  },
}));

vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));

/*
  A navegação. `Stack.Screen` existe só para declarar cabeçalho, então virar um
  nada é fiel ao que ela faz na tela; `useRouter` é espiado, porque para onde a
  tela manda a pessoa DEPOIS de uma ação é justamente o que vale testar.
*/
export const navegacao = { push: vi.fn(), replace: vi.fn(), back: vi.fn() };
vi.mock('expo-router', () => ({
  useRouter: () => navegacao,
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children?: unknown }) => children,
}));

vi.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: vi.fn(() => Promise.resolve({ canceled: true })),
  requestMediaLibraryPermissionsAsync: vi.fn(() => Promise.resolve({ granted: true })),
  MediaTypeOptions: { Images: 'Images' },
}));

vi.mock('expo-network', () => ({
  getNetworkStateAsync: vi.fn(() => Promise.resolve({ isInternetReachable: true })),
}));

vi.mock('expo-video', () => ({
  useVideoPlayer: () => ({ play: vi.fn(), pause: vi.fn() }),
  VideoView: () => null,
}));

vi.mock('react-native-webview', () => ({ WebView: () => null }));

/*
  O desenho do gráfico.

  `react-native-svg` chega ao Vitest como fonte TypeScript — `node_modules` não
  passa pelo transformador, e o arquivo estoura no primeiro tipo que aparece.
  Dublar é também o que faz sentido: geometria de SVG não se prova em jsdom, e o
  que importa nas telas de evolução é a LEITURA do gráfico — o rótulo acessível
  com "de X para Y" e os pontos tocáveis, que são desenhados FORA do `<Svg>` e
  continuam de pé aqui.
*/
const nada = () => null;
vi.mock('react-native-svg', () => ({
  default: nada,
  Svg: nada,
  Circle: nada,
  Defs: nada,
  G: nada,
  Line: nada,
  LinearGradient: nada,
  Path: nada,
  Rect: nada,
  Stop: nada,
  Text: nada,
}));

/*
  O `Alert` do React Native não existe no navegador, e é por ele que o app pede
  confirmação de coisa irreversível. Espiá-lo permite provar que a pergunta foi
  feita — e, em teste, responder por ela sem travar.
*/
interface BotaoDeAlerta {
  text?: string;
  style?: string;
  /*
    Pode ser assíncrono, e quase sempre é.

    O tipo dizia `() => void`, e isso era mais do que imprecisão: as ações atrás
    de uma confirmação — retirar autorização, apagar foto, recomeçar o treino —
    todas chamam o servidor. O lint pegou ao ver um `await` sobre algo declarado
    como `void`, e quem estava errado era a declaração.
  */
  onPress?: () => void | Promise<void>;
}

export const alertas: { titulo: string; mensagem?: string; botoes: BotaoDeAlerta[] }[] = [];

/** Toca no botão do último alerta — é assim que o teste "confirma" uma ação. */
/**
 * Responde à pergunta de confirmação, e espera a consequência assentar.
 *
 * O botão do alerta é por onde passam as ações irreversíveis do aplicativo —
 * retirar uma autorização, apagar uma foto, começar o treino do zero. Todas
 * chamam o servidor, então `onPress` dispara trabalho assíncrono: `await` aqui
 * dentro de `act` é o que faz a prova seguinte olhar o resultado e não o meio
 * do caminho.
 *
 * Era síncrona, e o `setState` da resposta caía fora de `act` em nove provas.
 */
export async function responderAlerta(texto: string): Promise<void> {
  const ultimo = alertas.at(-1);
  const botao = ultimo?.botoes.find((b) => b.text?.toLowerCase().includes(texto.toLowerCase()));
  if (!botao) throw new Error(`nenhum botão com "${texto}" no alerta: ${JSON.stringify(ultimo)}`);
  await act(async () => {
    await botao.onPress?.();
  });
}

/*
  O dublê entra por `react-native`, que a configuração aponta para
  `react-native-web` — e é de lá que o `Alert` vem no teste. A primeira versão
  interceptava `react-native/Libraries/Alert/Alert`, o caminho NATIVO, e não
  interceptava nada: o teste da revogação passava reto sem registrar pergunta
  nenhuma. O resto do módulo é preservado, senão a tela perde `View` e `Text`.
*/
/*
  Ir para segundo plano é um EVENTO de teste aqui.

  É nesse instante que o Android encerra o processo do app, e é por ele que a
  tela de treino grava o que está em andamento. O `AppState` do
  `react-native-web` escuta `visibilitychange` do navegador, que o jsdom não
  dispara de verdade — então os ouvintes ficam aqui, e o teste os chama.
*/
type OuvinteDeEstado = (estado: string) => void;
const ouvintesDeEstado = new Set<OuvinteDeEstado>();

/** Manda o app para segundo plano (ou o traz de volta), como o sistema faria. */
export function mudarEstadoDoApp(estado: 'active' | 'background' | 'inactive'): void {
  for (const ouvinte of [...ouvintesDeEstado]) ouvinte(estado);
}

vi.mock('react-native', async () => {
  const real = await import('react-native-web');
  return {
    ...real,
    default: (real as { default?: unknown }).default,
    Alert: {
      alert: (titulo: string, mensagem?: string, botoes: BotaoDeAlerta[] = []) => {
        alertas.push({ titulo, mensagem, botoes });
      },
    },
    AppState: {
      currentState: 'active',
      addEventListener: (_evento: string, ouvinte: OuvinteDeEstado) => {
        ouvintesDeEstado.add(ouvinte);
        return { remove: () => ouvintesDeEstado.delete(ouvinte) };
      },
    },
  };
});
