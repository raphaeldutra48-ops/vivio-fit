import { ENERGIA_MAX, dataLocalDoCheckin } from '@vivio/contracts';
import { alvoToqueMin, espacamento, raio, tipografia } from '@vivio/ui-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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

/** A escala inteira, com nome. Número sozinho não quer dizer nada às 22h. */
const ENERGIA: { valor: number; carinha: string; rotulo: string }[] = [
  { valor: 1, carinha: '😵', rotulo: 'Exausto' },
  { valor: 2, carinha: '😕', rotulo: 'Cansado' },
  { valor: 3, carinha: '😐', rotulo: 'Normal' },
  { valor: 4, carinha: '🙂', rotulo: 'Bem' },
  { valor: 5, carinha: '😄', rotulo: 'Ótimo' },
];

/**
 * Check-in diário do aluno.
 *
 * É o registro que o app inteiro esperava e ninguém tinha como fazer: o alerta
 * de adesão que o personal recebe se alimenta daqui, e sem esta tela ele
 * aguardava um sinal que não existia.
 *
 * O campo mais importante é o **"não treinei"**. Por isso ele não é o caminho
 * difícil nem vem com cara de confissão: são dois botões do mesmo tamanho. Um
 * check-in que só aceita boa notícia não mede adesão, mede vergonha.
 */
export default function Checkin() {
  const { usuario, tema } = useSessao();
  const router = useRouter();

  const hoje = dataLocalDoCheckin();

  const [treinou, setTreinou] = useState<boolean | null>(null);
  const [energia, setEnergia] = useState<number | null>(null);
  const [teveDor, setTeveDor] = useState(false);
  const [localDor, setLocalDor] = useState('');
  const [observacao, setObservacao] = useState('');
  const [jaRespondido, setJaRespondido] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /*
    Traz o check-in de hoje, se existir. Registrar de novo no mesmo dia corrige
    o anterior — então a tela abre com o que já foi dito, e não em branco: em
    branco, quem voltasse para corrigir só a dor apagaria a energia sem
    perceber.
  */
  useEffect(() => {
    if (!usuario) return;
    let ativo = true;
    sdk.checkins
      .listar(usuario.id, 1)
      .then((lista) => {
        const deHoje = lista.find((c) => c.data.slice(0, 10) === hoje);
        if (!ativo || !deHoje) return;
        setJaRespondido(true);
        setTreinou(deHoje.treinou);
        setEnergia(deHoje.energia);
        setTeveDor(deHoje.teveDor);
        setLocalDor(deHoje.localDor ?? '');
        setObservacao(deHoje.observacao ?? '');
      })
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, [usuario, hoje]);

  const completo = treinou !== null && energia !== null;

  async function salvar() {
    if (!usuario || !completo) return;
    setSalvando(true);
    setErro(null);
    try {
      await sdk.checkins.registrar(usuario.id, {
        data: hoje,
        treinou: treinou!,
        energia: energia!,
        teveDor,
        // Local em branco não vira string vazia: a API guarda `null`, e a tela
        // do profissional distingue "não informou" de "informou nada".
        localDor: teveDor && localDor.trim() ? localDor.trim() : undefined,
        observacao: observacao.trim() || undefined,
      });
      router.back();
    } catch {
      setErro('Não foi possível salvar o check-in. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  const Cartao = ({ children }: { children: React.ReactNode }) => (
    <View
      style={{
        backgroundColor: tema.superficie,
        borderRadius: raio.lg,
        borderWidth: 1,
        borderColor: tema.borda,
        padding: espacamento.lg,
        gap: espacamento.md,
      }}
    >
      {children}
    </View>
  );

  const Pergunta = ({ children }: { children: React.ReactNode }) => (
    <Text style={{ color: tema.textoPrimario, fontWeight: '700', fontSize: tipografia.tamanho.lg }}>
      {children}
    </Text>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: tema.fundo }}
    >
      <ScrollView contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.lg }}>
        {jaRespondido && (
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            Você já fez o check-in de hoje. Pode alterar o que quiser — o registro do dia é
            substituído.
          </Text>
        )}

        <Cartao>
          <Pergunta>Você treinou hoje?</Pergunta>
          <View style={{ flexDirection: 'row', gap: espacamento.md }}>
            {[
              { valor: true, rotulo: 'Treinei' },
              { valor: false, rotulo: 'Não treinei' },
            ].map((opcao) => {
              const escolhida = treinou === opcao.valor;
              return (
                <Pressable
                  key={String(opcao.valor)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: escolhida }}
                  accessibilityLabel={opcao.rotulo}
                  onPress={() => setTreinou(opcao.valor)}
                  style={{
                    flex: 1,
                    minHeight: 56,
                    borderRadius: raio.md,
                    borderWidth: escolhida ? 2 : 1,
                    borderColor: escolhida ? tema.acaoFundo : tema.borda,
                    backgroundColor: escolhida ? tema.primariaFundo : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: escolhida ? tema.primariaTexto : tema.textoPrimario,
                      fontWeight: '700',
                    }}
                  >
                    {opcao.rotulo}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            Dia sem treino também conta. É registrando os dois que seu personal enxerga como está a
            sua rotina de verdade.
          </Text>
        </Cartao>

        <Cartao>
          <Pergunta>Como está sua energia?</Pergunta>
          <View style={{ flexDirection: 'row', gap: espacamento.xs }}>
            {ENERGIA.map((nivel) => {
              const escolhido = energia === nivel.valor;
              return (
                <Pressable
                  key={nivel.valor}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: escolhido }}
                  accessibilityLabel={`${nivel.rotulo}, ${nivel.valor} de ${ENERGIA_MAX}`}
                  onPress={() => setEnergia(nivel.valor)}
                  style={{
                    flex: 1,
                    minHeight: 72,
                    borderRadius: raio.md,
                    borderWidth: escolhido ? 2 : 1,
                    borderColor: escolhido ? tema.acaoFundo : tema.borda,
                    backgroundColor: escolhido ? tema.primariaFundo : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                  }}
                >
                  <Text style={{ fontSize: 24 }}>{nivel.carinha}</Text>
                  <Text
                    style={{
                      color: escolhido ? tema.primariaTexto : tema.textoSecundario,
                      fontSize: tipografia.tamanho.xs,
                      fontWeight: escolhido ? '700' : '400',
                    }}
                  >
                    {nivel.rotulo}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Cartao>

        <Cartao>
          <Pergunta>Sentiu alguma dor?</Pergunta>
          <View style={{ flexDirection: 'row', gap: espacamento.md }}>
            {[
              { valor: false, rotulo: 'Nenhuma' },
              { valor: true, rotulo: 'Senti dor' },
            ].map((opcao) => {
              const escolhida = teveDor === opcao.valor;
              return (
                <Pressable
                  key={String(opcao.valor)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: escolhida }}
                  accessibilityLabel={opcao.rotulo}
                  onPress={() => setTeveDor(opcao.valor)}
                  style={{
                    flex: 1,
                    minHeight: 56,
                    borderRadius: raio.md,
                    borderWidth: escolhida ? 2 : 1,
                    borderColor: escolhida ? tema.acaoFundo : tema.borda,
                    backgroundColor: escolhida ? tema.primariaFundo : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: escolhida ? tema.primariaTexto : tema.textoPrimario,
                      fontWeight: '700',
                    }}
                  >
                    {opcao.rotulo}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {teveDor && (
            <View style={{ gap: espacamento.xs }}>
              <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
                Onde? (opcional)
              </Text>
              <TextInput
                accessibilityLabel="Onde você sentiu dor"
                placeholder="ombro direito, lombar…"
                placeholderTextColor={tema.textoSecundario}
                value={localDor}
                onChangeText={setLocalDor}
                maxLength={120}
                style={{
                  minHeight: alvoToqueMin,
                  borderWidth: 1,
                  borderColor: tema.borda,
                  borderRadius: raio.md,
                  paddingHorizontal: espacamento.md,
                  color: tema.textoPrimario,
                  backgroundColor: tema.fundo,
                }}
              />
              {/*
                Dizer para quem vai a informação é o que faz alguém escrever
                "ombro direito" em vez de deixar em branco.
              */}
              <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
                Seu personal vê isso e pode ajustar o treino antes que vire lesão.
              </Text>
            </View>
          )}
        </Cartao>

        <Cartao>
          <Pergunta>Quer contar mais alguma coisa?</Pergunta>
          <TextInput
            accessibilityLabel="Observação do dia"
            placeholder="dormi mal, viajei, estava sem tempo…"
            placeholderTextColor={tema.textoSecundario}
            value={observacao}
            onChangeText={setObservacao}
            maxLength={500}
            multiline
            style={{
              minHeight: 90,
              borderWidth: 1,
              borderColor: tema.borda,
              borderRadius: raio.md,
              padding: espacamento.md,
              color: tema.textoPrimario,
              backgroundColor: tema.fundo,
              textAlignVertical: 'top',
            }}
          />
        </Cartao>

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
          accessibilityLabel="Salvar check-in de hoje"
          disabled={salvando || !completo}
          onPress={() => void salvar()}
          style={{
            minHeight: 56,
            borderRadius: raio.md,
            backgroundColor: tema.acaoFundo,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: salvando || !completo ? 0.5 : 1,
          }}
        >
          <Text
            style={{ color: tema.acaoTexto, fontWeight: '700', fontSize: tipografia.tamanho.lg }}
          >
            {salvando
              ? 'Salvando…'
              : treinou === null
                ? 'Responda se treinou hoje'
                : energia === null
                  ? 'Escolha como está sua energia'
                  : jaRespondido
                    ? 'Atualizar check-in'
                    : 'Salvar check-in'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
