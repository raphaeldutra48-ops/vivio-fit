import {
  SIGLA_TIPO_SERIE,
  TipoSerie,
  formatarSerieAnterior,
  type AnterioresDaSessao,
  type PlanoTreinoCompleto,
  type SerieExecutadaInput,
  type SessaoTreinoResumo,
} from '@vivio/contracts';
import { alvoToqueMin, espacamento, raio, tipografia } from '@vivio/ui-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { lerAnteriores, lerPlano, salvarAnteriores, salvarPlano } from '../../src/cacheTreino';
import { sdk } from '../../src/sdk';
import { useSessao } from '../../src/sessao';
import { useSincronizacao } from '../../src/sincronizacao';
import { gerarUuid } from '../../src/uuid';

interface SerieNaTela {
  chave: string;
  itemTreinoId: string;
  exercicioId: string;
  serieNum: number;
  tipo: TipoSerie;
  repsFeitas: string;
  cargaKg: string;
  concluida: boolean;
}

/** Ordem em que o toque no selo alterna o tipo da série. */
const CICLO_TIPO: TipoSerie[] = ['NORMAL', 'AQUECIMENTO', 'DROP', 'FALHA'];

function formatarDescanso(segundos: number): string {
  const min = Math.floor(segundos / 60);
  const seg = segundos % 60;
  return min > 0 ? `${min}min ${seg}s` : `${seg}s`;
}

export default function Execucao() {
  const { sessaoId } = useLocalSearchParams<{ sessaoId: string }>();
  const { usuario, tema } = useSessao();
  const { registrarTreino } = useSincronizacao();
  const router = useRouter();
  const [offline, setOffline] = useState(false);

  const [sessao, setSessao] = useState<SessaoTreinoResumo | null>(null);
  const [anteriores, setAnteriores] = useState<AnterioresDaSessao['porExercicio']>({});
  const [series, setSeries] = useState<SerieNaTela[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrandoFeedback, setMostrandoFeedback] = useState(false);
  const [dificuldade, setDificuldade] = useState(3);
  const [teveDor, setTeveDor] = useState(false);
  const [descansoRestante, setDescansoRestante] = useState<number | null>(null);

  const clienteUuid = useRef(gerarUuid());
  const iniciadoEm = useRef(new Date());

  useEffect(() => {
    if (!usuario || !sessaoId) return;

    void (async () => {
      // Rede primeiro; sem rede, o cache assume. A tela de treino é a única que
      // NÃO pode depender de conexão — é usada no subsolo da academia.
      let plano: PlanoTreinoCompleto | null = null;
      try {
        plano = await sdk.treinos.obterAtivo(usuario.id);
        await salvarPlano(usuario.id, plano);
      } catch {
        const emCache = await lerPlano(usuario.id);
        if (emCache) {
          plano = emCache.plano;
          setOffline(true);
        }
      }

      if (!plano) {
        setErro('Não foi possível carregar o treino e não há cópia salva no aparelho.');
        return;
      }

      {
        const encontrada = plano.sessoes.find((s) => s.id === sessaoId);
        if (!encontrada) {
          setErro('Esta sessão não pertence ao seu plano ativo.');
          return;
        }
        setSessao(encontrada);
        setSeries(
          encontrada.itens.flatMap((item) =>
            Array.from({ length: item.series }, (_, indice) => ({
              chave: `${item.id}-${indice + 1}`,
              itemTreinoId: item.id,
              exercicioId: item.exercicio.id,
              serieNum: indice + 1,
              tipo: 'NORMAL' as TipoSerie,
              repsFeitas: '',
              cargaKg: item.cargaSugeridaKg !== null ? String(item.cargaSugeridaKg) : '',
              concluida: false,
            })),
          ),
        );

        // Falha aqui não impede treinar: a coluna ANTERIOR cai para o cache e,
        // na pior das hipóteses, fica vazia.
        try {
          const previas = await sdk.execucoes.anteriores(usuario.id, sessaoId);
          setAnteriores(previas.porExercicio);
          await salvarAnteriores(usuario.id, sessaoId, previas);
        } catch {
          const emCache = await lerAnteriores(usuario.id, sessaoId);
          if (emCache) setAnteriores(emCache.porExercicio);
        }
      }
    })();
  }, [usuario, sessaoId]);

  // Cronômetro de descanso, disparado ao concluir uma série.
  useEffect(() => {
    if (descansoRestante === null) return;
    if (descansoRestante <= 0) {
      setDescansoRestante(null);
      return;
    }
    const id = setTimeout(() => setDescansoRestante((v) => (v === null ? null : v - 1)), 1000);
    return () => clearTimeout(id);
  }, [descansoRestante]);

  const concluidas = useMemo(() => series.filter((s) => s.concluida).length, [series]);

  function alterar(chave: string, mudanca: Partial<SerieNaTela>) {
    setSeries((atual) => atual.map((s) => (s.chave === chave ? { ...s, ...mudanca } : s)));
  }

  function alternarTipo(chave: string) {
    setSeries((atual) =>
      atual.map((s) =>
        s.chave === chave
          ? { ...s, tipo: CICLO_TIPO[(CICLO_TIPO.indexOf(s.tipo) + 1) % CICLO_TIPO.length]! }
          : s,
      ),
    );
  }

  function concluirSerie(serie: SerieNaTela, descansoSeg: number | null) {
    const virandoConcluida = !serie.concluida;
    alterar(serie.chave, { concluida: virandoConcluida });
    // Só inicia o descanso ao MARCAR — desmarcar por engano não deve disparar.
    if (virandoConcluida && descansoSeg) setDescansoRestante(descansoSeg);
  }

  function adicionarSerie(itemTreinoId: string, exercicioId: string) {
    setSeries((atual) => {
      const doItem = atual.filter((s) => s.itemTreinoId === itemTreinoId);
      const ultima = doItem[doItem.length - 1];
      const proximoNum = (ultima?.serieNum ?? 0) + 1;
      const nova: SerieNaTela = {
        chave: `${itemTreinoId}-${proximoNum}`,
        itemTreinoId,
        exercicioId,
        serieNum: proximoNum,
        tipo: 'NORMAL',
        repsFeitas: '',
        cargaKg: ultima?.cargaKg ?? '',
        concluida: false,
      };
      const ultimoIndice = atual.map((s) => s.itemTreinoId).lastIndexOf(itemTreinoId);
      const copia = [...atual];
      copia.splice(ultimoIndice + 1, 0, nova);
      return copia;
    });
  }

  async function finalizar() {
    const feitas = series.filter((s) => s.concluida);
    if (feitas.length === 0) {
      Alert.alert('Nenhuma série concluída', 'Marque ao menos uma série antes de concluir.');
      return;
    }
    if (!usuario || !sessaoId) return;

    setEnviando(true);
    setErro(null);
    try {
      const payload: SerieExecutadaInput[] = feitas.map((s) => ({
        itemTreinoId: s.itemTreinoId,
        serieNum: s.serieNum,
        repsFeitas: Number(s.repsFeitas || 0),
        cargaKg: Number(s.cargaKg || 0),
        tipo: s.tipo,
      }));

      // Vai para a fila local ANTES de tentar a rede. Falhar o envio não perde
      // o treino — ele sai da fila só quando o servidor confirmar.
      await registrarTreino(usuario.id, {
        clienteUuid: clienteUuid.current,
        sessaoId,
        iniciadoEm: iniciadoEm.current,
        finalizadoEm: new Date(),
        series: payload,
        feedback: { dificuldade, teveDor },
      });

      router.replace('/(tabs)/evolucao');
    } catch {
      setErro('Não foi possível salvar o treino no aparelho.');
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

  const celulaNumero = {
    minHeight: alvoToqueMin,
    borderRadius: raio.sm,
    backgroundColor: tema.fundo,
    borderWidth: 1,
    borderColor: tema.borda,
    color: tema.textoPrimario,
    fontSize: tipografia.tamanho.lg,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
  };

  return (
    <View style={{ flex: 1, backgroundColor: tema.fundo }}>
      {/* Barra fixa: descanso correndo à esquerda, concluir à direita */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: espacamento.lg,
          paddingVertical: espacamento.md,
          borderBottomWidth: 1,
          borderBottomColor: tema.borda,
          backgroundColor: tema.superficie,
        }}
      >
        <Text
          accessibilityLiveRegion="polite"
          style={{
            fontSize: tipografia.tamanho.xl,
            fontWeight: '700',
            color: descansoRestante !== null ? tema.acaoFundo : tema.textoSecundario,
            fontVariant: ['tabular-nums'],
          }}
        >
          {descansoRestante !== null ? formatarDescanso(descansoRestante) : `${concluidas}/${series.length}`}
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Concluir treino"
          disabled={enviando}
          onPress={() => (mostrandoFeedback ? void finalizar() : setMostrandoFeedback(true))}
          style={{
            minHeight: alvoToqueMin,
            paddingHorizontal: espacamento.xl,
            borderRadius: raio.pill,
            backgroundColor: tema.acaoFundo,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: enviando ? 0.6 : 1,
          }}
        >
          <Text style={{ color: tema.acaoTexto, fontWeight: '700' }}>
            {enviando ? 'Enviando…' : mostrandoFeedback ? 'Enviar' : 'Concluir'}
          </Text>
        </Pressable>
      </View>

      {offline && (
        <View style={{ backgroundColor: tema.alerta, paddingVertical: espacamento.xs }}>
          <Text style={{ color: '#1A1D21', textAlign: 'center', fontSize: tipografia.tamanho.sm }}>
            Sem conexão — treinando com a cópia salva. Enviamos quando a rede voltar.
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.xl }}>
        {sessao.itens.map((item) => {
          const previas = anteriores[item.exercicio.id] ?? [];
          const doItem = series.filter((s) => s.itemTreinoId === item.id);

          return (
            <View key={item.id} style={{ gap: espacamento.sm }}>
              <Text
                style={{
                  fontSize: tipografia.tamanho.lg,
                  fontWeight: '700',
                  color: tema.primariaFundo,
                }}
              >
                {item.exercicio.nome}
              </Text>

              {item.observacao ? (
                <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
                  {item.observacao}
                </Text>
              ) : null}

              {item.descansoSeg !== null && (
                <Text style={{ color: tema.acaoFundo, fontSize: tipografia.tamanho.sm }}>
                  ⏱ Descanso: {formatarDescanso(item.descansoSeg)}
                </Text>
              )}

              {/* Cabeçalho da tabela */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacamento.xs }}>
                {['SÉRIE', 'ANTERIOR', 'KG', 'REPS', '✓'].map((titulo, i) => (
                  <Text
                    key={titulo}
                    style={{
                      color: tema.textoSecundario,
                      fontSize: tipografia.tamanho.xs,
                      fontWeight: '600',
                      textAlign: 'center',
                      width: i === 0 ? 44 : undefined,
                      flex: i === 1 ? 2.2 : i === 4 ? 0 : i === 0 ? 0 : 1.2,
                      minWidth: i === 4 ? 48 : undefined,
                    }}
                  >
                    {titulo}
                  </Text>
                ))}
              </View>

              {doItem.map((serie) => {
                const anterior = previas.find((p) => p.serieNum === serie.serieNum);
                const sigla = SIGLA_TIPO_SERIE[serie.tipo];
                const corSelo =
                  serie.tipo === 'AQUECIMENTO'
                    ? tema.alerta
                    : serie.tipo === 'FALHA'
                      ? tema.erro
                      : serie.tipo === 'DROP'
                        ? tema.primariaFundo
                        : tema.textoSecundario;

                return (
                  <View
                    key={serie.chave}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: espacamento.xs,
                      paddingVertical: espacamento.xs,
                      borderRadius: raio.sm,
                      // Linha concluída ganha fundo, como na referência
                      backgroundColor: serie.concluida ? tema.superficie : 'transparent',
                    }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Tipo da série ${serie.serieNum}: ${serie.tipo.toLowerCase()}. Tocar para alternar.`}
                      onPress={() => alternarTipo(serie.chave)}
                      style={{
                        width: 44,
                        minHeight: alvoToqueMin,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: corSelo, fontWeight: '700' }}>
                        {sigla ?? serie.serieNum}
                      </Text>
                    </Pressable>

                    <Text
                      style={{
                        flex: 2.2,
                        textAlign: 'center',
                        color: tema.textoSecundario,
                        fontSize: tipografia.tamanho.sm,
                      }}
                    >
                      {anterior ? formatarSerieAnterior(anterior) : '—'}
                    </Text>

                    <TextInput
                      accessibilityLabel={`Carga em quilos da série ${serie.serieNum} de ${item.exercicio.nome}`}
                      style={[celulaNumero, { flex: 1.2 }]}
                      keyboardType="decimal-pad"
                      placeholder={anterior ? String(anterior.cargaKg) : 'kg'}
                      placeholderTextColor={tema.textoSecundario}
                      value={serie.cargaKg}
                      onChangeText={(t) => alterar(serie.chave, { cargaKg: t })}
                    />
                    <TextInput
                      accessibilityLabel={`Repetições da série ${serie.serieNum} de ${item.exercicio.nome}`}
                      style={[celulaNumero, { flex: 1.2 }]}
                      keyboardType="number-pad"
                      placeholder={anterior ? String(anterior.repsFeitas) : 'reps'}
                      placeholderTextColor={tema.textoSecundario}
                      value={serie.repsFeitas}
                      onChangeText={(t) => alterar(serie.chave, { repsFeitas: t })}
                    />

                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: serie.concluida }}
                      accessibilityLabel={`Concluir série ${serie.serieNum} de ${item.exercicio.nome}`}
                      onPress={() => concluirSerie(serie, item.descansoSeg)}
                      style={{
                        minWidth: 48,
                        minHeight: alvoToqueMin,
                        borderRadius: raio.sm,
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
                        ✓
                      </Text>
                    </Pressable>
                  </View>
                );
              })}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Adicionar série em ${item.exercicio.nome}`}
                onPress={() => adicionarSerie(item.id, item.exercicio.id)}
                style={{
                  minHeight: alvoToqueMin,
                  borderRadius: raio.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: tema.superficie,
                  borderWidth: 1,
                  borderColor: tema.borda,
                }}
              >
                <Text style={{ color: tema.textoSecundario, fontWeight: '600' }}>
                  + Adicionar Série
                </Text>
              </Pressable>
            </View>
          );
        })}

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
              accessibilityLabel="Senti dor durante o treino"
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
    </View>
  );
}
