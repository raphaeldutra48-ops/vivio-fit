import { ErroApi } from '@vivio/sdk';
import { espacamento, raio, tipografia, alvoToqueMin } from '@vivio/ui-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Marca } from '../src/componentes/Marca';
import { sdk } from '../src/sdk';
import { useSessao } from '../src/sessao';

export default function Login() {
  const { entrar, tema } = useSessao();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [faltaConfirmar, setFaltaConfirmar] = useState(false);
  const [reenviado, setReenviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setErro(null);
    setFaltaConfirmar(false);
    setReenviado(false);
    setEnviando(true);
    try {
      const usuario = await entrar(email.trim(), senha);
      if (usuario.papel !== 'ALUNO') {
        setErro('Este aplicativo é do aluno. Profissionais usam o painel na web.');
        return;
      }
      // "/" cai em app/(tabs)/index.tsx — grupos entre parênteses não entram na URL.
      router.replace('/');
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === 'EMAIL_NAO_VERIFICADO') {
        setFaltaConfirmar(true);
        return;
      }
      // Falar em conexão aqui mandaria a pessoa mexer no wi-fi por nada: o
      // servidor respondeu, e o que ele disse foi "espere". A API já manda o
      // texto com o tempo.
      if (e instanceof ErroApi && e.codigo === 'LIMITE_EXCEDIDO') {
        setErro(e.message);
        return;
      }
      setErro(
        e instanceof ErroApi && e.codigo === 'CREDENCIAIS_INVALIDAS'
          ? 'E-mail ou senha incorretos.'
          : 'Não foi possível entrar. Verifique sua conexão.',
      );
    } finally {
      setEnviando(false);
    }
  }

  async function reenviar() {
    await sdk.auth.reenviarVerificacao({ email: email.trim() }).catch(() => undefined);
    // A API não diz se o e-mail existe; a tela não inventa o que ela não disse.
    setReenviado(true);
  }

  const estiloCampo = {
    minHeight: alvoToqueMin,
    borderWidth: 1,
    borderColor: tema.borda,
    borderRadius: raio.md,
    paddingHorizontal: espacamento.md,
    color: tema.textoPrimario,
    backgroundColor: tema.superficie,
    fontSize: tipografia.tamanho.base,
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: tema.fundo, justifyContent: 'center', padding: espacamento.xl }}
    >
      <Marca tamanho={42} id="login" tema={tema} />
      <Text style={{ color: tema.textoSecundario, marginTop: espacamento.sm, marginBottom: espacamento['2xl'] }}>
        Seu treino, sua evolução.
      </Text>

      <View style={{ gap: espacamento.lg }}>
        <View style={{ gap: espacamento.xs }}>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>E-mail</Text>
          <TextInput
            accessibilityLabel="E-mail"
            style={estiloCampo}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <View style={{ gap: espacamento.xs }}>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>Senha</Text>
          <TextInput
            accessibilityLabel="Senha"
            style={estiloCampo}
            secureTextEntry
            textContentType="password"
            value={senha}
            onChangeText={setSenha}
          />
        </View>

        {erro && <Text style={{ color: tema.erro }}>{erro}</Text>}

        {faltaConfirmar && (
          <View
            style={{
              backgroundColor: tema.superficie,
              borderRadius: raio.md,
              borderWidth: 1,
              borderColor: tema.borda,
              padding: espacamento.lg,
              gap: espacamento.sm,
            }}
          >
            <Text style={{ color: tema.textoPrimario, fontWeight: '600' }}>
              Confirme seu e-mail
            </Text>
            <Text style={{ color: tema.textoSecundario }}>
              {reenviado
                ? 'Se existir uma conta pendente para este e-mail, o link já está a caminho. Confira também o spam.'
                : 'Enviamos um link quando a conta foi criada. Ele precisa ser aberto antes do primeiro acesso.'}
            </Text>
            {!reenviado && (
              <Pressable
                accessibilityRole="button"
                onPress={() => void reenviar()}
                style={{
                  minHeight: alvoToqueMin,
                  borderRadius: raio.md,
                  borderWidth: 1,
                  borderColor: tema.borda,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>
                  Reenviar o link
                </Text>
              </Pressable>
            )}
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() => void enviar()}
          disabled={enviando}
          style={{
            minHeight: alvoToqueMin,
            backgroundColor: tema.acaoFundo,
            borderRadius: raio.md,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: enviando ? 0.6 : 1,
          }}
        >
          <Text style={{ color: tema.acaoTexto, fontWeight: '700', fontSize: tipografia.tamanho.lg }}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/cadastrar')}
          style={{ minHeight: alvoToqueMin, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: tema.textoPrimario, fontWeight: '600' }}>
            Ainda não tenho conta
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
