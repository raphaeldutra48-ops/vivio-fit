import { numeroDoCampo } from '@vivio/contracts';
import { alvoToqueMin, espacamento, raio, tipografia } from '@vivio/ui-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { sdk } from '../src/sdk';
import { useSessao } from '../src/sessao';

interface Campo {
  chave:
    | 'pesoKg'
    | 'percentualGordura'
    | 'cinturaCm'
    | 'quadrilCm'
    | 'bracoCm'
    | 'coxaCm'
    | 'toraxCm';
  rotulo: string;
  unidade: string;
  destaque?: boolean;
}

const CAMPOS: Campo[] = [
  { chave: 'pesoKg', rotulo: 'Peso', unidade: 'kg', destaque: true },
  { chave: 'percentualGordura', rotulo: 'Gordura', unidade: '%', destaque: true },
  { chave: 'cinturaCm', rotulo: 'Cintura', unidade: 'cm' },
  { chave: 'quadrilCm', rotulo: 'Quadril', unidade: 'cm' },
  { chave: 'bracoCm', rotulo: 'Braço', unidade: 'cm' },
  { chave: 'coxaCm', rotulo: 'Coxa', unidade: 'cm' },
  { chave: 'toraxCm', rotulo: 'Tórax', unidade: 'cm' },
];

export default function Medidas() {
  const { usuario, tema } = useSessao();
  const router = useRouter();
  const [valores, setValores] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const preenchidos = CAMPOS.filter((c) => valores[c.chave]?.trim());

  async function salvar() {
    if (!usuario || preenchidos.length === 0) return;
    setSalvando(true);
    setErro(null);
    try {
      /*
        `numeroDoCampo` cuida da vírgula (é o separador decimal daqui) E do
        ilegível. Antes era `Number(texto.replace(...))` direto: um "78kg" ou um
        "1,7,5" digitado por engano virava `NaN`, que o `JSON.stringify` manda
        como `null`, e o servidor recusava o formulário INTEIRO com a frase
        genérica do `catch` — sem dizer qual campo tinha o problema.
      */
      const corpo: Record<string, number | Date> = { data: new Date() };
      for (const campo of preenchidos) {
        const valor = numeroDoCampo(valores[campo.chave]);
        if (valor === null) {
          setErro(`Não consegui ler o valor de ${campo.rotulo.toLowerCase()}. Confira o número.`);
          return;
        }
        corpo[campo.chave] = valor;
      }
      await sdk.medidas.registrar(usuario.id, corpo as never);
      router.replace('/composicao');
    } catch {
      setErro('Não foi possível salvar. Confira os valores e tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: tema.fundo }}
    >
      <ScrollView contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.lg }}>
        <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
          Preencha só o que você mediu hoje. Nada é obrigatório — a massa magra é
          calculada sozinha quando você informa peso e percentual de gordura.
        </Text>

        {CAMPOS.map((campo) => (
          <View key={campo.chave} style={{ gap: espacamento.xs }}>
            <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
              {campo.rotulo} ({campo.unidade})
            </Text>
            <TextInput
              accessibilityLabel={`${campo.rotulo} em ${campo.unidade}`}
              style={{
                minHeight: campo.destaque ? 60 : alvoToqueMin,
                borderWidth: 1,
                borderColor: valores[campo.chave] ? tema.primariaFundo : tema.borda,
                borderRadius: raio.md,
                paddingHorizontal: espacamento.md,
                color: tema.textoPrimario,
                backgroundColor: tema.superficie,
                fontSize: campo.destaque ? tipografia.tamanho['2xl'] : tipografia.tamanho.lg,
                fontWeight: '700',
              }}
              keyboardType="decimal-pad"
              placeholder="—"
              placeholderTextColor={tema.textoSecundario}
              value={valores[campo.chave] ?? ''}
              onChangeText={(t) => setValores((v) => ({ ...v, [campo.chave]: t }))}
            />
          </View>
        ))}

        {erro && <Text style={{ color: tema.erro }}>{erro}</Text>}
      </ScrollView>

      <View
        style={{
          padding: espacamento.lg,
          borderTopWidth: 1,
          borderTopColor: tema.borda,
          backgroundColor: tema.superficie,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Salvar medidas"
          disabled={salvando || preenchidos.length === 0}
          onPress={() => void salvar()}
          style={{
            minHeight: 56,
            borderRadius: raio.md,
            backgroundColor: tema.acaoFundo,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: salvando || preenchidos.length === 0 ? 0.5 : 1,
          }}
        >
          <Text style={{ color: tema.acaoTexto, fontWeight: '700', fontSize: tipografia.tamanho.lg }}>
            {salvando
              ? 'Salvando…'
              : preenchidos.length === 0
                ? 'Preencha ao menos um campo'
                : `Salvar ${preenchidos.length} ${preenchidos.length === 1 ? 'medida' : 'medidas'}`}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
