import {
  AnguloFoto,
  LIMITES_MIDIA,
  TipoMidia,
  type FotoEvolucaoResumo,
} from '@vivio/contracts';
import { alvoToqueMin, espacamento, raio, tipografia } from '@vivio/ui-native';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { sdk } from '../src/sdk';
import { useSessao } from '../src/sessao';

const ANGULOS: { valor: AnguloFoto; rotulo: string }[] = [
  { valor: 'FRENTE', rotulo: 'Frente' },
  { valor: 'LADO', rotulo: 'Lado' },
  { valor: 'COSTAS', rotulo: 'Costas' },
];

const PROFISSIONAIS = [
  { papel: 'PERSONAL', rotulo: 'Personal' },
  { papel: 'NUTRICIONISTA', rotulo: 'Nutri' },
  { papel: 'MEDICO', rotulo: 'Médico(a)' },
] as const;

export default function Fotos() {
  const { usuario, tema } = useSessao();
  const [fotos, setFotos] = useState<FotoEvolucaoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [angulo, setAngulo] = useState<AnguloFoto>('FRENTE');
  const [erro, setErro] = useState<string | null>(null);

  async function recarregar() {
    if (!usuario) return;
    try {
      setFotos(await sdk.fotos.listar(usuario.id));
      setErro(null);
    } catch {
      setErro('Não foi possível carregar suas fotos.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void recarregar();
  }, [usuario]);

  async function escolherEEnviar() {
    if (!usuario) return;

    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert('Permissão necessária', 'Autorize o acesso às fotos para enviar.');
      return;
    }

    const escolha = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });
    if (escolha.canceled || !escolha.assets[0]) return;

    const arquivo = escolha.assets[0];
    setEnviando(true);
    setErro(null);

    try {
      const resposta = await fetch(arquivo.uri);
      const blob = await resposta.blob();
      const mimeType = blob.type || arquivo.mimeType || 'image/jpeg';

      const limite = LIMITES_MIDIA[TipoMidia.FOTO_EVOLUCAO];
      if (blob.size > limite.tamanhoMaximoBytes) {
        setErro(`A foto passa de ${Math.round(limite.tamanhoMaximoBytes / 1024 / 1024)} MB.`);
        return;
      }

      const autorizacao = await sdk.midia.autorizarUpload({
        tipo: TipoMidia.FOTO_EVOLUCAO,
        mimeType,
        tamanhoBytes: blob.size,
      });
      await sdk.midia.enviarArquivo(autorizacao, blob);

      // A foto nasce visível só para o aluno. Liberar é um ato consciente,
      // feito depois, foto a foto.
      await sdk.fotos.registrar(usuario.id, {
        chave: autorizacao.chave,
        mimeType,
        tamanhoBytes: blob.size,
        data: new Date(),
        angulo,
        visivelPara: [],
      });

      await recarregar();
    } catch {
      setErro('Não foi possível enviar a foto. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  async function alternarVisibilidade(foto: FotoEvolucaoResumo, papel: string) {
    if (!usuario) return;
    const novos = foto.visivelPara.includes(papel)
      ? foto.visivelPara.filter((p) => p !== papel)
      : [...foto.visivelPara, papel];
    try {
      await sdk.fotos.definirVisibilidade(usuario.id, foto.id, novos);
      await recarregar();
    } catch {
      setErro('Não foi possível alterar quem vê esta foto.');
    }
  }

  function confirmarRemocao(foto: FotoEvolucaoResumo) {
    Alert.alert('Apagar foto', 'Esta foto sai da sua linha do tempo. Continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: () => {
          if (!usuario) return;
          void sdk.fotos.remover(usuario.id, foto.id).then(recarregar);
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tema.fundo }}
      contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.lg }}
    >
      <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
        Suas fotos são privadas. Nenhum profissional vê nada até você liberar, foto a foto.
      </Text>

      <View style={{ flexDirection: 'row', gap: espacamento.sm }}>
        {ANGULOS.map((op) => (
          <Pressable
            key={op.valor}
            accessibilityRole="radio"
            accessibilityState={{ selected: angulo === op.valor }}
            accessibilityLabel={`Ângulo ${op.rotulo}`}
            onPress={() => setAngulo(op.valor)}
            style={{
              flex: 1,
              minHeight: alvoToqueMin,
              borderRadius: raio.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: angulo === op.valor ? tema.primariaFundo : 'transparent',
              borderWidth: 1,
              borderColor: angulo === op.valor ? tema.primariaFundo : tema.borda,
            }}
          >
            <Text
              style={{
                color: angulo === op.valor ? tema.primariaTexto : tema.textoPrimario,
                fontWeight: '600',
              }}
            >
              {op.rotulo}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Escolher foto da galeria"
        disabled={enviando}
        onPress={() => void escolherEEnviar()}
        style={{
          minHeight: 52,
          borderRadius: raio.md,
          backgroundColor: tema.acaoFundo,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: enviando ? 0.6 : 1,
        }}
      >
        <Text style={{ color: tema.acaoTexto, fontWeight: '700', fontSize: tipografia.tamanho.lg }}>
          {enviando ? 'Enviando…' : '+ Adicionar foto'}
        </Text>
      </Pressable>

      {erro && <Text style={{ color: tema.erro }}>{erro}</Text>}
      {carregando && <ActivityIndicator color={tema.primariaFundo} />}

      {!carregando && fotos.length === 0 && (
        <Text style={{ color: tema.textoSecundario }}>
          Nenhuma foto ainda. A primeira vira sua referência de "antes".
        </Text>
      )}

      {fotos.map((foto) => (
        <View
          key={foto.id}
          style={{
            backgroundColor: tema.superficie,
            borderRadius: raio.lg,
            borderWidth: 1,
            borderColor: tema.borda,
            overflow: 'hidden',
          }}
        >
          <Image
            source={{ uri: foto.url }}
            accessibilityLabel={`Foto de ${foto.data}, ângulo ${foto.angulo.toLowerCase()}`}
            style={{ width: '100%', height: 320, backgroundColor: tema.fundo }}
            resizeMode="cover"
          />

          <View style={{ padding: espacamento.md, gap: espacamento.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>
                {new Date(`${foto.data}T12:00:00`).toLocaleDateString('pt-BR')}
              </Text>
              <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
                {foto.angulo}
              </Text>
            </View>

            <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
              {foto.visivelPara.length === 0
                ? 'Só você vê esta foto'
                : `Visível para: ${foto.visivelPara.join(', ').toLowerCase()}`}
            </Text>

            <View style={{ flexDirection: 'row', gap: espacamento.xs }}>
              {PROFISSIONAIS.map((p) => {
                const liberado = foto.visivelPara.includes(p.papel);
                return (
                  <Pressable
                    key={p.papel}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: liberado }}
                    accessibilityLabel={`Mostrar esta foto para ${p.rotulo}`}
                    onPress={() => void alternarVisibilidade(foto, p.papel)}
                    style={{
                      flex: 1,
                      minHeight: alvoToqueMin,
                      borderRadius: raio.sm,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: liberado ? tema.primariaFundo : 'transparent',
                      borderWidth: 1,
                      borderColor: liberado ? tema.primariaFundo : tema.borda,
                    }}
                  >
                    <Text
                      style={{
                        color: liberado ? tema.primariaTexto : tema.textoSecundario,
                        fontSize: tipografia.tamanho.xs,
                        fontWeight: '600',
                      }}
                    >
                      {liberado ? `✓ ${p.rotulo}` : p.rotulo}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Apagar esta foto"
              onPress={() => confirmarRemocao(foto)}
              style={{ paddingVertical: espacamento.sm }}
            >
              <Text style={{ color: tema.erro, textAlign: 'center', fontSize: tipografia.tamanho.sm }}>
                Apagar foto
              </Text>
            </Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
