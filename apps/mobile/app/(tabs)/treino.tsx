import type { PlanoTreinoCompleto } from '@vivio/contracts';
import { espacamento, raio, tipografia } from '@vivio/ui-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { lerPlano, salvarPlano } from '../../src/cacheTreino';
import { sdk } from '../../src/sdk';
import { useSessao } from '../../src/sessao';

const DIAS = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

export default function Treino() {
  const { usuario, tema } = useSessao();
  const router = useRouter();
  const [plano, setPlano] = useState<PlanoTreinoCompleto | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [doCache, setDoCache] = useState(false);

  useEffect(() => {
    if (!usuario) return;
    void (async () => {
      try {
        const atual = await sdk.treinos.obterAtivo(usuario.id);
        setPlano(atual);
        setDoCache(false);
        await salvarPlano(usuario.id, atual);
      } catch {
        const emCache = await lerPlano(usuario.id);
        if (emCache) {
          setPlano(emCache.plano);
          setDoCache(true);
        } else {
          setMensagem('Nenhum plano de treino ativo no momento.');
        }
      }
    })();
  }, [usuario]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tema.fundo }}
      contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.lg }}
    >
      {mensagem && <Text style={{ color: tema.textoSecundario }}>{mensagem}</Text>}

      {doCache && (
        <Text style={{ color: tema.alerta, fontSize: tipografia.tamanho.sm }}>
          Sem conexão — mostrando a cópia salva no aparelho.
        </Text>
      )}

      {plano && (
        <>
          <View>
            <Text
              style={{ fontSize: tipografia.tamanho.xl, fontWeight: '700', color: tema.textoPrimario }}
            >
              {plano.nome}
            </Text>
            <Text style={{ color: tema.textoSecundario }}>
              versão {plano.versao} · por {plano.personal.nome}
            </Text>
          </View>

          {plano.sessoes.map((sessao) => (
            <View
              key={sessao.id}
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
                  {sessao.nome}
                </Text>
                {sessao.diaSugerido && (
                  <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
                    {DIAS[sessao.diaSugerido]}
                  </Text>
                )}
              </View>

              {sessao.itens.map((item) => (
                <View key={item.id} style={{ gap: 2 }}>
                  <Text style={{ color: tema.textoPrimario }}>{item.exercicio.nome}</Text>
                  <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
                    {item.series} × {item.repsAlvo}
                    {item.cargaSugeridaKg !== null && ` · ${item.cargaSugeridaKg} kg`}
                    {item.descansoSeg !== null && ` · descanso ${item.descansoSeg}s`}
                  </Text>
                </View>
              ))}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Iniciar ${sessao.nome}`}
                onPress={() => router.push(`/execucao/${sessao.id}`)}
                style={{
                  minHeight: 52,
                  backgroundColor: tema.acaoFundo,
                  borderRadius: raio.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: tema.acaoTexto, fontWeight: '700' }}>Iniciar</Text>
              </Pressable>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}
