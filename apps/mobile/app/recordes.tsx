import { ehMarcaRecente, type MarcaPessoal, type MeusRecordes } from '@vivio/contracts';
import { espacamento, raio, tipografia } from '@vivio/ui-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { sdk } from '../src/sdk';
import { useSessao } from '../src/sessao';

const kg = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`;

function porExtenso(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  if (!ano || !mes || !dia) return iso;
  return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Meus recordes.
 *
 * A medalha do fim do treino dura um instante e some — e some de vez quando o
 * aparelho está sem sinal na academia. Esta tela é o lugar onde a conquista
 * fica: as marcas são derivadas de todas as séries já registradas, então nada
 * depende de o app estar online na hora certa.
 */
export default function Recordes() {
  const { usuario, tema } = useSessao();
  const [dados, setDados] = useState<MeusRecordes | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!usuario) return;
    let ativo = true;
    sdk.recordes
      .meus(usuario.id)
      .then((r) => ativo && setDados(r))
      .catch(() => ativo && setErro('Não foi possível carregar seus recordes.'));
    return () => {
      ativo = false;
    };
  }, [usuario]);

  if (erro) {
    return (
      <View style={{ flex: 1, backgroundColor: tema.fundo, padding: espacamento.lg }}>
        <Text style={{ color: tema.erro }}>{erro}</Text>
      </View>
    );
  }

  if (!dados) {
    return (
      <View style={{ flex: 1, backgroundColor: tema.fundo, justifyContent: 'center' }}>
        <ActivityIndicator color={tema.acaoFundo} />
      </View>
    );
  }

  if (dados.total === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: tema.fundo, padding: espacamento.lg }}>
        <View
          style={{
            backgroundColor: tema.superficie,
            borderRadius: raio.lg,
            borderWidth: 1,
            borderColor: tema.borda,
            padding: espacamento.lg,
            gap: espacamento.xs,
          }}
        >
          <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>
            Seus recordes aparecem aqui
          </Text>
          {/*
            Lista vazia aqui não é falha nem preguiça: é quem ainda não
            registrou o primeiro treino. Dizer isso evita a leitura de que o
            app perdeu alguma coisa.
          */}
          <Text style={{ color: tema.textoSecundario }}>
            Assim que você registrar um treino, cada exercício ganha sua marca pessoal — a maior
            carga que você já levantou e o dia em que conseguiu.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tema.fundo }}
      contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.md }}
    >
      <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
        {dados.total} {dados.total === 1 ? 'exercício' : 'exercícios'} com marca própria. A
        conquista mais recente vem primeiro.
      </Text>

      {dados.marcas.map((marca: MarcaPessoal) => {
        const nova = ehMarcaRecente(marca);
        return (
          <View
            key={marca.exercicioId}
            style={{
              backgroundColor: tema.superficie,
              borderRadius: raio.lg,
              borderWidth: nova ? 2 : 1,
              borderColor: nova ? tema.acaoFundo : tema.borda,
              padding: espacamento.lg,
              gap: espacamento.sm,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: espacamento.sm }}>
              <Text style={{ color: tema.textoPrimario, fontWeight: '700', flex: 1 }}>
                {marca.exercicioNome}
              </Text>
              {/*
                O selo só nos 30 dias. Depois disso a marca virou o patamar
                normal, e continuar chamando de novidade diminui a próxima.
              */}
              {nova && (
                <View
                  style={{
                    borderRadius: raio.md,
                    backgroundColor: tema.acaoFundo,
                    paddingHorizontal: espacamento.sm,
                    paddingVertical: 2,
                  }}
                >
                  <Text
                    style={{
                      color: tema.acaoTexto,
                      fontSize: tipografia.tamanho.xs,
                      fontWeight: '700',
                    }}
                  >
                    NOVO
                  </Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: espacamento.sm }}>
              <Text
                style={{
                  color: tema.textoPrimario,
                  fontSize: tipografia.tamanho['2xl'],
                  fontWeight: '700',
                }}
              >
                {kg(marca.cargaMaximaKg)}
              </Text>
              <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
                em {porExtenso(marca.cargaMaximaEm)}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: espacamento.lg, flexWrap: 'wrap' }}>
              <View>
                <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
                  Melhor série
                </Text>
                <Text style={{ color: tema.textoPrimario, fontWeight: '600' }}>
                  {kg(marca.volumeMaximoSerieKg)}
                </Text>
              </View>
              <View>
                <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
                  1RM estimado
                </Text>
                <Text style={{ color: tema.textoPrimario, fontWeight: '600' }}>
                  {kg(marca.melhor1rmKg)}
                </Text>
              </View>
              <View>
                <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
                  Dias treinados
                </Text>
                <Text style={{ color: tema.textoPrimario, fontWeight: '600' }}>
                  {marca.diasTreinados}
                </Text>
              </View>
            </View>
          </View>
        );
      })}

      {/*
        A explicação fica no fim e não no começo: quem abre a tela quer ver a
        conquista, não ler sobre metodologia. Mas ela precisa existir — 1RM
        estimado é um número que ninguém levantou de verdade.
      */}
      <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
        O 1RM estimado é um cálculo a partir da carga e das repetições — não é um peso que você
        precisou levantar. Séries de aquecimento não contam como marca.
      </Text>
    </ScrollView>
  );
}
