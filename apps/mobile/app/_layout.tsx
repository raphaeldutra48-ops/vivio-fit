import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessaoProvider, useSessao } from '../src/sessao';
import { SincronizacaoProvider } from '../src/sincronizacao';

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
        <Stack.Screen name="fotos" options={{ title: 'Fotos de evolução' }} />
        <Stack.Screen name="lembretes" options={{ title: 'Lembretes' }} />
        <Stack.Screen name="composicao" options={{ title: 'Composição corporal' }} />
        <Stack.Screen name="medidas" options={{ title: 'Registrar medidas' }} />
        <Stack.Screen name="checkin" options={{ title: 'Check-in de hoje' }} />
        <Stack.Screen name="chat" options={{ title: 'Conversas' }} />
        <Stack.Screen name="recordes" options={{ title: 'Meus recordes' }} />
        <Stack.Screen name="metas" options={{ title: 'Minhas metas' }} />
        <Stack.Screen name="equipe" options={{ title: 'Minha equipe' }} />
        <Stack.Screen name="cardio" options={{ title: 'Cardio' }} />
        <Stack.Screen name="perfil" options={{ title: 'Meus dados' }} />
        <Stack.Screen name="calorimetria" options={{ title: 'Calorimetria' }} />
      </Stack>
    </>
  );
}

export default function LayoutRaiz() {
  return (
    <SafeAreaProvider>
      <SessaoProvider>
        <SincronizacaoProvider>
          <Navegacao />
        </SincronizacaoProvider>
      </SessaoProvider>
    </SafeAreaProvider>
  );
}
