import { ROTULO_DO_MIME, formatarTamanho, type MaterialDoAluno } from '@vivio/contracts';
import { espacamento, raio, tipografia } from '@vivio/ui-native';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { sdk } from '../src/sdk';
import { useSessao } from '../src/sessao';

export default function Materiais() {
  const { tema } = useSessao();
  const [materiais, setMateriais] = useState<MaterialDoAluno[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = () =>
    sdk.materiais
      .meus()
      .then(setMateriais)
      .catch(() => setErro('Não foi possível carregar seus materiais.'))
      .finally(() => setCarregando(false));

  useEffect(() => {
    void carregar();
  }, []);

  async function abrir(m: MaterialDoAluno) {
    try {
      if (m.tipo === 'LINK') {
        await Linking.openURL(m.url!);
        return;
      }
      const { url } = await sdk.materiais.abrir(m.id);
      await Linking.openURL(url);
      // A primeira abertura marca "visto" no servidor — recarrega para refletir.
      await carregar();
    } catch {
      setErro('Não foi possível abrir este material.');
    }
  }

  const cartao = {
    backgroundColor: tema.superficie,
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: tema.borda,
    padding: espacamento.lg,
    gap: espacamento.xs,
  } as const;

  return (
    <>
      <Stack.Screen options={{ title: 'Materiais' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: tema.fundo }}
        contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.md }}
      >
        {carregando && <Text style={{ color: tema.textoSecundario }}>Carregando…</Text>}
        {erro && <Text style={{ color: tema.erro }}>{erro}</Text>}

        {!carregando && materiais.length === 0 && (
          <View style={cartao}>
            <Text style={{ color: tema.textoPrimario, fontWeight: '600' }}>
              Nada por aqui ainda
            </Text>
            <Text style={{ color: tema.textoSecundario }}>
              Quando seu personal, nutricionista ou médico compartilhar um guia, planilha ou
              vídeo, ele aparece nesta tela.
            </Text>
          </View>
        )}

        {materiais.map((m) => (
          <Pressable
            key={m.id}
            accessibilityRole="button"
            accessibilityLabel={`Abrir ${m.titulo}`}
            onPress={() => void abrir(m)}
            style={cartao}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: espacamento.sm }}>
              <Text
                style={{
                  flex: 1,
                  color: tema.textoPrimario,
                  fontWeight: '700',
                  fontSize: tipografia.tamanho.lg,
                }}
              >
                {m.titulo}
              </Text>
              {!m.vistoEm && (
                <View
                  style={{
                    backgroundColor: tema.acaoFundo,
                    borderRadius: raio.pill,
                    paddingHorizontal: espacamento.md,
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: tema.acaoTexto, fontSize: tipografia.tamanho.xs, fontWeight: '700' }}>
                    NOVO
                  </Text>
                </View>
              )}
            </View>

            {m.descricao && (
              <Text style={{ color: tema.textoSecundario }}>{m.descricao}</Text>
            )}

            <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
              {m.tipo === 'LINK'
                ? 'Link'
                : `${ROTULO_DO_MIME[m.mimeType ?? ''] ?? 'Arquivo'} · ${formatarTamanho(m.tamanhoBytes)}`}
              {' · '}
              {m.autor.nome}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </>
  );
}
