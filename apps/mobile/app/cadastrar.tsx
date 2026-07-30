import { senhaSchema } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { alvoToqueMin, espacamento, raio, tipografia } from '@vivio/ui-native';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import {
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

const OBJETIVOS = [
  { valor: 'HIPERTROFIA', rotulo: 'Ganhar massa' },
  { valor: 'EMAGRECIMENTO', rotulo: 'Emagrecer' },
  { valor: 'SAUDE', rotulo: 'Saúde' },
  { valor: 'PERFORMANCE', rotulo: 'Performance' },
] as const;

/** "31/12/1990" -> "1990-12-31". Devolve null enquanto está incompleta. */
function paraIso(brasileira: string): string | null {
  const casou = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(brasileira);
  if (!casou) return null;
  const [, dia, mes, ano] = casou;
  const data = new Date(`${ano}-${mes}-${dia}T12:00:00`);
  if (Number.isNaN(data.getTime())) return null;
  // Rejeita 31/02 e datas no futuro.
  if (data.getUTCDate() !== Number(dia) || data > new Date()) return null;
  return `${ano}-${mes}-${dia}`;
}

/** Digita só números; as barras aparecem sozinhas. */
function mascaraDeData(texto: string): string {
  const numeros = texto.replace(/\D/g, '').slice(0, 8);
  if (numeros.length <= 2) return numeros;
  if (numeros.length <= 4) return `${numeros.slice(0, 2)}/${numeros.slice(2)}`;
  return `${numeros.slice(0, 2)}/${numeros.slice(2, 4)}/${numeros.slice(4)}`;
}

export default function Cadastrar() {
  const { tema } = useSessao();
  const router = useRouter();

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [objetivo, setObjetivo] = useState<(typeof OBJETIVOS)[number]['valor'] | null>(null);

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  const dataIso = paraIso(nascimento);
  const erroDaSenha = senha ? senhaSchema.safeParse(senha).error?.issues[0]?.message : undefined;
  const erroDaData = nascimento.length === 10 && !dataIso ? 'Data inválida' : undefined;
  const podeEnviar =
    nome.trim().length >= 2 && email.includes('@') && senha.length > 0 && !erroDaSenha && !!dataIso;

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

  async function enviar() {
    setErro(null);
    setEnviando(true);
    try {
      await sdk.auth.registrarAluno({
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        senha,
        dataNascimento: new Date(`${dataIso}T12:00:00`),
        ...(objetivo ? { objetivo } : {}),
      });
      setPronto(true);
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === 'EMAIL_JA_CADASTRADO') {
        setErro('Este e-mail já tem conta. Tente entrar.');
      } else if (e instanceof ErroApi && e.ehTemporario) {
        setErro('Sem conexão. Verifique a internet e tente de novo.');
      } else {
        setErro('Não foi possível criar a conta. Tente de novo em instantes.');
      }
    } finally {
      setEnviando(false);
    }
  }

  const Rotulo = ({ texto }: { texto: string }) => (
    <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>{texto}</Text>
  );

  if (pronto) {
    return (
      <>
        <Stack.Screen options={{ title: 'Quase lá' }} />
        <View
          style={{
            flex: 1,
            backgroundColor: tema.fundo,
            justifyContent: 'center',
            padding: espacamento.xl,
            gap: espacamento.md,
          }}
        >
          <Text
            style={{
              fontSize: tipografia.tamanho.xl,
              fontWeight: '700',
              color: tema.textoPrimario,
            }}
          >
            Confirme seu e-mail
          </Text>
          <Text style={{ color: tema.textoSecundario }}>
            Enviamos um link para {email}. Abra o link e depois volte aqui para entrar.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/login')}
            style={{
              minHeight: alvoToqueMin,
              backgroundColor: tema.acaoFundo,
              borderRadius: raio.md,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: espacamento.lg,
            }}
          >
            <Text style={{ color: tema.acaoTexto, fontWeight: '700' }}>Ir para a entrada</Text>
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Criar conta' }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: tema.fundo }}
      >
        <ScrollView contentContainerStyle={{ padding: espacamento.xl, gap: espacamento.lg }}>
          <View style={{ gap: espacamento.xs }}>
            <Rotulo texto="Nome completo" />
            <TextInput
              accessibilityLabel="Nome completo"
              style={estiloCampo}
              value={nome}
              onChangeText={setNome}
              autoComplete="name"
            />
          </View>

          <View style={{ gap: espacamento.xs }}>
            <Rotulo texto="E-mail" />
            <TextInput
              accessibilityLabel="E-mail"
              style={estiloCampo}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
          </View>

          <View style={{ gap: espacamento.xs }}>
            <Rotulo texto="Senha" />
            <TextInput
              accessibilityLabel="Senha"
              style={estiloCampo}
              value={senha}
              onChangeText={setSenha}
              secureTextEntry
              textContentType="newPassword"
            />
            {erroDaSenha && (
              <Text style={{ color: tema.erro, fontSize: tipografia.tamanho.sm }}>
                {erroDaSenha}
              </Text>
            )}
          </View>

          <View style={{ gap: espacamento.xs }}>
            <Rotulo texto="Data de nascimento" />
            <TextInput
              accessibilityLabel="Data de nascimento"
              style={estiloCampo}
              value={nascimento}
              onChangeText={(t) => setNascimento(mascaraDeData(t))}
              keyboardType="number-pad"
              placeholder="31/12/1990"
              placeholderTextColor={tema.textoSecundario}
            />
            {erroDaData && (
              <Text style={{ color: tema.erro, fontSize: tipografia.tamanho.sm }}>{erroDaData}</Text>
            )}
          </View>

          <View style={{ gap: espacamento.sm }}>
            <Rotulo texto="Objetivo (opcional)" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.sm }}>
              {OBJETIVOS.map((o) => {
                const ativo = objetivo === o.valor;
                return (
                  <Pressable
                    key={o.valor}
                    accessibilityRole="button"
                    accessibilityState={{ selected: ativo }}
                    onPress={() => setObjetivo(ativo ? null : o.valor)}
                    style={{
                      minHeight: alvoToqueMin,
                      justifyContent: 'center',
                      paddingHorizontal: espacamento.lg,
                      borderRadius: raio.md,
                      borderWidth: 1,
                      borderColor: ativo ? tema.acaoFundo : tema.borda,
                      backgroundColor: ativo ? tema.acaoFundo : tema.superficie,
                    }}
                  >
                    <Text
                      style={{
                        color: ativo ? tema.acaoTexto : tema.textoPrimario,
                        fontWeight: '600',
                      }}
                    >
                      {o.rotulo}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {erro && <Text style={{ color: tema.erro }}>{erro}</Text>}

          <Pressable
            accessibilityRole="button"
            onPress={() => void enviar()}
            disabled={!podeEnviar || enviando}
            style={{
              minHeight: alvoToqueMin,
              backgroundColor: tema.acaoFundo,
              borderRadius: raio.md,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: !podeEnviar || enviando ? 0.5 : 1,
            }}
          >
            <Text
              style={{ color: tema.acaoTexto, fontWeight: '700', fontSize: tipografia.tamanho.lg }}
            >
              {enviando ? 'Criando…' : 'Criar conta'}
            </Text>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={() => router.replace('/login')}>
            <Text style={{ color: tema.textoSecundario, textAlign: 'center' }}>
              Já tenho conta
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
