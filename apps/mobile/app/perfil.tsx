import { SexoBiologico, type MeuPerfil } from '@vivio/contracts';
import { alvoToqueMin, espacamento, raio, tipografia } from '@vivio/ui-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { sdk } from '../src/sdk';
import { useSessao } from '../src/sessao';

const SEXOS: { valor: SexoBiologico; rotulo: string }[] = [
  { valor: 'F', rotulo: 'Feminino' },
  { valor: 'M', rotulo: 'Masculino' },
];

/**
 * Meus dados — altura e sexo biológico.
 *
 * Os dois existem por um motivo só, e a tela diz qual: a taxa metabólica. Sem
 * explicar, sexo biológico num app de treino parece pergunta de cadastro que
 * ninguém sabe por que responde — e dado sensível pedido sem motivo é o tipo
 * de coisa que faz alguém desinstalar.
 *
 * Ambos opcionais. Quem fez bioimpedância nem precisa deles: a Katch-McArdle
 * usa a massa magra medida e dispensa o palpite.
 */
export default function Perfil() {
  const { usuario, tema } = useSessao();

  const [perfil, setPerfil] = useState<MeuPerfil | null>(null);
  const [altura, setAltura] = useState('');
  const [sexo, setSexo] = useState<SexoBiologico | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    sdk.me
      .perfil()
      .then((p) => {
        setPerfil(p);
        setAltura(p.aluno?.alturaCm ? String(p.aluno.alturaCm) : '');
        setSexo(p.aluno?.sexoBiologico ?? null);
      })
      .catch(() => setErro('Não foi possível carregar seus dados.'));
  }, [usuario]);

  async function salvar() {
    if (!perfil) return;
    setSalvando(true);
    setErro(null);
    try {
      const atualizado = await sdk.me.atualizarPerfil({
        nome: perfil.nome,
        telefone: perfil.telefone ?? undefined,
        especialidades: [],
        // `null` limpa de propósito: quem preencheu por engano precisa
        // conseguir apagar, e string vazia viraria zero na conta.
        alturaCm: altura.trim() ? Number(altura) : null,
        sexoBiologico: sexo,
      });
      setPerfil(atualizado);
      setSalvo(true);
    } catch {
      setErro('Não foi possível salvar. Confira os valores e tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  if (!perfil) {
    return (
      <View style={{ flex: 1, backgroundColor: tema.fundo, justifyContent: 'center' }}>
        {erro ? (
          <Text style={{ color: tema.erro, textAlign: 'center' }}>{erro}</Text>
        ) : (
          <ActivityIndicator color={tema.acaoFundo} />
        )}
      </View>
    );
  }

  const cartao = {
    backgroundColor: tema.superficie,
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: tema.borda,
    padding: espacamento.lg,
    gap: espacamento.sm,
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: tema.fundo }}
    >
      <ScrollView contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.md }}>
        <View style={cartao}>
          <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>{perfil.nome}</Text>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            {perfil.email}
          </Text>
        </View>

        {/*
          O porquê antes da pergunta. Pedir sexo biológico num app de treino
          sem dizer para quê é o tipo de coisa que faz a pessoa fechar o app —
          e ela teria razão.
        */}
        <View style={cartao}>
          <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>
            Para calcular seu gasto calórico
          </Text>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            A fórmula que estima quanto seu corpo gasta em repouso precisa de altura e sexo. Os
            dois são opcionais — sem eles o app mostra travessão em vez de inventar um número.
          </Text>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            Se você fizer bioimpedância com seu nutricionista, o cálculo passa a usar sua massa
            magra medida e <Text style={{ fontWeight: '700' }}>nem precisa dessas respostas</Text>.
          </Text>
        </View>

        <View style={cartao}>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            Altura (cm)
          </Text>
          <TextInput
            accessibilityLabel="Altura em centímetros"
            placeholder="175"
            placeholderTextColor={tema.textoSecundario}
            keyboardType="number-pad"
            value={altura}
            onChangeText={(t) => {
              setAltura(t);
              setSalvo(false);
            }}
            maxLength={3}
            style={{
              minHeight: 56,
              borderWidth: 1,
              borderColor: altura ? tema.acaoFundo : tema.borda,
              borderRadius: raio.md,
              paddingHorizontal: espacamento.md,
              color: tema.textoPrimario,
              backgroundColor: tema.fundo,
              fontSize: tipografia.tamanho['2xl'],
              fontWeight: '700',
            }}
          />
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
            Você informa uma vez. Altura de adulto não muda.
          </Text>
        </View>

        <View style={cartao}>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            Sexo biológico
          </Text>
          <View style={{ flexDirection: 'row', gap: espacamento.md }}>
            {SEXOS.map((s) => {
              const escolhido = sexo === s.valor;
              return (
                <Pressable
                  key={s.valor}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: escolhido }}
                  accessibilityLabel={s.rotulo}
                  // Tocar de novo desmarca: é opcional de verdade, e sem isso
                  // não haveria como voltar atrás depois de responder.
                  onPress={() => {
                    setSexo(escolhido ? null : s.valor);
                    setSalvo(false);
                  }}
                  style={{
                    flex: 1,
                    minHeight: 56,
                    borderRadius: raio.md,
                    borderWidth: escolhido ? 2 : 1,
                    borderColor: escolhido ? tema.acaoFundo : tema.borda,
                    backgroundColor: escolhido ? tema.primariaFundo : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: escolhido ? tema.primariaTexto : tema.textoPrimario,
                      fontWeight: '700',
                    }}
                  >
                    {s.rotulo}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
            Usado só na fórmula do metabolismo, que foi calibrada em estudos separados por sexo.
            Toque de novo para desmarcar.
          </Text>
        </View>

        {erro && <Text style={{ color: tema.erro }}>{erro}</Text>}
        {salvo && (
          <Text style={{ color: tema.sucesso, fontWeight: '600' }}>
            ✓ Salvo. O cálculo já usa esses dados.
          </Text>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Salvar meus dados"
          disabled={salvando}
          onPress={() => void salvar()}
          style={{
            minHeight: 56,
            borderRadius: raio.md,
            backgroundColor: tema.acaoFundo,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: salvando ? 0.5 : 1,
          }}
        >
          <Text
            style={{ color: tema.acaoTexto, fontWeight: '700', fontSize: tipografia.tamanho.lg }}
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
