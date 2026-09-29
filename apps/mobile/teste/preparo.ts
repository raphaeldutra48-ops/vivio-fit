import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

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
  O `Alert` do React Native não existe no navegador, e é por ele que o app pede
  confirmação de coisa irreversível. Espiá-lo permite provar que a pergunta foi
  feita — e, em teste, responder por ela sem travar.
*/
interface BotaoDeAlerta {
  text?: string;
  style?: string;
  onPress?: () => void;
}

export const alertas: { titulo: string; mensagem?: string; botoes: BotaoDeAlerta[] }[] = [];

/** Toca no botão do último alerta — é assim que o teste "confirma" uma ação. */
export function responderAlerta(texto: string): void {
  const ultimo = alertas.at(-1);
  const botao = ultimo?.botoes.find((b) => b.text?.toLowerCase().includes(texto.toLowerCase()));
  if (!botao) throw new Error(`nenhum botão com "${texto}" no alerta: ${JSON.stringify(ultimo)}`);
  botao.onPress?.();
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
