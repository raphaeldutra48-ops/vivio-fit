import { Redirect, Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { useSessao } from '../../src/sessao';

function Icone({ texto, cor }: { texto: string; cor: ColorValue }) {
  return <Text style={{ fontSize: 18, color: cor }}>{texto}</Text>;
}

export default function LayoutAbas() {
  const { usuario, carregando, tema } = useSessao();

  if (!carregando && !usuario) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: tema.superficie },
        headerTintColor: tema.textoPrimario,
        tabBarStyle: { backgroundColor: tema.superficie, borderTopColor: tema.borda },
        tabBarActiveTintColor: tema.primariaFundo,
        tabBarInactiveTintColor: tema.textoSecundario,
        sceneStyle: { backgroundColor: tema.fundo },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          tabBarIcon: ({ color }) => <Icone texto="🏠" cor={color} />,
        }}
      />
      <Tabs.Screen
        name="treino"
        options={{
          title: 'Treino',
          tabBarIcon: ({ color }) => <Icone texto="🏋️" cor={color} />,
        }}
      />
      <Tabs.Screen
        name="nutricao"
        options={{
          title: 'Nutrição',
          tabBarIcon: ({ color }) => <Icone texto="🥗" cor={color} />,
        }}
      />
      <Tabs.Screen
        name="evolucao"
        options={{
          title: 'Evolução',
          tabBarIcon: ({ color }) => <Icone texto="📈" cor={color} />,
        }}
      />
    </Tabs>
  );
}
