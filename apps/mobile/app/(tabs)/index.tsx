import type { ExecucaoResumo, PlanoTreinoCompleto } from '@vivio/contracts';
import { espacamento, raio, tipografia } from '@vivio/ui-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { sdk } from '../../src/sdk';
import { useSessao } from '../../src/sessao';

export default function Inicio() {
  const { usuario, tema, sair } = useSessao();
  const router = useRouter();
  const [plano, setPlano] = useState<PlanoTreinoCompleto | null>(null);
  const [execucoes, setExecucoes] = useState<ExecucaoResumo[]>([]);
  const [semPlano, setSemPlano] = useState(false);

  useEffect(() => {
    if (!usuario) return;
    sdk.treinos
      .obterAtivo(usuario.id)
      .then(setPlano)
      .catch(() => setSemPlano(true));
    sdk.execucoes
      .listar(usuario.id, 5)
      .then(setExecucoes)
      .catch(() => undefined);
  }, [usuario]);

  const proxima = plano?.sessoes[execucoes.length % Math.max(1, plano.sessoes.length)];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tema.fundo }}
      contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.xl }}
    >
      <View>
        <Text style={{ color: tema.textoSecundario }}>Olá,</Text>
        <Text
          style={{
            fontSize: tipografia.tamanho['2xl'],
            fontWeight: '700',
            color: tema.textoPrimario,
          }}
        >
          {usuario?.nome.split(' ')[0]}
        </Text>
      </View>

      {semPlano && (
        <View
          style={{
            backgroundColor: tema.superficie,
            borderRadius: raio.lg,
            borderWidth: 1,
            borderColor: tema.borda,
            padding: espacamento.lg,
          }}
        >
          <Text style={{ color: tema.textoPrimario, fontWeight: '600' }}>
            Nenhum treino ativo
          </Text>
          <Text style={{ color: tema.textoSecundario, marginTop: espacamento.xs }}>
            Seu personal ainda não montou ou ativou um plano para você.
          </Text>
        </View>
      )}

      {plano && proxima && (
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
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            Próximo treino · {plano.nome}
          </Text>
          <Text
            style={{
              fontSize: tipografia.tamanho.xl,
              fontWeight: '700',
              color: tema.textoPrimario,
            }}
          >
            {proxima.nome}
          </Text>
          <Text style={{ color: tema.textoSecundario }}>
            {proxima.itens.length} {proxima.itens.length === 1 ? 'exercício' : 'exercícios'}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/execucao/${proxima.id}`)}
            style={{
              minHeight: 52,
              backgroundColor: tema.acaoFundo,
              borderRadius: raio.md,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{ color: tema.acaoTexto, fontWeight: '700', fontSize: tipografia.tamanho.lg }}
            >
              Começar treino
            </Text>
          </Pressable>
        </View>
      )}

      <View style={{ gap: espacamento.md }}>
        <Text style={{ fontSize: tipografia.tamanho.lg, fontWeight: '600', color: tema.textoPrimario }}>
          Últimos treinos
        </Text>
        {execucoes.length === 0 ? (
          <Text style={{ color: tema.textoSecundario }}>Nenhum treino registrado ainda.</Text>
        ) : (
          execucoes.map((e) => (
            <View
              key={e.id}
              style={{
                backgroundColor: tema.superficie,
                borderRadius: raio.md,
                borderWidth: 1,
                borderColor: tema.borda,
                padding: espacamento.md,
              }}
            >
              <Text style={{ color: tema.textoPrimario, fontWeight: '600' }}>{e.sessaoNome}</Text>
              <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
                {new Date(e.iniciadoEm).toLocaleDateString('pt-BR')} · {e.totalSeries} séries ·{' '}
                {e.volumeTotalKg.toLocaleString('pt-BR')} kg de volume
              </Text>
            </View>
          ))
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Configurar lembretes"
        onPress={() => router.push('/lembretes')}
        style={{
          minHeight: 52,
          borderRadius: raio.md,
          backgroundColor: tema.superficie,
          borderWidth: 1,
          borderColor: tema.borda,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>⏰ Lembretes</Text>
      </Pressable>

      <Pressable accessibilityRole="button" onPress={() => void sair()} style={{ paddingVertical: espacamento.md }}>
        <Text style={{ color: tema.textoSecundario, textAlign: 'center' }}>Sair da conta</Text>
      </Pressable>
    </ScrollView>
  );
}
