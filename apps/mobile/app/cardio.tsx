import {
  Intensidade,
  ROTULO_INTENSIDADE,
  ROTULO_TIPO_CARDIO,
  TipoCardio,
  dataLocalDoCheckin,
  type CardioResumo,
  type ResumoDeCalorias,
} from '@vivio/contracts';
import { alvoToqueMin, espacamento, raio, tipografia } from '@vivio/ui-native';
import { useCallback, useEffect, useState } from 'react';
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

/** Ordem de uso provável, não alfabética: caminhada e corrida abrem a lista. */
const TIPOS: TipoCardio[] = [
  'CAMINHADA',
  'CORRIDA',
  'ESTEIRA',
  'BICICLETA',
  'ELIPTICO',
  'ESCADA',
  'NATACAO',
  'PULAR_CORDA',
  'REMO',
  'FUNCIONAL',
  'OUTRO',
];

const INTENSIDADES: Intensidade[] = ['LEVE', 'MODERADA', 'INTENSA'];

function porExtenso(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  if (!ano || !mes || !dia) return iso;
  return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

/**
 * Cardio do aluno: o que ele fez fora da sala de musculação.
 *
 * A caloria aparece por atividade e no resumo, sempre marcada como estimativa
 * — e some quando não há peso registrado. Ver travessão e a frase que explica
 * é melhor do que ver um número que a pessoa vai levar a sério.
 */
export default function Cardio() {
  const { usuario, tema } = useSessao();

  const [lista, setLista] = useState<CardioResumo[] | null>(null);
  const [resumo, setResumo] = useState<ResumoDeCalorias | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<TipoCardio>('CAMINHADA');
  const [intensidade, setIntensidade] = useState<Intensidade>('MODERADA');
  const [duracao, setDuracao] = useState('');
  const [distancia, setDistancia] = useState('');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!usuario) return;
    try {
      const [atividades, calorias] = await Promise.all([
        sdk.cardio.listar(usuario.id, 30),
        sdk.cardio.calorias(usuario.id, 30),
      ]);
      setLista(atividades);
      setResumo(calorias);
      setErro(null);
    } catch {
      setErro('Não foi possível carregar suas atividades.');
      setLista([]);
    }
  }, [usuario]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar() {
    const minutos = Number(duracao);
    if (!usuario || !minutos) return;
    setSalvando(true);
    try {
      await sdk.cardio.registrar(usuario.id, {
        tipo,
        intensidade,
        duracaoMin: minutos,
        // Vírgula é o separador que o brasileiro digita.
        distanciaKm: distancia.trim() ? Number(distancia.replace(',', '.')) : undefined,
        data: dataLocalDoCheckin(),
        observacao: observacao.trim() || undefined,
      });
      setAberto(false);
      setDuracao('');
      setDistancia('');
      setObservacao('');
      await carregar();
    } catch {
      setErro('Não foi possível salvar. Confira os valores e tente de novo.');
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
        gap: espacamento.sm,
      }}
    >
      {children}
    </View>
  );

  const Escolha = ({
    escolhida,
    titulo,
    ajuda,
    aoTocar,
  }: {
    escolhida: boolean;
    titulo: string;
    ajuda?: string;
    aoTocar: () => void;
  }) => (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: escolhida }}
      accessibilityLabel={ajuda ? `${titulo} — ${ajuda}` : titulo}
      onPress={aoTocar}
      style={{
        minHeight: alvoToqueMin,
        paddingHorizontal: espacamento.md,
        borderRadius: raio.md,
        borderWidth: escolhida ? 2 : 1,
        borderColor: escolhida ? tema.acaoFundo : tema.borda,
        backgroundColor: escolhida ? tema.primariaFundo : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        gap: espacamento.sm,
      }}
    >
      <Text
        style={{
          color: escolhida ? tema.primariaTexto : tema.textoPrimario,
          fontWeight: escolhida ? '700' : '400',
        }}
      >
        {titulo}
      </Text>
      {ajuda && (
        <Text
          style={{
            color: escolhida ? tema.primariaTexto : tema.textoSecundario,
            fontSize: tipografia.tamanho.xs,
            flex: 1,
          }}
        >
          {ajuda}
        </Text>
      )}
    </Pressable>
  );

  if (!lista) {
    return (
      <View style={{ flex: 1, backgroundColor: tema.fundo, justifyContent: 'center' }}>
        <ActivityIndicator color={tema.acaoFundo} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: tema.fundo }}
    >
      <ScrollView contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.md }}>
        {erro && <Text style={{ color: tema.erro }}>{erro}</Text>}

        {resumo && (
          <Cartao>
            <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>
              Últimos {resumo.dias} dias
            </Text>

            <View style={{ flexDirection: 'row', gap: espacamento.lg }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
                  Cardio
                </Text>
                <Text style={{ color: tema.textoPrimario, fontSize: tipografia.tamanho.xl, fontWeight: '700' }}>
                  {resumo.cardio.kcal === null ? '—' : `${resumo.cardio.kcal.toLocaleString('pt-BR')}`}
                </Text>
                <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
                  kcal · {resumo.cardio.minutos} min
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
                  Musculação
                </Text>
                <Text style={{ color: tema.textoPrimario, fontSize: tipografia.tamanho.xl, fontWeight: '700' }}>
                  {resumo.musculacao.kcal === null
                    ? '—'
                    : `${resumo.musculacao.kcal.toLocaleString('pt-BR')}`}
                </Text>
                <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
                  kcal · {resumo.musculacao.minutos} min
                </Text>
              </View>
            </View>

            {/*
              Sem peso a conta inteira não existe. Dizer isso, e dizer o que
              fazer, é mais útil do que um zero que a pessoa leria como "não
              gastei nada".
            */}
            {resumo.pesoUsadoKg === null ? (
              <Text style={{ color: tema.alerta, fontSize: tipografia.tamanho.sm }}>
                Registre seu peso em Evolução para o app conseguir estimar as calorias. Sem ele não
                dá para calcular — e um número chutado seria pior que nenhum.
              </Text>
            ) : (
              <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
                Estimativa a partir de{' '}
                {resumo.pesoUsadoKg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg. É uma
                média — a variação real entre pessoas chega a 30%.
              </Text>
            )}
          </Cartao>
        )}

        {!aberto && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Registrar atividade de cardio"
            onPress={() => setAberto(true)}
            style={{
              minHeight: 56,
              borderRadius: raio.md,
              backgroundColor: tema.acaoFundo,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: tema.acaoTexto, fontWeight: '700', fontSize: tipografia.tamanho.lg }}>
              + Registrar cardio
            </Text>
          </Pressable>
        )}

        {aberto && (
          <Cartao>
            <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>O que você fez?</Text>
            <View style={{ gap: espacamento.xs }}>
              {TIPOS.map((t) => (
                <Escolha
                  key={t}
                  escolhida={tipo === t}
                  titulo={ROTULO_TIPO_CARDIO[t]}
                  aoTocar={() => setTipo(t)}
                />
              ))}
            </View>

            <Text style={{ color: tema.textoPrimario, fontWeight: '700', marginTop: espacamento.sm }}>
              Quanto tempo?
            </Text>
            <TextInput
              accessibilityLabel="Duração em minutos"
              placeholder="minutos"
              placeholderTextColor={tema.textoSecundario}
              keyboardType="number-pad"
              value={duracao}
              onChangeText={setDuracao}
              style={{
                minHeight: 56,
                borderWidth: 1,
                borderColor: duracao ? tema.acaoFundo : tema.borda,
                borderRadius: raio.md,
                paddingHorizontal: espacamento.md,
                color: tema.textoPrimario,
                backgroundColor: tema.fundo,
                fontSize: tipografia.tamanho['2xl'],
                fontWeight: '700',
              }}
            />

            <Text style={{ color: tema.textoPrimario, fontWeight: '700', marginTop: espacamento.sm }}>
              Qual foi o esforço?
            </Text>
            {/*
              A referência é a fala, e não a frequência cardíaca: quase ninguém
              usa monitor, e "conseguia conversar" é aferível por qualquer
              pessoa sem equipamento nenhum.
            */}
            <View style={{ gap: espacamento.xs }}>
              {INTENSIDADES.map((i) => (
                <Escolha
                  key={i}
                  escolhida={intensidade === i}
                  titulo={ROTULO_INTENSIDADE[i].titulo}
                  ajuda={ROTULO_INTENSIDADE[i].ajuda}
                  aoTocar={() => setIntensidade(i)}
                />
              ))}
            </View>

            <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm, marginTop: espacamento.sm }}>
              Distância em km (opcional)
            </Text>
            <TextInput
              accessibilityLabel="Distância em quilômetros"
              placeholder="—"
              placeholderTextColor={tema.textoSecundario}
              keyboardType="decimal-pad"
              value={distancia}
              onChangeText={setDistancia}
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

            <TextInput
              accessibilityLabel="Observação"
              placeholder="como foi? (opcional)"
              placeholderTextColor={tema.textoSecundario}
              value={observacao}
              onChangeText={setObservacao}
              maxLength={500}
              multiline
              style={{
                minHeight: 70,
                borderWidth: 1,
                borderColor: tema.borda,
                borderRadius: raio.md,
                padding: espacamento.md,
                color: tema.textoPrimario,
                backgroundColor: tema.fundo,
                textAlignVertical: 'top',
              }}
            />

            <View style={{ flexDirection: 'row', gap: espacamento.md, marginTop: espacamento.sm }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancelar"
                onPress={() => setAberto(false)}
                style={{
                  flex: 1,
                  minHeight: 52,
                  borderRadius: raio.md,
                  borderWidth: 1,
                  borderColor: tema.borda,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: tema.textoPrimario }}>Cancelar</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Salvar atividade"
                disabled={salvando || !Number(duracao)}
                onPress={() => void salvar()}
                style={{
                  flex: 2,
                  minHeight: 52,
                  borderRadius: raio.md,
                  backgroundColor: tema.acaoFundo,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: salvando || !Number(duracao) ? 0.5 : 1,
                }}
              >
                <Text style={{ color: tema.acaoTexto, fontWeight: '700' }}>
                  {salvando ? 'Salvando…' : Number(duracao) ? 'Salvar' : 'Informe os minutos'}
                </Text>
              </Pressable>
            </View>
          </Cartao>
        )}

        {lista.length === 0 ? (
          <Cartao>
            <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>
              Nenhuma atividade ainda
            </Text>
            <Text style={{ color: tema.textoSecundario }}>
              Caminhada, corrida, bike, natação — registre aqui o que você faz fora da musculação.
              Seu personal vê e usa para ajustar o treino.
            </Text>
          </Cartao>
        ) : (
          lista.map((a) => (
            <Cartao key={a.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: espacamento.sm }}>
                <Text style={{ color: tema.textoPrimario, fontWeight: '700', flex: 1 }}>
                  {ROTULO_TIPO_CARDIO[a.tipo]}
                  {/* O selo aparece só quando o cardio foi feito junto do treino. */}
                  {a.execucaoId && (
                    <Text style={{ color: tema.textoSecundario, fontWeight: '400' }}> · no treino</Text>
                  )}
                </Text>
                <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
                  {porExtenso(a.data)}
                </Text>
              </View>
              <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
                {a.duracaoMin} min · {ROTULO_INTENSIDADE[a.intensidade].titulo}
                {a.distanciaKm !== null ? ` · ${a.distanciaKm} km` : ''}
                {a.caloriasEstimadas !== null ? ` · ~${a.caloriasEstimadas} kcal` : ''}
              </Text>
              {a.observacao && (
                <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
                  {a.observacao}
                </Text>
              )}
            </Cartao>
          ))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
