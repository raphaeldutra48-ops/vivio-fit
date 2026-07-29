import {
  MetricaCorporal,
  type EvolucaoCorporal,
  type SerieCorporal,
} from '@vivio/contracts';
import { espacamento, raio, tipografia } from '@vivio/ui-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { GraficoDeLinha } from '../src/componentes/GraficoDeLinha';
import { sdk } from '../src/sdk';
import { useSessao } from '../src/sessao';

/** Cor por métrica — o usuário reconhece a curva pela cor, não pelo título. */
const COR_DA_METRICA: Partial<Record<MetricaCorporal, (t: ReturnType<typeof useSessao>['tema']) => string>> = {
  PESO: (t) => t.textoPrimario,
  GORDURA_PERCENTUAL: (t) => t.alerta,
  MASSA_GORDA: (t) => t.alerta,
  MASSA_MAGRA: (t) => t.primariaFundo,
};

const DESTAQUES: MetricaCorporal[] = ['PESO', 'GORDURA_PERCENTUAL', 'MASSA_MAGRA', 'MASSA_GORDA'];

export default function Composicao() {
  const { usuario, tema } = useSessao();
  const router = useRouter();
  const [evolucao, setEvolucao] = useState<EvolucaoCorporal | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!usuario) return;
    sdk.medidas
      .evolucao(usuario.id)
      .then(setEvolucao)
      .catch(() => setErro('Não foi possível carregar sua evolução.'))
      .finally(() => setCarregando(false));
  }, [usuario]);

  function Variacao({ serie }: { serie: SerieCorporal }) {
    if (serie.variacao === null) {
      return (
        <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
          precisa de 2 medições
        </Text>
      );
    }
    const cor = serie.evoluiuBem === null ? tema.textoSecundario : serie.evoluiuBem ? tema.sucesso : tema.erro;
    const sinal = serie.variacao > 0 ? '+' : '';
    return (
      <Text style={{ color: cor, fontSize: tipografia.tamanho.sm, fontWeight: '700' }}>
        {sinal}
        {serie.variacao} {serie.unidade}
        {serie.variacaoPercentual !== null && ` (${sinal}${serie.variacaoPercentual}%)`}
      </Text>
    );
  }

  const destaques = (evolucao?.series ?? []).filter((s) => DESTAQUES.includes(s.metrica));
  const circunferencias = (evolucao?.series ?? []).filter((s) => !DESTAQUES.includes(s.metrica));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tema.fundo }}
      contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.lg }}
    >
      {carregando && <ActivityIndicator color={tema.primariaFundo} />}
      {erro && <Text style={{ color: tema.erro }}>{erro}</Text>}

      {evolucao && evolucao.totalMedicoes === 0 && (
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
          <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>Sem medições ainda</Text>
          <Text style={{ color: tema.textoSecundario }}>
            Registre peso e medidas para os gráficos começarem a contar sua história. A segunda
            medição já mostra a variação.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Registrar medidas"
            onPress={() => router.push('/medidas')}
            style={{
              minHeight: 52,
              borderRadius: raio.md,
              backgroundColor: tema.acaoFundo,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: espacamento.sm,
            }}
          >
            <Text style={{ color: tema.acaoTexto, fontWeight: '700' }}>Registrar medidas</Text>
          </Pressable>
        </View>
      )}

      {/* Cartões-resumo: o número grande é o atual, embaixo a variação no período */}
      {destaques.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.sm }}>
          {destaques.map((serie) => (
            <View
              key={serie.metrica}
              style={{
                flexGrow: 1,
                flexBasis: '46%',
                backgroundColor: tema.superficie,
                borderRadius: raio.lg,
                borderWidth: 1,
                borderColor: tema.borda,
                padding: espacamento.md,
                gap: 2,
              }}
            >
              <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
                {serie.rotulo}
              </Text>
              <Text
                style={{
                  color: tema.textoPrimario,
                  fontSize: tipografia.tamanho['2xl'],
                  fontWeight: '700',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {serie.ultimo ?? '—'}
                <Text style={{ fontSize: tipografia.tamanho.sm, color: tema.textoSecundario }}>
                  {' '}
                  {serie.unidade}
                </Text>
              </Text>
              <Variacao serie={serie} />
            </View>
          ))}
        </View>
      )}

      {destaques.map((serie) => (
        <View
          key={`g-${serie.metrica}`}
          style={{
            backgroundColor: tema.superficie,
            borderRadius: raio.lg,
            borderWidth: 1,
            borderColor: tema.borda,
            padding: espacamento.lg,
            gap: espacamento.sm,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>{serie.rotulo}</Text>
            <Variacao serie={serie} />
          </View>
          <GraficoDeLinha
            pontos={serie.pontos}
            unidade={serie.unidade}
            cor={(COR_DA_METRICA[serie.metrica] ?? ((t) => t.primariaFundo))(tema)}
            tema={tema}
            descricao={`Gráfico de ${serie.rotulo.toLowerCase()}: de ${serie.primeiro} para ${serie.ultimo} ${serie.unidade} em ${serie.pontos.length} medições`}
          />
        </View>
      ))}

      {circunferencias.length > 0 && (
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
          <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>Circunferências</Text>
          {circunferencias.map((serie) => (
            <View
              key={serie.metrica}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingVertical: espacamento.xs,
              }}
            >
              <Text style={{ color: tema.textoPrimario }}>{serie.rotulo}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacamento.sm }}>
                <Text style={{ color: tema.textoPrimario, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                  {serie.ultimo} {serie.unidade}
                </Text>
                <Variacao serie={serie} />
              </View>
            </View>
          ))}
        </View>
      )}

      {evolucao && evolucao.totalMedicoes > 0 && (
        <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs, textAlign: 'center' }}>
          {evolucao.totalMedicoes} medições · de{' '}
          {new Date(`${evolucao.de}T12:00:00`).toLocaleDateString('pt-BR')} a{' '}
          {new Date(`${evolucao.ate}T12:00:00`).toLocaleDateString('pt-BR')}
        </Text>
      )}
    </ScrollView>
  );
}
