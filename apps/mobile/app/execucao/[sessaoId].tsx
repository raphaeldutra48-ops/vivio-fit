import {
  ROTULO_INTENSIDADE,
  ROTULO_RECORDE,
  ROTULO_TIPO_CARDIO,
  dataLocalDoCheckin,
  SIGLA_TIPO_SERIE,
  TipoSerie,
  formatarSerieAnterior,
  type AnterioresDaSessao,
  type ExercicioResumo,
  type Intensidade,
  type TipoCardio,
  type MidiaDeExercicios,
  type PlanoTreinoCompleto,
  type RecordeBatido,
  type SerieExecutadaInput,
  type SessaoTreinoResumo,
} from '@vivio/contracts';
import { alvoToqueMin, espacamento, raio, tipografia } from '@vivio/ui-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { lerAnteriores, lerPlano, salvarAnteriores, salvarPlano } from '../../src/cacheTreino';
import { sdk } from '../../src/sdk';
import { useSessao } from '../../src/sessao';
import { useSincronizacao } from '../../src/sincronizacao';
import { Demonstracao, DemonstracaoAmpliada } from '../../src/componentes/Demonstracao';
import { DOR_VAZIA, QuestionarioDeDor, type RespostaDeDor } from '../../src/componentes/QuestionarioDeDor';
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

/** Só os três da escala: no fim do treino ninguém quer ler tabela. */
const INTENSIDADES_RAPIDAS: Intensidade[] = ['LEVE', 'MODERADA', 'INTENSA'];

function formatarDescanso(segundos: number): string {
  const min = Math.floor(segundos / 60);
  const seg = segundos % 60;
  return min > 0 ? `${min}min ${seg}s` : `${seg}s`;
}

/** `MM:SS` — o formato de relógio, que se lê de relance no meio da série. */
function cronometro(segundos: number): string {
  const min = Math.floor(segundos / 60);
  const seg = segundos % 60;
  return `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
}

/**
 * A escala de dificuldade com nome.
 *
 * O número sozinho não quer dizer a mesma coisa para duas pessoas: "4" é
 * pesado para quem começou ontem e leve para quem treina há dez anos. A
 * palavra ancora a escala — e é ela que o personal lê do outro lado.
 */
const DIFICULDADE: { valor: number; rotulo: string; detalhe: string }[] = [
  { valor: 1, rotulo: 'Muito fácil', detalhe: 'sobrou muito' },
  { valor: 2, rotulo: 'Fácil', detalhe: 'daria mais' },
  { valor: 3, rotulo: 'Na medida', detalhe: 'terminei bem' },
  { valor: 4, rotulo: 'Difícil', detalhe: 'foi no limite' },
  { valor: 5, rotulo: 'Muito difícil', detalhe: 'não completei' },
];

export default function Execucao() {
  const { sessaoId } = useLocalSearchParams<{ sessaoId: string }>();
  const { usuario, tema } = useSessao();
  const { registrarTreino } = useSincronizacao();
  /** Recordes desta sessão. Preenchido só quando o servidor confirmou na hora. */
  const [recordes, setRecordes] = useState<RecordeBatido[] | null>(null);
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
  const [midia, setMidia] = useState<MidiaDeExercicios>({});
  const [ampliado, setAmpliado] = useState<ExercicioResumo | null>(null);
  /** Segundos desde que o treino começou. Zera só ao sair da tela. */
  const [decorrido, setDecorrido] = useState(0);
  const [dor, setDor] = useState<RespostaDeDor>(DOR_VAZIA);
  const [fezCardio, setFezCardio] = useState(false);
  const [cardioTipo, setCardioTipo] = useState<TipoCardio>('ESTEIRA');
  const [cardioMin, setCardioMin] = useState('');
  const [cardioIntensidade, setCardioIntensidade] = useState<Intensidade>('MODERADA');

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

        /*
          A demonstração é pedida agora, no começo do treino, e não guardada
          junto do plano: o link é assinado e vale poucos minutos, então em
          cache chegaria morto. Sem rede fica sem imagem — e a tela mostra o
          passo a passo, que vem no plano e sobrevive offline.
        */
        try {
          setMidia(await sdk.exercicios.midia(encontrada.itens.map((i) => i.exercicio.id)));
        } catch {
          // Silêncio proposital: treinar sem a imagem é pior, mas possível.
        }
      }
    })();
  }, [usuario, sessaoId]);

  /*
    Cronômetro do treino inteiro. Conta desde a abertura da tela e não a
    partir da primeira série: o aquecimento e a montagem do aparelho fazem
    parte do tempo que a pessoa passou treinando, e é esse número que ela
    compara com o da semana passada.

    Deriva de `iniciadoEm` a cada tique em vez de somar +1: se o celular
    dormir, somar perderia o tempo em que a tela ficou parada, e o treino de
    50 minutos apareceria como 12.
  */
  useEffect(() => {
    const id = setInterval(() => {
      setDecorrido(Math.floor((Date.now() - iniciadoEm.current.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

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

  /**
   * O link do vídeo é assinado e expira em 5 minutos, então é pedido na hora do
   * toque — guardá-lo junto do plano deixaria um link morto no cache offline.
   */
  async function abrirVideo(exercicioId: string) {
    try {
      const { url } = await sdk.exercicios.urlDoVideo(exercicioId);
      await Linking.openURL(url);
    } catch {
      setErro('Não foi possível abrir o vídeo agora (precisa de conexão).');
    }
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
      const resumo = await registrarTreino(usuario.id, {
        clienteUuid: clienteUuid.current,
        sessaoId,
        iniciadoEm: iniciadoEm.current,
        finalizadoEm: new Date(),
        series: payload,
        feedback: {
          dificuldade,
          teveDor,
          /*
            Campo em branco vai como `undefined`, não como string vazia: o
            banco precisa distinguir "não respondeu" de "respondeu nada", e a
            tela do personal mostra coisas diferentes nos dois casos.
          */
          localDor: teveDor && dor.local.trim() ? dor.local.trim() : undefined,
          dorTipo: teveDor && dor.tipo ? dor.tipo : undefined,
          dorMomento: teveDor && dor.momento ? dor.momento : undefined,
          dorExercicioId: teveDor && dor.exercicioId ? dor.exercicioId : undefined,
          comentario: teveDor && dor.relato.trim() ? dor.relato.trim() : undefined,
        },
      });

      /*
        O cardio vai depois do treino porque precisa do id da execução para
        ficar amarrado a ela. Sem rede não dá — e nesse caso a pessoa é avisada
        de que precisa lançar pela tela de Cardio, em vez de o registro sumir
        em silêncio.
      */
      const minutosDeCardio = Number(cardioMin);
      if (fezCardio && minutosDeCardio > 0 && usuario) {
        if (resumo) {
          try {
            await sdk.cardio.registrar(usuario.id, {
              tipo: cardioTipo,
              intensidade: cardioIntensidade,
              duracaoMin: minutosDeCardio,
              data: dataLocalDoCheckin(),
              execucaoId: resumo.id,
            });
          } catch {
            setErro('O treino foi salvo, mas o cardio não. Registre pela tela de Cardio.');
          }
        } else {
          setErro('Treino salvo no aparelho. O cardio precisa de conexão — lance depois em Cardio.');
        }
      }

      /*
        A medalha vem antes da navegação, e só quando o servidor respondeu
        agora: os recordes são apurados no registro e não ficam guardados. Sem
        rede a pessoa não vê nada aqui — e é por isso que "meus recordes"
        existe como tela própria, derivada das séries.
      */
      if (resumo && resumo.recordes.length > 0) {
        setRecordes(resumo.recordes);
        return;
      }

      router.replace('/(tabs)/evolucao');
    } catch {
      setErro('Não foi possível salvar o treino no aparelho.');
    } finally {
      setEnviando(false);
    }
  }

  /*
    Tela de conquista. Ocupa tudo de propósito: a medalha dividindo espaço com
    a lista de séries vira notificação, e notificação a gente fecha sem ler.
  */
  if (recordes) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: tema.fundo }}
        contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.lg, flexGrow: 1 }}
      >
        <View style={{ alignItems: 'center', gap: espacamento.sm, marginTop: espacamento.xl }}>
          <Text style={{ fontSize: 56 }}>🏆</Text>
          <Text
            style={{
              color: tema.textoPrimario,
              fontSize: tipografia.tamanho['2xl'],
              fontWeight: '700',
              textAlign: 'center',
            }}
          >
            {recordes.length === 1 ? 'Você bateu um recorde!' : `Você bateu ${recordes.length} recordes!`}
          </Text>
          <Text style={{ color: tema.textoSecundario, textAlign: 'center' }}>
            Treino salvo. Isto é o que você nunca tinha feito antes.
          </Text>
        </View>

        {recordes.map((r, i) => (
          <View
            key={`${r.exercicioId}-${r.tipo}-${i}`}
            style={{
              backgroundColor: tema.superficie,
              borderRadius: raio.lg,
              borderWidth: 2,
              borderColor: tema.acaoFundo,
              padding: espacamento.lg,
              gap: espacamento.xs,
            }}
          >
            <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
              {ROTULO_RECORDE[r.tipo]}
            </Text>
            <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>{r.exercicioNome}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: espacamento.sm }}>
              <Text
                style={{
                  color: tema.textoPrimario,
                  fontSize: tipografia.tamanho['2xl'],
                  fontWeight: '700',
                }}
              >
                {r.valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg
              </Text>
              {/*
                O "de X para Y" vale mais que só o Y: é a diferença que mostra
                o tamanho do passo, e é ela que a pessoa conta para alguém.
              */}
              {r.anterior !== null && (
                <Text style={{ color: tema.textoSecundario }}>
                  antes {r.anterior.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg
                </Text>
              )}
            </View>
          </View>
        ))}

        <View style={{ gap: espacamento.md, marginTop: 'auto' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ver todos os meus recordes"
            onPress={() => router.replace('/recordes')}
            style={{
              minHeight: 56,
              borderRadius: raio.md,
              backgroundColor: tema.acaoFundo,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: tema.acaoTexto, fontWeight: '700', fontSize: tipografia.tamanho.lg }}>
              Ver meus recordes
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/(tabs)/evolucao')}
            style={{ minHeight: alvoToqueMin, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: tema.textoSecundario }}>Continuar</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
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
        {/*
          Três informações, e nenhuma esconde a outra. Antes o relógio de
          descanso ocupava o mesmo lugar do contador de séries, e durante o
          descanso a pessoa perdia de vista quanto faltava — justamente no
          minuto em que ela olha para o celular.
        */}
        <View>
          <Text
            accessibilityLabel={`Treino em andamento há ${Math.floor(decorrido / 60)} minutos`}
            style={{
              fontSize: tipografia.tamanho['2xl'],
              fontWeight: '700',
              color: tema.textoPrimario,
              fontVariant: ['tabular-nums'],
            }}
          >
            {cronometro(decorrido)}
          </Text>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            {concluidas}/{series.length} séries
            {descansoRestante !== null && (
              <Text
                accessibilityLiveRegion="polite"
                style={{ color: tema.acaoFundo, fontWeight: '700' }}
              >
                {'  ·  descanso '}
                {formatarDescanso(descansoRestante)}
              </Text>
            )}
          </Text>
        </View>

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
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: espacamento.sm }}
              >
                <Text
                  style={{
                    flex: 1,
                    fontSize: tipografia.tamanho.lg,
                    fontWeight: '700',
                    color: tema.primariaFundo,
                  }}
                >
                  {item.exercicio.nome}
                </Text>

                {item.exercicio.temVideo && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Ver vídeo de ${item.exercicio.nome}`}
                    onPress={() => void abrirVideo(item.exercicio.id)}
                    style={{
                      minHeight: alvoToqueMin,
                      paddingHorizontal: espacamento.md,
                      borderRadius: raio.md,
                      borderWidth: 1,
                      borderColor: tema.borda,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: tema.textoPrimario, fontSize: tipografia.tamanho.sm }}>
                      ▶ Vídeo
                    </Text>
                  </Pressable>
                )}
              </View>

              {/*
                A demonstração DENTRO do treino, e não atrás de um toque.
                Quem nunca fez o movimento não sabe que precisa procurar — e
                o personal está online, não do lado para corrigir a postura.
                Tocar abre em tela cheia com o passo a passo.
              */}
              <Demonstracao
                exercicio={item.exercicio}
                url={midia[item.exercicio.id]?.imagemUrl ?? null}
                aoAmpliar={() => setAmpliado(item.exercicio)}
                tema={tema}
              />

              {item.exercicio.instrucoes ? (
                <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
                  {item.exercicio.instrucoes}
                </Text>
              ) : null}

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
            {/*
              Uma linha por nível, com a palavra e o que ela significa. Cinco
              quadradinhos numerados obrigavam a pessoa a inventar a própria
              escala, e o "4" de um não era o "4" do outro — o que chegava ao
              personal era ruído com aparência de dado.
            */}
            <View style={{ gap: espacamento.xs }}>
              {DIFICULDADE.map((nivel) => {
                const escolhido = dificuldade === nivel.valor;
                return (
                  <Pressable
                    key={nivel.valor}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: escolhido }}
                    accessibilityLabel={`${nivel.rotulo} — ${nivel.detalhe}`}
                    onPress={() => setDificuldade(nivel.valor)}
                    style={{
                      minHeight: alvoToqueMin,
                      borderRadius: raio.md,
                      paddingHorizontal: espacamento.md,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: espacamento.sm,
                      backgroundColor: escolhido ? tema.acaoFundo : 'transparent',
                      borderWidth: 1,
                      borderColor: escolhido ? tema.acaoFundo : tema.borda,
                    }}
                  >
                    <Text
                      style={{
                        color: escolhido ? tema.acaoTexto : tema.textoPrimario,
                        fontWeight: '700',
                      }}
                    >
                      {nivel.rotulo}
                    </Text>
                    <Text
                      style={{
                        color: escolhido ? tema.acaoTexto : tema.textoSecundario,
                        fontSize: tipografia.tamanho.sm,
                      }}
                    >
                      {nivel.detalhe}
                    </Text>
                  </Pressable>
                );
              })}
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

            {/*
              O questionário só abre depois do "senti dor". Perguntar sobre dor
              a quem não sentiu ensina a responder no automático, e aí a
              resposta de quem sentiu de verdade vale menos.
            */}
            {teveDor && (
              <QuestionarioDeDor
                itens={sessao.itens.map((i) => ({ id: i.exercicio.id, nome: i.exercicio.nome }))}
                valor={dor}
                aoMudar={setDor}
                tema={tema}
              />
            )}

            {/*
              Cardio feito no mesmo dia da musculação. Fica aqui, no fim do
              treino, porque é quando a esteira acabou de acontecer — pedir
              para a pessoa lembrar disso depois, numa tela separada, é pedir
              para ela não registrar.
            */}
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: fezCardio }}
              accessibilityLabel="Fiz cardio neste treino"
              onPress={() => setFezCardio((v) => !v)}
              style={{
                minHeight: alvoToqueMin,
                borderRadius: raio.md,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: fezCardio ? 2 : 1,
                borderColor: fezCardio ? tema.acaoFundo : tema.borda,
              }}
            >
              <Text style={{ color: tema.textoPrimario }}>
                {fezCardio ? '✓ Fiz cardio neste treino' : '🏃 Fiz cardio neste treino'}
              </Text>
            </Pressable>

            {fezCardio && (
              <View style={{ gap: espacamento.sm }}>
                <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
                  O quê?
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.xs }}>
                  {(['ESTEIRA', 'BICICLETA', 'ELIPTICO', 'CORRIDA', 'CAMINHADA'] as TipoCardio[]).map(
                    (t) => (
                      <Pressable
                        key={t}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: cardioTipo === t }}
                        accessibilityLabel={ROTULO_TIPO_CARDIO[t]}
                        onPress={() => setCardioTipo(t)}
                        style={{
                          minHeight: alvoToqueMin,
                          paddingHorizontal: espacamento.md,
                          justifyContent: 'center',
                          borderRadius: raio.md,
                          borderWidth: cardioTipo === t ? 2 : 1,
                          borderColor: cardioTipo === t ? tema.acaoFundo : tema.borda,
                        }}
                      >
                        <Text style={{ color: tema.textoPrimario }}>{ROTULO_TIPO_CARDIO[t]}</Text>
                      </Pressable>
                    ),
                  )}
                </View>

                <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
                  Quantos minutos?
                </Text>
                <TextInput
                  accessibilityLabel="Minutos de cardio"
                  placeholder="20"
                  placeholderTextColor={tema.textoSecundario}
                  keyboardType="number-pad"
                  value={cardioMin}
                  onChangeText={setCardioMin}
                  style={{
                    minHeight: alvoToqueMin,
                    borderWidth: 1,
                    borderColor: tema.borda,
                    borderRadius: raio.md,
                    paddingHorizontal: espacamento.md,
                    color: tema.textoPrimario,
                    backgroundColor: tema.fundo,
                    fontSize: tipografia.tamanho.lg,
                    fontWeight: '700',
                  }}
                />

                <View style={{ flexDirection: 'row', gap: espacamento.xs }}>
                  {INTENSIDADES_RAPIDAS.map((i) => (
                    <Pressable
                      key={i}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: cardioIntensidade === i }}
                      accessibilityLabel={`${ROTULO_INTENSIDADE[i].titulo} — ${ROTULO_INTENSIDADE[i].ajuda}`}
                      onPress={() => setCardioIntensidade(i)}
                      style={{
                        flex: 1,
                        minHeight: alvoToqueMin,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: raio.md,
                        borderWidth: cardioIntensidade === i ? 2 : 1,
                        borderColor: cardioIntensidade === i ? tema.acaoFundo : tema.borda,
                      }}
                    >
                      <Text style={{ color: tema.textoPrimario, fontSize: tipografia.tamanho.sm }}>
                        {ROTULO_INTENSIDADE[i].titulo}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {erro && <Text style={{ color: tema.erro }}>{erro}</Text>}
      </ScrollView>

      <DemonstracaoAmpliada
        exercicio={ampliado}
        url={ampliado ? (midia[ampliado.id]?.imagemUrl ?? null) : null}
        aoFechar={() => setAmpliado(null)}
        tema={tema}
      />
    </View>
  );
}
