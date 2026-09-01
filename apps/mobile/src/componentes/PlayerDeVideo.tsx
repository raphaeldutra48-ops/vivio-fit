import type { Tema } from '@vivio/ui-native';
import { espacamento, raio, tipografia } from '@vivio/ui-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

/**
 * O vídeo do exercício, tocado **dentro** do app.
 *
 * Antes disto a demonstração abria pelo `Linking.openURL`, que joga o aluno no
 * navegador do sistema no meio do treino. Voltar exige achar o app de novo — e
 * quem volta cai numa tela remontada, sem as séries que tinha acabado de
 * marcar. Uma dúvida de execução custava o treino inteiro.
 *
 * Três decisões que vieram do contexto de uso, que é em pé, entre duas séries:
 *
 * **Repete sozinho.** Ninguém aprende um movimento numa passada. Sem laço, o
 * aluno teria que achar o botão de recomeçar com a mão suada, olhando de
 * relance.
 *
 * **Controles nativos.** Barra de progresso, volume e tela cheia são do
 * sistema: já funcionam com leitor de tela e já são o que a pessoa conhece.
 * Redesenhar isso renderia um player pior.
 *
 * **Sem reprodução automática de áudio alto.** O vídeo entra tocando porque foi
 * pedido de propósito, mas quem estiver sem fone controla pelo botão nativo.
 */
export function PlayerDeVideo({
  url,
  nome,
  credito,
  tema,
}: {
  /** URL assinada, válida por poucos minutos. `null` enquanto carrega. */
  url: string | null;
  nome: string;
  credito?: string | null;
  tema: Tema;
}) {
  const [falhou, setFalhou] = useState(false);

  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.play();
  });

  /*
    O erro do player não vira exceção: ele chega por evento. Sem escutar, um
    link expirado ou uma rede que caiu deixaria um retângulo preto na tela, que
    é indistinguível de "ainda carregando" — e o aluno esperaria por algo que
    nunca vem.
  */
  useEffect(() => {
    setFalhou(false);
    if (!player) return;
    const inscricao = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'error' || error) setFalhou(true);
    });
    return () => inscricao.remove();
  }, [player, url]);

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

  if (!url) {
    return (
      <View
        style={{
          height: 220,
          borderRadius: raio.md,
          backgroundColor: tema.superficieElevada,
          alignItems: 'center',
          justifyContent: 'center',
          gap: espacamento.sm,
        }}
      >
        <ActivityIndicator color={tema.textoSecundario} />
        <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
          Carregando o vídeo…
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: espacamento.xs }}>
      <VideoView
        player={player}
        accessibilityLabel={`Vídeo de demonstração de ${nome}`}
        style={{ width: '100%', height: 220, borderRadius: raio.md, backgroundColor: '#000' }}
        contentFit="contain"
        nativeControls
        // Tela cheia importa aqui: num celular, 220 px de altura escondem o
        // detalhe do movimento que a pessoa abriu o vídeo para ver.
        fullscreenOptions={{ enable: true }}
        // Sem PiP: o vídeo flutuando sobre a tela de treino cobriria justamente
        // os campos de repetição e carga que a pessoa precisa preencher.
        allowsPictureInPicture={false}
      />
      {/*
        O crédito acompanha o vídeo, como acompanha a imagem: acervo aberto é
        CC-BY, e a atribuição só vale onde o material aparece.
      */}
      {credito && (
        <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
          {credito}
        </Text>
      )}
    </View>
  );
}
