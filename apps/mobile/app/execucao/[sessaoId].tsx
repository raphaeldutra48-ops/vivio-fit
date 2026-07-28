import type {
  PlanoTreinoCompleto,
  SerieExecutadaInput,
  SessaoTreinoResumo,
} from '@vivio/contracts';
import { alvoToqueMin, espacamento, raio, tipografia } from '@vivio/ui-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { sdk } from '../../src/sdk';
import { useSessao } from '../../src/sessao';
import { gerarUuid } from '../../src/uuid';

interface SerieNaTela {
  itemTreinoId: string;
  serieNum: number;
  repsFeitas: string;
  cargaKg: string;
  concluida: boolean;
}

export default function Execucao() {
  const { sessaoId } = useLocalSearchParams<{ sessaoId: string }>();
  const { usuario, tema } = useSessao();
  const router = useRouter();

  const [sessao, setSessao] = useState<SessaoTreinoResumo | null>(null);
  const [series, setSeries] = useState<SerieNaTela[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrandoFeedback, setMostrandoFeedback] = useState(false);
  const [dificuldade, setDificuldade] = useState(3);
  const [teveDor, setTeveDor] = useState(false);

  // Fixados no início e mantidos por toda a sessão: o uuid é o que garante que
  // reenviar (rede oscilou, app reabriu) não crie um segundo treino.
  const clienteUuid = useRef(gerarUuid());
  const iniciadoEm = useRef(new Date());

  useEffect(() => {
    if (!usuario) return;
    sdk.treinos
      .obterAtivo(usuario.id)
      .then((plano: PlanoTreinoCompleto) => {
        const encontrada = plano.sessoes.find((s) => s.id === sessaoId);
        if (!encontrada) {
          setErro('Esta sessão não pertence ao seu plano ativo.');
          return;
        }
        setSessao(encontrada);
        setSeries(
          encontrada.itens.flatMap((item) =>
            Array.from({ length: item.series }, (_, indice) => ({
              itemTreinoId: item.id,
              serieNum: indice + 1,
              repsFeitas: '',
              // Pré-preenche com a carga prescrita: na academia, o normal é
              // confirmar, não digitar do zero.
              cargaKg: item.cargaSugeridaKg !== null ? String(item.cargaSugeridaKg) : '',
              concluida: false,
            })),
          ),
        );
      })
      .catch(() => setErro('Não foi possível carregar o treino.'));
  }, [usuario, sessaoId]);

  const concluidas = useMemo(() => series.filter((s) => s.concluida).length, [series]);

  function alterar(indice: number, mudanca: Partial<SerieNaTela>) {
    setSeries((atual) => atual.map((s, i) => (i === indice ? { ...s, ...mudanca } : s)));
  }

  async function finalizar() {
    const feitas = series.filter((s) => s.concluida);
    if (feitas.length === 0) {
      Alert.alert('Nenhuma série concluída', 'Marque ao menos uma série antes de finalizar.');
      return;
    }
    if (!usuario) return;

    setEnviando(true);
    setErro(null);
    try {
      const payload: SerieExecutadaInput[] = feitas.map((s) => ({
        itemTreinoId: s.itemTreinoId,
        serieNum: s.serieNum,
        repsFeitas: Number(s.repsFeitas || 0),
        cargaKg: Number(s.cargaKg || 0),
        falhou: false,
      }));

      await sdk.execucoes.registrar(usuario.id, {
        clienteUuid: clienteUuid.current,
        sessaoId: sessaoId!,
        iniciadoEm: iniciadoEm.current,
        finalizadoEm: new Date(),
        series: payload,
        feedback: { dificuldade, teveDor },
      });

      router.replace('/(tabs)/evolucao');
    } catch {
      setErro('Não foi possível enviar agora. Tente de novo em instantes.');
    } finally {
      setEnviando(false);
    }
  }

  if (erro && !sessao) {
    return (
      <View style={{ flex: 1, backgroundColor: tema.fundo, padding: espacamento.lg }}>
        <Text style={{ color: tema.erro }}>{erro}</Text>
      </View>
    );
  }

  if (!sessao) {
    return (
      <View style={{ flex: 1, backgroundColor: tema.fundo, padding: espacamento.lg }}>
        <Text style={{ color: tema.textoSecundario }}>Carregando treino…</Text>
      </View>
    );
  }

  const estiloNumero = {
    minHeight: alvoToqueMin,
    minWidth: 74,
    borderWidth: 1,
    borderColor: tema.borda,
    borderRadius: raio.md,
    backgroundColor: tema.fundo,
    color: tema.textoPrimario,
    fontSize: tipografia.tamanho.xl,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
  };

  return (
    <View style={{ flex: 1, backgroundColor: tema.fundo }}>
      <ScrollView contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.lg }}>
        <View>
          <Text
            style={{ fontSize: tipografia.tamanho.xl, fontWeight: '700', color: tema.textoPrimario }}
          >
            {sessao.nome}
          </Text>
          <Text style={{ color: tema.textoSecundario }}>
            {concluidas} de {series.length} séries concluídas
          </Text>
        </View>

        {sessao.itens.map((item) => (
          <View
            key={item.id}
            style={{
              backgroundColor: tema.superficie,
              borderRadius: raio.lg,
              borderWidth: 1,
              borderColor: tema.borda,
              padding: espacamento.lg,
              gap: espacamento.md,
            }}
          >
            <View>
              <Text
                style={{
                  fontSize: tipografia.tamanho.lg,
                  fontWeight: '700',
                  color: tema.textoPrimario,
                }}
              >
                {item.exercicio.nome}
              </Text>
              <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
                Alvo: {item.series} × {item.repsAlvo}
                {item.descansoSeg !== null && ` · descanso ${item.descansoSeg}s`}
              </Text>
            </View>

            {series.map((serie, indice) =>
              serie.itemTreinoId !== item.id ? null : (
                <View
                  key={`${serie.itemTreinoId}-${serie.serieNum}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: espacamento.sm }}
                >
                  <Text style={{ color: tema.textoSecundario, width: 28 }}>{serie.serieNum}ª</Text>

                  <TextInput
                    accessibilityLabel={`Repetições da série ${serie.serieNum} de ${item.exercicio.nome}`}
                    style={estiloNumero}
                    keyboardType="number-pad"
                    placeholder="reps"
                    placeholderTextColor={tema.textoSecundario}
                    value={serie.repsFeitas}
                    onChangeText={(t) => alterar(indice, { repsFeitas: t })}
                  />
                  <TextInput
                    accessibilityLabel={`Carga em quilos da série ${serie.serieNum} de ${item.exercicio.nome}`}
                    style={estiloNumero}
                    keyboardType="decimal-pad"
                    placeholder="kg"
                    placeholderTextColor={tema.textoSecundario}
                    value={serie.cargaKg}
                    onChangeText={(t) => alterar(indice, { cargaKg: t })}
                  />

                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: serie.concluida }}
                    accessibilityLabel={`Concluir série ${serie.serieNum}`}
                    onPress={() => alterar(indice, { concluida: !serie.concluida })}
                    style={{
                      flex: 1,
                      minHeight: alvoToqueMin,
                      borderRadius: raio.md,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: serie.concluida ? tema.primariaFundo : 'transparent',
                      borderWidth: 1,
                      borderColor: serie.concluida ? tema.primariaFundo : tema.borda,
                    }}
                  >
                    <Text
                      style={{
                        color: serie.concluida ? tema.primariaTexto : tema.textoSecundario,
                        fontWeight: '700',
                      }}
                    >
                      {serie.concluida ? '✓ Feita' : 'Marcar'}
                    </Text>
                  </Pressable>
                </View>
              ),
            )}
          </View>
        ))}

        {mostrandoFeedback && (
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
            <Text style={{ fontWeight: '700', color: tema.textoPrimario }}>Como foi o treino?</Text>

            <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
              Dificuldade
            </Text>
            <View style={{ flexDirection: 'row', gap: espacamento.sm }}>
              {[1, 2, 3, 4, 5].map((nivel) => (
                <Pressable
                  key={nivel}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: dificuldade === nivel }}
                  accessibilityLabel={`Dificuldade ${nivel} de 5`}
                  onPress={() => setDificuldade(nivel)}
                  style={{
                    flex: 1,
                    minHeight: alvoToqueMin,
                    borderRadius: raio.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: dificuldade === nivel ? tema.acaoFundo : 'transparent',
                    borderWidth: 1,
                    borderColor: dificuldade === nivel ? tema.acaoFundo : tema.borda,
                  }}
                >
                  <Text
                    style={{
                      color: dificuldade === nivel ? tema.acaoTexto : tema.textoPrimario,
                      fontWeight: '700',
                    }}
                  >
                    {nivel}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: teveDor }}
              onPress={() => setTeveDor((v) => !v)}
              style={{
                minHeight: alvoToqueMin,
                borderRadius: raio.md,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: teveDor ? tema.erro : tema.borda,
              }}
            >
              <Text style={{ color: teveDor ? tema.erro : tema.textoPrimario }}>
                {teveDor ? '✓ Senti dor durante o treino' : 'Senti dor durante o treino'}
              </Text>
            </Pressable>
          </View>
        )}

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
          disabled={enviando}
          onPress={() => (mostrandoFeedback ? void finalizar() : setMostrandoFeedback(true))}
          style={{
            minHeight: 56,
            backgroundColor: tema.acaoFundo,
            borderRadius: raio.md,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: enviando ? 0.6 : 1,
          }}
        >
          <Text
            style={{ color: tema.acaoTexto, fontWeight: '700', fontSize: tipografia.tamanho.lg }}
          >
            {enviando ? 'Enviando…' : mostrandoFeedback ? 'Enviar treino' : 'Finalizar treino'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
