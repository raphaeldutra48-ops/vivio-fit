import type { PlanoTreinoCompleto } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { espacamento, raio, tipografia } from '@vivio/ui-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { lerPlano, salvarPlano } from '../../src/cacheTreino';
import { Carregando, FalhouAoCarregar } from '../../src/componentes/Estado';
import { sdk } from '../../src/sdk';
import { useSessao } from '../../src/sessao';

const DIAS = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

export default function Treino() {
  const { usuario, tema } = useSessao();
  const router = useRouter();
  const [plano, setPlano] = useState<PlanoTreinoCompleto | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [doCache, setDoCache] = useState(false);
  /*
    `semPlano` e `falhou` são coisas diferentes, e antes eram a mesma.

    Qualquer erro sem cache virava "Nenhum plano de treino ativo no momento." —
    inclusive a falta de sinal. O aluno no subsolo da academia lia que o
    personal não tinha prescrito nada e ia cobrar por um treino que já estava
    montado. É a acusação errada, feita ao profissional errado, pelo motivo
    errado.
  */
  const [situacao, setSituacao] = useState<'carregando' | 'erro' | 'pronto'>('carregando');
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!usuario) return;
    let ativo = true;
    setSituacao('carregando');

    void (async () => {
      try {
        const atual = await sdk.treinos.obterAtivo(usuario.id);
        if (!ativo) return;
        setPlano(atual);
        setDoCache(false);
        setMensagem(null);
        setSituacao('pronto');
        await salvarPlano(usuario.id, atual);
      } catch (e) {
        if (!ativo) return;

        // Cópia no aparelho resolve os dois casos: com ela, treina-se offline.
        const emCache = await lerPlano(usuario.id);
        if (!ativo) return;
        if (emCache) {
          setPlano(emCache.plano);
          setDoCache(true);
          setSituacao('pronto');
          return;
        }

        /*
          Sem cache, o código do erro decide a frase. 404 é o servidor dizendo
          "não há plano"; o resto é o servidor não tendo dito nada.
        */
        const api = e instanceof ErroApi ? e : null;
        if (api && api.status === 404) {
          setMensagem('Nenhum plano de treino ativo no momento.');
          setSituacao('pronto');
        } else {
          setSituacao('erro');
        }
      }
    })();

    return () => {
      ativo = false;
    };
  }, [usuario, tentativa]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tema.fundo }}
      contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.lg }}
    >
      {situacao === 'carregando' && <Carregando oQue="Buscando seu treino…" />}

      {situacao === 'erro' && (
        <FalhouAoCarregar
          mensagem="Sem conexão e sem cópia salva neste aparelho. Assim que a rede voltar, seu treino aparece aqui."
          aoTentarDeNovo={() => setTentativa((t) => t + 1)}
        />
      )}

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
