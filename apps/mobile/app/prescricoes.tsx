import {
  ROTULO_STATUS_PRESCRICAO,
  descreverPosologia,
  type PrescricaoResumo,
} from '@vivio/contracts';
import { espacamento, raio, tipografia } from '@vivio/ui-native';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { sdk } from '../src/sdk';
import { useSessao } from '../src/sessao';

export default function Prescricoes() {
  const { usuario, tema } = useSessao();
  const [prescricoes, setPrescricoes] = useState<PrescricaoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!usuario) return;
    sdk.prescricoes
      .listar(usuario.id)
      .then(setPrescricoes)
      .catch(() => undefined)
      .finally(() => setCarregando(false));
  }, [usuario]);

  // Substituída e encerrada existem para consulta, não para seguir hoje.
  const valendo = prescricoes.filter((p) => p.status === 'ATIVA' || p.status === 'SUSPENSA');
  const historico = prescricoes.filter((p) => p.status !== 'ATIVA' && p.status !== 'SUSPENSA');

  const cartao = {
    backgroundColor: tema.superficie,
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: tema.borda,
    padding: espacamento.lg,
    gap: espacamento.sm,
  } as const;

  function Cartao({ p, apagado = false }: { p: PrescricaoResumo; apagado?: boolean }) {
    return (
      <View style={[cartao, apagado && { opacity: 0.6 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: espacamento.sm }}>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            {p.prescritor.nome}
          </Text>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            {ROTULO_STATUS_PRESCRICAO[p.status]}
          </Text>
        </View>

        {p.itens.map((item) => (
          <View key={item.id} style={{ marginTop: espacamento.sm }}>
            <Text
              style={{
                color: tema.textoPrimario,
                fontWeight: '700',
                fontSize: tipografia.tamanho.lg,
              }}
            >
              {item.nome}
            </Text>
            <Text style={{ color: tema.textoPrimario, fontSize: tipografia.tamanho.base }}>
              {descreverPosologia(item) || 'Conforme orientação'}
            </Text>
            {item.observacao && (
              <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
                {item.observacao}
              </Text>
            )}
          </View>
        ))}

        {p.orientacoes && (
          <Text
            style={{
              color: tema.textoSecundario,
              marginTop: espacamento.sm,
              paddingTop: espacamento.sm,
              borderTopWidth: 1,
              borderTopColor: tema.borda,
            }}
          >
            {p.orientacoes}
          </Text>
        )}

        <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
          {new Date(`${p.data}T12:00:00`).toLocaleDateString('pt-BR')}
          {p.validaAte &&
            ` · válida até ${new Date(`${p.validaAte}T12:00:00`).toLocaleDateString('pt-BR')}`}
        </Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Minhas prescrições' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: tema.fundo }}
        contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.lg }}
      >
        {carregando && <Text style={{ color: tema.textoSecundario }}>Carregando…</Text>}

        {!carregando && prescricoes.length === 0 && (
          <View style={cartao}>
            <Text style={{ color: tema.textoPrimario, fontWeight: '600' }}>
              Nenhuma prescrição
            </Text>
            <Text style={{ color: tema.textoSecundario }}>
              Quando seu nutricionista ou médico prescrever algo, aparece aqui com a dose e os
              horários.
            </Text>
          </View>
        )}

        {valendo.map((p) => (
          <Cartao key={p.id} p={p} />
        ))}

        {historico.length > 0 && (
          <>
            <Text
              style={{
                color: tema.textoSecundario,
                fontSize: tipografia.tamanho.sm,
                marginTop: espacamento.md,
              }}
            >
              HISTÓRICO
            </Text>
            {historico.map((p) => (
              <Cartao key={p.id} p={p} apagado />
            ))}
          </>
        )}

        {prescricoes.length > 0 && (
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            Em caso de dúvida ou efeito indesejado, fale com quem prescreveu antes de mudar
            qualquer coisa por conta própria.
          </Text>
        )}
      </ScrollView>
    </>
  );
}
