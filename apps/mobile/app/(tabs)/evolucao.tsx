import type { ExecucaoResumo } from '@vivio/contracts';
import { espacamento, raio, tipografia } from '@vivio/ui-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { sdk } from '../../src/sdk';
import { useSessao } from '../../src/sessao';
import { useSincronizacao } from '../../src/sincronizacao';

export default function Evolucao() {
  const { usuario, tema } = useSessao();
  const { pendentes, sincronizando, sincronizar } = useSincronizacao();
  const [execucoes, setExecucoes] = useState<ExecucaoResumo[]>([]);

  useEffect(() => {
    if (!usuario) return;
    sdk.execucoes.listar(usuario.id, 30).then(setExecucoes).catch(() => undefined);
    // Recarrega quando a fila esvazia: o treino recém-enviado precisa aparecer.
  }, [usuario, pendentes.length]);

  const volumeTotal = execucoes.reduce((soma, e) => soma + e.volumeTotalKg, 0);
  const totalSeries = execucoes.reduce((soma, e) => soma + e.totalSeries, 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tema.fundo }}
      contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.lg }}
    >
      {pendentes.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Enviar treinos pendentes agora"
          onPress={() => void sincronizar()}
          style={{
            backgroundColor: tema.superficie,
            borderRadius: raio.md,
            borderWidth: 1,
            borderColor: tema.alerta,
            padding: espacamento.md,
          }}
        >
          <Text style={{ color: tema.alerta, fontWeight: '700' }}>
            {pendentes.length === 1
              ? '1 treino aguardando envio'
              : `${pendentes.length} treinos aguardando envio`}
          </Text>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            {sincronizando
              ? 'Enviando…'
              : 'Ficam salvos no aparelho. Toque para tentar agora.'}
          </Text>
        </Pressable>
      )}

      <View style={{ flexDirection: 'row', gap: espacamento.md }}>
        {[
          { rotulo: 'Treinos', valor: execucoes.length.toString() },
          { rotulo: 'Séries', valor: totalSeries.toString() },
          { rotulo: 'Volume (kg)', valor: Math.round(volumeTotal).toLocaleString('pt-BR') },
        ].map((metrica) => (
          <View
            key={metrica.rotulo}
            style={{
              flex: 1,
              backgroundColor: tema.superficie,
              borderRadius: raio.lg,
              borderWidth: 1,
              borderColor: tema.borda,
              padding: espacamento.md,
            }}
          >
            <Text
              style={{
                fontSize: tipografia.tamanho.xl,
                fontWeight: '700',
                color: tema.textoPrimario,
              }}
            >
              {metrica.valor}
            </Text>
            <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
              {metrica.rotulo}
            </Text>
          </View>
        ))}
      </View>

      <Text style={{ fontSize: tipografia.tamanho.lg, fontWeight: '600', color: tema.textoPrimario }}>
        Histórico
      </Text>

      {execucoes.length === 0 && (
        <Text style={{ color: tema.textoSecundario }}>
          Seus treinos aparecem aqui depois que você registrar o primeiro.
        </Text>
      )}

      {execucoes.map((e) => (
        <View
          key={e.id}
          style={{
            backgroundColor: tema.superficie,
            borderRadius: raio.md,
            borderWidth: 1,
            borderColor: tema.borda,
            padding: espacamento.md,
            gap: espacamento.xs,
          }}
        >
          <Text style={{ color: tema.textoPrimario, fontWeight: '600' }}>{e.sessaoNome}</Text>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            {new Date(e.iniciadoEm).toLocaleString('pt-BR')}
            {e.duracaoSeg !== null && ` · ${Math.round(e.duracaoSeg / 60)} min`}
          </Text>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            {e.totalSeries} séries · {e.volumeTotalKg.toLocaleString('pt-BR')} kg
          </Text>
          {e.feedback?.teveDor && (
            <Text style={{ color: tema.erro, fontSize: tipografia.tamanho.sm }}>
              Relato de dor{e.feedback.localDor ? `: ${e.feedback.localDor}` : ''}
            </Text>
          )}
        </View>
      ))}
    </ScrollView>
  );
}
