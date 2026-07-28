import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessaoProvider, useSessao } from '../src/sessao';

function Navegacao() {
  const { tema, nomeDoTema } = useSessao();
  return (
    <>
      <StatusBar style={nomeDoTema === 'escuro' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: tema.superficie },
          headerTintColor: tema.textoPrimario,
          contentStyle: { backgroundColor: tema.fundo },
        }}
      >
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="execucao/[sessaoId]" options={{ title: 'Treino em andamento' }} />
      </Stack>
    </>
  );
}

export default function LayoutRaiz() {
  return (
    <SafeAreaProvider>
      <SessaoProvider>
        <Navegacao />
      </SessaoProvider>
    </SafeAreaProvider>
  );
}
