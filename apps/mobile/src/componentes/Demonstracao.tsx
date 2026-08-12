import type { ExercicioResumo } from '@vivio/contracts';
import type { Tema } from '@vivio/ui-native';
import { espacamento, raio, tipografia } from '@vivio/ui-native';
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';

/**
 * A demonstração do movimento, dentro do treino.
 *
 * Fica visível por padrão em vez de esperar um toque: quem nunca fez o
 * exercício não sabe que precisa procurar, e o acompanhamento é online — não
 * há ninguém do lado para corrigir a postura na hora. Esconder a imagem
 * transfere para o aluno iniciante a responsabilidade de saber que ela existe.
 *
 * Quando não há mídia, o espaço **não** fica vazio nem inventa um ícone
 * genérico: mostra o passo a passo, se houver, ou diz com todas as letras que
 * a demonstração ainda não foi gravada. Um quadrado cinza faria a pessoa achar
 * que o app não carregou.
 */
export function Demonstracao({
  exercicio,
  url,
  aoAmpliar,
  tema,
}: {
  exercicio: ExercicioResumo;
  url: string | null;
  aoAmpliar: () => void;
  tema: Tema;
}) {
  if (url) {
    return (
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={`Ampliar demonstração de ${exercicio.nome}`}
        onPress={aoAmpliar}
        style={{
          borderRadius: raio.md,
          overflow: 'hidden',
          backgroundColor: tema.fundo,
          borderWidth: 1,
          borderColor: tema.borda,
        }}
      >
        <Image
          source={{ uri: url }}
          accessibilityLabel={`Demonstração de ${exercicio.nome}`}
          style={{ width: '100%', height: 180 }}
          resizeMode="contain"
        />
        <View style={{ paddingHorizontal: espacamento.sm, paddingBottom: espacamento.xs }}>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
            Toque para ampliar{exercicio.passos.length > 0 ? ' e ver o passo a passo' : ''}
            {/*
              O crédito acompanha a imagem porque o acervo aberto é CC-BY:
              usar obriga a creditar onde a imagem aparece. Longe dela, a
              atribuição deixa de valer.
            */}
            {exercicio.imagemCredito ? ` · ${exercicio.imagemCredito}` : ''}
          </Text>
        </View>
      </Pressable>
    );
  }

  if (exercicio.passos.length > 0) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Ver passo a passo de ${exercicio.nome}`}
        onPress={aoAmpliar}
        style={{
          borderRadius: raio.md,
          borderWidth: 1,
          borderColor: tema.borda,
          backgroundColor: tema.fundo,
          padding: espacamento.md,
          gap: espacamento.xs,
        }}
      >
        <Text style={{ color: tema.textoPrimario, fontWeight: '600' }}>
          Como fazer · {exercicio.passos.length} passos
        </Text>
        <Text numberOfLines={2} style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
          {exercicio.passos[0]}
        </Text>
      </Pressable>
    );
  }

  return (
    <View
      style={{
        borderRadius: raio.md,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: tema.borda,
        padding: espacamento.md,
      }}
    >
      <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
        Demonstração ainda não gravada para este exercício. Se tiver dúvida no movimento, pergunte
        ao seu personal antes de carregar peso.
      </Text>
    </View>
  );
}

/** Tela cheia: a imagem grande e o passo a passo inteiro, para ler com calma. */
export function DemonstracaoAmpliada({
  exercicio,
  url,
  aoFechar,
  tema,
}: {
  exercicio: ExercicioResumo | null;
  url: string | null;
  aoFechar: () => void;
  tema: Tema;
}) {
  if (!exercicio) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={aoFechar} transparent={false}>
      <View style={{ flex: 1, backgroundColor: tema.fundo }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: espacamento.lg,
            borderBottomWidth: 1,
            borderBottomColor: tema.borda,
            gap: espacamento.md,
          }}
        >
          <Text
            style={{
              color: tema.textoPrimario,
              fontWeight: '700',
              fontSize: tipografia.tamanho.lg,
              flex: 1,
            }}
          >
            {exercicio.nome}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar demonstração"
            onPress={aoFechar}
            style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xl }}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.lg }}>
          {url && (
            <View>
              <Image
                source={{ uri: url }}
                accessibilityLabel={`Demonstração de ${exercicio.nome}`}
                style={{ width: '100%', height: 320 }}
                resizeMode="contain"
              />
              {exercicio.imagemCredito && (
                <Text
                  style={{
                    color: tema.textoSecundario,
                    fontSize: tipografia.tamanho.xs,
                    marginTop: espacamento.xs,
                  }}
                >
                  {exercicio.imagemCredito}
                </Text>
              )}
            </View>
          )}

          {exercicio.passos.length > 0 && (
            <View style={{ gap: espacamento.md }}>
              <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>Como fazer</Text>
              {exercicio.passos.map((passo, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: espacamento.md }}>
                  <Text style={{ color: tema.acaoFundo, fontWeight: '700', minWidth: 20 }}>
                    {i + 1}
                  </Text>
                  <Text style={{ color: tema.textoPrimario, flex: 1 }}>{passo}</Text>
                </View>
              ))}
            </View>
          )}

          {/*
            A linha de `instrucoes` é o erro que se comete no movimento — vem
            depois do passo a passo porque só faz sentido para quem já sabe a
            sequência.
          */}
          {exercicio.instrucoes && (
            <View
              style={{
                borderRadius: raio.md,
                borderWidth: 1,
                borderColor: tema.alerta,
                padding: espacamento.md,
              }}
            >
              <Text style={{ color: tema.alerta, fontWeight: '700', marginBottom: 2 }}>
                Atenção
              </Text>
              <Text style={{ color: tema.textoPrimario }}>{exercicio.instrucoes}</Text>
            </View>
          )}

          {exercicio.equipamento && (
            <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
              Equipamento: {exercicio.equipamento}
            </Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
