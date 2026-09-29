import { espacamento, raio, tipografia } from '@vivio/ui-native';
import { Component, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSessao } from '../sessao';

/**
 * A última linha: tela em branco nunca, explicação sempre.
 *
 * Sem barreira, um erro de render derruba a árvore inteira e o React deixa a
 * tela BRANCA — sem texto, sem botão, sem caminho de volta. E não é hipótese: o
 * aplicativo já fez isso duas vezes durante a escrita das provas, por um único
 * campo ausente numa resposta. Em produção a causa é a mesma: campo novo que
 * chega `null`, resposta parcial, formato que mudou de um lado só. O aluno vê o
 * app "morrer" no meio do treino e não tem o que fazer além de fechar e
 * reabrir — e, se estava registrando série, perde o que digitou.
 *
 * O que ela promete é exatamente o que pode cumprir: o que JÁ FOI ENVIADO está
 * salvo (a fila é durável e vive fora daqui), e o que estava sendo digitado
 * nesta tela, não. Prometer mais seria mentir na hora em que a pessoa tem menos
 * motivo para acreditar no app.
 */
interface Propriedades {
  children: ReactNode;
}

interface Estado {
  /** Presente enquanto a tela estiver quebrada. */
  falha: Error | null;
}

function TelaDeFalha({ aoTentarDeNovo }: { aoTentarDeNovo: () => void }) {
  /*
    O gancho é seguro aqui: a barreira fica DENTRO do provedor de sessão, então
    o tema continua de pé mesmo com a tela quebrada. Se a própria sessão fosse a
    causa, nem o app abriria — e isso é outro problema, não este.
  */
  const { tema } = useSessao();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: tema.fundo,
        justifyContent: 'center',
        padding: espacamento.xl,
        gap: espacamento.lg,
      }}
    >
      <Text
        style={{
          color: tema.textoPrimario,
          fontSize: tipografia.tamanho.xl,
          fontWeight: '700',
        }}
      >
        Algo quebrou nesta tela
      </Text>
      <Text style={{ color: tema.textoSecundario }}>
        Não foi você. O que já tinha sido enviado está salvo — inclusive treino que ficou
        aguardando envio. O que você estava digitando aqui agora, não.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tentar carregar a tela de novo"
        onPress={aoTentarDeNovo}
        style={{
          minHeight: 52,
          borderRadius: raio.md,
          backgroundColor: tema.acaoFundo,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: tema.acaoTexto, fontWeight: '700', fontSize: tipografia.tamanho.lg }}>
          Tentar de novo
        </Text>
      </Pressable>
    </View>
  );
}

export class BarreiraDeErro extends Component<Propriedades, Estado> {
  override state: Estado = { falha: null };

  static getDerivedStateFromError(falha: Error): Estado {
    return { falha };
  }

  override componentDidCatch(falha: Error): void {
    /*
      Registrado no console, e só. Mandar para um serviço de erro exigiria
      decidir o que sai do aparelho — e daqui sai dado de saúde: nome de
      exercício, relato de dor, valor de exame. Enquanto essa decisão não for
      tomada com o dono do produto, ficar local é o certo.
    */
    console.error('[vivio] tela quebrou:', falha);
  }

  override render(): ReactNode {
    if (this.state.falha) {
      return <TelaDeFalha aoTentarDeNovo={() => this.setState({ falha: null })} />;
    }
    return this.props.children;
  }
}
