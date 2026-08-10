import type { CheckinResumo, ExecucaoResumo, PlanoTreinoCompleto } from '@vivio/contracts';
import { dataLocalDoCheckin } from '@vivio/contracts';
import { espacamento, raio, tipografia } from '@vivio/ui-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { sdk } from '../../src/sdk';
import { useSessao } from '../../src/sessao';

export default function Inicio() {
  const { usuario, tema, sair } = useSessao();
  const router = useRouter();
  const hoje = dataLocalDoCheckin();
  const [plano, setPlano] = useState<PlanoTreinoCompleto | null>(null);
  const [execucoes, setExecucoes] = useState<ExecucaoResumo[]>([]);
  const [semPlano, setSemPlano] = useState(false);
  const [checkinDeHoje, setCheckinDeHoje] = useState<CheckinResumo | null>(null);
  const [naoLidas, setNaoLidas] = useState(0);

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

  const buscarAoVoltar = useCallback(() => {
    if (!usuario) return;
    sdk.checkins
      .listar(usuario.id, 1)
      .then((lista) => setCheckinDeHoje(lista.find((c) => c.data.slice(0, 10) === hoje) ?? null))
      .catch(() => undefined);
    sdk.chat
      .listarConversas()
      .then((cs) => setNaoLidas(cs.reduce((total, c) => total + c.naoLidas, 0)))
      .catch(() => undefined);
  }, [usuario, hoje]);

  /*
    A cada vez que a tela volta ao foco, e não só na montagem: sem isso o
    cartão continuaria perguntando "como foi seu dia?" logo depois de a pessoa
    ter respondido e voltado, e o aviso de mensagem nova continuaria aceso
    depois de lida.
  */
  useFocusEffect(buscarAoVoltar);

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

      {/*
        Antes de tudo. Recado do personal ou do médico não pode depender de a
        pessoa rolar a tela até um quadradinho no rodapé — foi onde ele estava
        e não é lugar de mensagem que espera resposta.
      */}
      {naoLidas > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${naoLidas} ${naoLidas === 1 ? 'mensagem não lida' : 'mensagens não lidas'}`}
          onPress={() => router.push('/chat')}
          style={{
            backgroundColor: tema.acaoFundo,
            borderRadius: raio.lg,
            padding: espacamento.lg,
          }}
        >
          <Text style={{ color: tema.acaoTexto, fontWeight: '700' }}>
            💬 {naoLidas} {naoLidas === 1 ? 'mensagem nova' : 'mensagens novas'}
          </Text>
          <Text style={{ color: tema.acaoTexto, fontSize: tipografia.tamanho.sm }}>
            Toque para ler e responder.
          </Text>
        </Pressable>
      )}

      {/*
        Acima do treino de propósito. O check-in leva cinco segundos e vale
        todo dia, inclusive nos de descanso — enterrá-lo abaixo do cartão de
        treino faria dele coisa de quem foi treinar, que é justamente o
        contrário do que ele mede.
      */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          checkinDeHoje ? 'Alterar o check-in de hoje' : 'Fazer o check-in de hoje'
        }
        onPress={() => router.push('/checkin')}
        style={{
          backgroundColor: checkinDeHoje ? tema.superficie : tema.primariaFundo,
          borderRadius: raio.lg,
          borderWidth: 1,
          borderColor: checkinDeHoje ? tema.borda : tema.acaoFundo,
          padding: espacamento.lg,
          gap: espacamento.xs,
        }}
      >
        {checkinDeHoje ? (
          <>
            <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>
              ✓ Check-in de hoje feito
            </Text>
            <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
              {checkinDeHoje.treinou ? 'Você treinou' : 'Dia sem treino'}
              {checkinDeHoje.teveDor ? ' · com dor' : ''} · toque para alterar
            </Text>
          </>
        ) : (
          <>
            <Text style={{ color: tema.primariaTexto, fontWeight: '700' }}>
              Como foi seu dia?
            </Text>
            <Text style={{ color: tema.primariaTexto, fontSize: tipografia.tamanho.sm }}>
              Leva cinco segundos e é o que mantém seu personal por dentro.
            </Text>
          </>
        )}
      </Pressable>

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

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.md }}>
        {[
          { rotulo: '💬 Conversas', destino: '/chat', descricao: 'Conversas com a equipe' },
          { rotulo: '⏰ Lembretes', destino: '/lembretes', descricao: 'Configurar lembretes' },
          { rotulo: '📋 Prescrições', destino: '/prescricoes', descricao: 'Minhas prescrições' },
          { rotulo: '📁 Materiais', destino: '/materiais', descricao: 'Materiais recebidos' },
        ].map((atalho) => (
          <Pressable
            key={atalho.destino}
            accessibilityRole="button"
            accessibilityLabel={atalho.descricao}
            onPress={() => router.push(atalho.destino)}
            style={{
              // Dois por linha: com quatro numa fila só, cada rótulo virava
              // duas palavras quebradas numa tela de 375 pontos.
              flexBasis: '47%',
              flexGrow: 1,
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

      <Pressable accessibilityRole="button" onPress={() => void sair()} style={{ paddingVertical: espacamento.md }}>
        <Text style={{ color: tema.textoSecundario, textAlign: 'center' }}>Sair da conta</Text>
      </Pressable>
    </ScrollView>
  );
}
