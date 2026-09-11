import { HOSTS_DE_PLAYER_EXTERNO } from '@vivio/contracts';
import type { Tema } from '@vivio/ui-native';
import { espacamento, raio, tipografia } from '@vivio/ui-native';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * Player de vídeo hospedado fora, **dentro** do app.
 *
 * É a demonstração do acervo do Prime: o arquivo não sai da conta deles, e o
 * player oficial é o jeito autorizado de assistir. Irmão do `PlayerDeVideo`,
 * que toca arquivo nosso pelo `expo-video` — este toca a PÁGINA de um player,
 * e por isso precisa de WebView.
 *
 * Recebe a URL já aprovada por `videoDeMaiorPrioridade`: lista fechada de
 * hosts e parâmetros de demonstração (sozinho, mudo, em loop) aplicados.
 *
 * A WebView não sai do player. Navegação da página principal para qualquer
 * host fora da lista é recusada — um toque na marca do player não pode levar o
 * aluno para um site de terceiro no meio do treino, sem botão de voltar.
 */
export function PlayerExterno({
  url,
  nome,
  credito,
  tema,
}: {
  url: string;
  nome: string;
  credito?: string | null;
  tema: Tema;
}) {
  const [falhou, setFalhou] = useState(false);

  if (falhou) {
    return (
      <View
        style={{
          borderRadius: raio.md,
          borderWidth: 1,
          borderColor: tema.borda,
          padding: espacamento.lg,
          gap: espacamento.xs,
        }}
      >
        <Text style={{ color: tema.textoPrimario, fontWeight: tipografia.peso.forte }}>
          Não foi possível carregar o vídeo
        </Text>
        <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
          O vídeo precisa de conexão. O passo a passo abaixo funciona sem rede.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: espacamento.xs }}>
      <View
        style={{
          width: '100%',
          aspectRatio: 16 / 9,
          borderRadius: raio.md,
          overflow: 'hidden',
          backgroundColor: '#000',
        }}
      >
        <WebView
          source={{ uri: url }}
          accessibilityLabel={`Vídeo de ${nome}`}
          style={{ flex: 1, backgroundColor: '#000' }}
          // Toca na própria tela, sem abrir o player de tela cheia do sistema, e
          // começa sozinho — o vídeo é mudo, então nenhum sistema bloqueia.
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={(pedido) => {
            // O que o próprio player carrega por dentro não é navegação da tela.
            if (pedido.isTopFrame === false) return true;
            try {
              return HOSTS_DE_PLAYER_EXTERNO.includes(new URL(pedido.url).hostname);
            } catch {
              return false;
            }
          }}
          onError={() => setFalhou(true)}
          onHttpError={() => setFalhou(true)}
        />
      </View>
      {credito ? (
        <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
          Vídeo: {credito}
        </Text>
      ) : null}
    </View>
  );
}
