import type { ExecucaoResumo } from '@vivio/contracts';
import { alvoToqueMin, espacamento, raio, tipografia } from '@vivio/ui-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Carregando, FalhouAoCarregar } from '../../src/componentes/Estado';
import { sdk } from '../../src/sdk';
import { useSessao } from '../../src/sessao';
import { useSincronizacao } from '../../src/sincronizacao';

export default function Evolucao() {
  const { usuario, tema } = useSessao();
  const { pendentes, descartados, sincronizando, sincronizar, tentarDeNovo, esquecer } =
    useSincronizacao();
  const router = useRouter();
  const [execucoes, setExecucoes] = useState<ExecucaoResumo[]>([]);
  /*
    Três estados, não um. Antes o erro era engolido e a lista ficava vazia — o
    mesmo vazio de quem nunca treinou. O aluno sem sinal lia "0 treinos · 0
    séries · 0 kg" com cinquenta treinos gravados no servidor, e concluía que
    tinha perdido o histórico.
  */
  const [situacao, setSituacao] = useState<'carregando' | 'erro' | 'pronto'>('carregando');
  /** Sobe a cada toque em "tentar de novo", para o efeito rodar outra vez. */
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!usuario) return;
    let ativo = true;
    setSituacao('carregando');
    sdk.execucoes
      .listar(usuario.id, 30)
      .then((lista) => {
        if (!ativo) return;
        setExecucoes(lista);
        setSituacao('pronto');
      })
      .catch(() => ativo && setSituacao('erro'));
    return () => {
      ativo = false;
    };
    // Recarrega quando a fila esvazia: o treino recém-enviado precisa aparecer.
  }, [usuario, pendentes.length, tentativa]);

  /*
    Dado bom continua na tela mesmo quando a recarga falha — o aviso vai por
    cima. Apagar um histórico já carregado porque a rede oscilou seria trocar
    uma informação certa por nenhuma.

    O contrário também vale: sem nunca ter carregado, não há número a mostrar,
    e o zero seria mentira.
  */
  const podeMostrarNumeros = situacao === 'pronto' || execucoes.length > 0;

  const volumeTotal = execucoes.reduce((soma, e) => soma + e.volumeTotalKg, 0);
  const totalSeries = execucoes.reduce((soma, e) => soma + e.totalSeries, 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tema.fundo }}
      contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.lg }}
    >
      {/*
        Treino que o servidor RECUSOU de vez.

        Antes ele saía da fila em silêncio: o contador de pendentes voltava a
        zero, que é a mesma tela de "tudo enviado", e a pessoa acreditava que uma
        hora de academia tinha subido. Agora o treino continua no aparelho, com o
        motivo, e com as duas saídas que fazem sentido — tentar de novo (a causa
        mais comum é autorização retirada, que se resolve autorizando) ou
        esquecer, que é a pessoa dizendo que não quer mais aquele registro.
      */}
      {descartados.map((d) => (
        <View
          key={d.clienteUuid}
          style={{
            backgroundColor: tema.superficie,
            borderRadius: raio.md,
            borderWidth: 2,
            borderColor: tema.erro,
            padding: espacamento.md,
            gap: espacamento.xs,
          }}
        >
          <Text style={{ color: tema.erro, fontWeight: '700' }}>
            Um treino não foi aceito pelo servidor
          </Text>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            De {new Date(d.execucao.iniciadoEm).toLocaleDateString('pt-BR')}, com{' '}
            {d.execucao.series.length}{' '}
            {d.execucao.series.length === 1 ? 'série' : 'séries'}. Ele continua salvo aqui no
            aparelho — não foi perdido, mas também não chegou ao seu profissional.
          </Text>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
            {d.motivo === 'CONSENTIMENTO_AUSENTE'
              ? 'O compartilhamento de treino estava desligado quando ele tentou subir. Ligue em Minha equipe e toque em tentar de novo.'
              : `Motivo informado pelo servidor: ${d.motivo}.`}
          </Text>
          <View style={{ flexDirection: 'row', gap: espacamento.sm, marginTop: espacamento.xs }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tentar enviar este treino de novo"
              onPress={() => void tentarDeNovo(d.clienteUuid)}
              style={{
                flex: 1,
                minHeight: alvoToqueMin,
                borderRadius: raio.md,
                backgroundColor: tema.acaoFundo,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: tema.acaoTexto, fontWeight: '700' }}>Tentar de novo</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Esquecer este treino"
              onPress={() => void esquecer(d.clienteUuid)}
              style={{
                minHeight: alvoToqueMin,
                paddingHorizontal: espacamento.lg,
                borderRadius: raio.md,
                borderWidth: 1,
                borderColor: tema.borda,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: tema.textoSecundario }}>Esquecer</Text>
            </Pressable>
          </View>
        </View>
      ))}

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

      {/*
        Os números só aparecem quando são verdade. Enquanto carrega ou depois
        de falhar, mostrar "0 treinos" seria pior que não mostrar nada — é uma
        afirmação sobre a vida da pessoa, e estaria errada.
      */}
      {situacao === 'carregando' && !podeMostrarNumeros && <Carregando oQue="Buscando seus treinos…" />}
      {situacao === 'erro' && (
        <FalhouAoCarregar
          mensagem="Não deu para buscar seu histórico agora. Ele continua salvo — nada foi perdido."
          aoTentarDeNovo={() => setTentativa((t) => t + 1)}
        />
      )}

      {podeMostrarNumeros && (
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
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.sm }}>
        {[
          // Recorde e meta primeiro: são os dois que respondem "estou
          // melhorando?" — um pelo que já foi feito, outro pelo que falta. É
          // por isso que se abre a aba de evolução.
          { rotulo: '🏆 Recordes', destino: '/recordes' as const },
          { rotulo: '🎯 Metas', destino: '/metas' as const },
          { rotulo: '📈 Composição', destino: '/composicao' as const },
          { rotulo: '📸 Fotos', destino: '/fotos' as const },
        ].map((atalho) => (
          <Pressable
            key={atalho.destino}
            accessibilityRole="button"
            accessibilityLabel={`Abrir ${atalho.rotulo}`}
            onPress={() => router.push(atalho.destino)}
            style={{
              flex: 1,
              minHeight: 52,
              borderRadius: raio.md,
              backgroundColor: tema.superficie,
              borderWidth: 1,
              borderColor: tema.borda,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>{atalho.rotulo}</Text>
          </Pressable>
        ))}
      </View>

      {podeMostrarNumeros && (
        <Text
          style={{ fontSize: tipografia.tamanho.lg, fontWeight: '600', color: tema.textoPrimario }}
        >
          Histórico
        </Text>
      )}

      {/* Este vazio agora é o de verdade: carregou e não há treino nenhum. */}
      {situacao === 'pronto' && execucoes.length === 0 && (
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
