import type { ResumoDeCalorias } from '@vivio/contracts';
import { espacamento, raio, tipografia } from '@vivio/ui-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { sdk } from '../sdk';
import { useSessao } from '../sessao';

/**
 * As calorias na tela inicial, e não escondidas dentro de Cardio.
 *
 * O número existia mas ninguém chegava nele: era preciso saber que Cardio
 * guardava também o gasto da musculação e do corpo em repouso. Um contador que
 * exige três toques para aparecer não é consultado, e o que não é consultado
 * não muda comportamento nenhum.
 *
 * Duas janelas lado a lado porque respondem perguntas diferentes: o dia diz se
 * hoje rendeu, a semana diz se a rotina está de pé. Um dia fraco não significa
 * nada sozinho — só ao lado da semana é que vira informação.
 *
 * Os rótulos dizem **24 h** e **7 dias**, e não "hoje" e "esta semana", porque
 * é isso que a conta faz: uma janela móvel para trás a partir de agora. Chamar
 * de "hoje" faria o número cair sozinho à meia-noite e subir de novo, sem o
 * aluno ter feito nada.
 */
export function ContadorDeCalorias() {
  const { usuario, tema } = useSessao();
  const router = useRouter();
  const [dia, setDia] = useState<ResumoDeCalorias | null>(null);
  const [semana, setSemana] = useState<ResumoDeCalorias | null>(null);
  const [indisponivel, setIndisponivel] = useState(false);

  useEffect(() => {
    if (!usuario) return;
    let ativo = true;
    void (async () => {
      try {
        const [d, s] = await Promise.all([
          sdk.cardio.calorias(usuario.id, 1),
          sdk.cardio.calorias(usuario.id, 7),
        ]);
        if (!ativo) return;
        setDia(d);
        setSemana(s);
      } catch {
        /*
          Sem autorização de evolução a chamada falha, e é o caso normal de
          quem ainda não decidiu compartilhar. Some em silêncio: um erro
          vermelho na tela inicial diria que o app quebrou.
        */
        if (ativo) setIndisponivel(true);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [usuario]);

  if (indisponivel || !dia || !semana) return null;

  const semPeso = dia.pesoUsadoKg === null;

  const Coluna = ({ titulo, resumo }: { titulo: string; resumo: ResumoDeCalorias }) => (
    <View style={{ flex: 1 }}>
      <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>{titulo}</Text>
      <Text style={{ color: tema.textoPrimario, fontSize: 28, fontWeight: '800' }}>
        {resumo.totalKcal === null ? '—' : resumo.totalKcal.toLocaleString('pt-BR')}
      </Text>
      <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
        kcal em exercício
      </Text>
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ver detalhes das calorias e do cardio"
      onPress={() => router.push('/cardio')}
      style={{
        backgroundColor: tema.superficie,
        borderRadius: raio.md,
        borderWidth: 1,
        borderColor: tema.borda,
        padding: espacamento.lg,
        gap: espacamento.md,
      }}
    >
      <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>🔥 Calorias queimadas</Text>

      {/* Lado a lado: a comparação é o ponto, e ela some se um ficar abaixo do outro. */}
      <View style={{ flexDirection: 'row', gap: espacamento.lg }}>
        <Coluna titulo="Últimas 24 h" resumo={dia} />
        <Coluna titulo="Últimos 7 dias" resumo={semana} />
      </View>

      {semPeso ? (
        <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
          Registre seu peso para o app conseguir estimar — a conta depende dele.
        </Text>
      ) : (
        semana.gastoDiario.totalPorDia !== null && (
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            Com o corpo em repouso, seu gasto total é de cerca de{' '}
            <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>
              {semana.gastoDiario.totalPorDia.toLocaleString('pt-BR')} kcal por dia
            </Text>
            . Toque para ver de onde vem.
          </Text>
        )
      )}
    </Pressable>
  );
}
