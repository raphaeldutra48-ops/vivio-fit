import type { CheckinResumo, ExecucaoResumo, PlanoTreinoCompleto } from '@vivio/contracts';
import { cobrancaDaDieta, dataLocalDoCheckin, type CobrancaDaDieta } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { espacamento, raio, tipografia } from '@vivio/ui-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ContadorDeCalorias } from '../../src/componentes/ContadorDeCalorias';
import { FalhouAoCarregar } from '../../src/componentes/Estado';
import { sdk } from '../../src/sdk';
import { useSessao } from '../../src/sessao';

export default function Inicio() {
  const { usuario, tema, sair } = useSessao();
  const router = useRouter();
  const hoje = dataLocalDoCheckin();
  const [plano, setPlano] = useState<PlanoTreinoCompleto | null>(null);
  const [execucoes, setExecucoes] = useState<ExecucaoResumo[]>([]);
  const [semPlano, setSemPlano] = useState(false);
  /** Falha de rede — dizer "seu personal não montou" aqui seria acusá-lo à toa. */
  const [falhouOPlano, setFalhouOPlano] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [checkinDeHoje, setCheckinDeHoje] = useState<CheckinResumo | null>(null);
  const [naoLidas, setNaoLidas] = useState(0);
  const [convitesAbertos, setConvitesAbertos] = useState(0);
  const [temProfissional, setTemProfissional] = useState(true);
  const [cobranca, setCobranca] = useState<CobrancaDaDieta | null>(null);

  useEffect(() => {
    if (!usuario) return;
    setFalhouOPlano(false);
    sdk.treinos
      .obterAtivo(usuario.id)
      .then((p) => {
        setPlano(p);
        setSemPlano(false);
      })
      /*
        404 é "não há plano"; o resto é "não consegui perguntar". Antes os dois
        viravam a mesma frase — "Seu personal ainda não montou ou ativou um
        plano para você" — dita a quem só estava sem sinal.
      */
      .catch((e: unknown) => {
        if (e instanceof ErroApi && e.status === 404) setSemPlano(true);
        else setFalhouOPlano(true);
      });
    sdk.execucoes
      .listar(usuario.id, 5)
      .then(setExecucoes)
      .catch(() => undefined);
  }, [usuario, tentativa]);

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
    sdk.vinculos
      .meusProfissionais()
      .then((vs) => {
        setConvitesAbertos(vs.filter((v) => v.aguardandoMinhaResposta).length);
        setTemProfissional(vs.some((v) => v.status === 'ATIVO'));
      })
      .catch(() => undefined);

    /*
      A dieta é o único acompanhamento que depende de resposta várias vezes
      por dia, e por isso é o que mais some sem alguém puxando. Sem plano
      ativo ou sem autorização, as duas chamadas falham e a cobrança fica
      calada — que é o certo: não há o que cobrar.
    */
    void (async () => {
      try {
        const [dieta, registros] = await Promise.all([
          sdk.dietas.obterAtiva(usuario.id),
          sdk.dietas.registrosDoDia(usuario.id),
        ]);
        setCobranca(
          cobrancaDaDieta(
            dieta.refeicoes.map((r) => ({
              id: r.id,
              nome: r.nome,
              horarioSugerido: r.horarioSugerido,
            })),
            registros.map((r) => r.refeicaoId),
          ),
        );
      } catch {
        setCobranca(null);
      }
    })();
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

      {/*
        Acima de tudo, inclusive das mensagens: enquanto o convite não for
        respondido não existe vínculo, e sem vínculo o app não tem treino,
        dieta nem acompanhamento — a pessoa fica olhando telas vazias sem
        entender o que falta.
      */}
      {convitesAbertos > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${convitesAbertos} ${convitesAbertos === 1 ? 'convite aguardando' : 'convites aguardando'} sua resposta`}
          onPress={() => router.push('/equipe')}
          style={{
            backgroundColor: tema.acaoFundo,
            borderRadius: raio.lg,
            padding: espacamento.lg,
            gap: espacamento.xs,
          }}
        >
          <Text style={{ color: tema.acaoTexto, fontWeight: '700' }}>
            ✋ {convitesAbertos === 1 ? 'Um profissional quer te acompanhar' : `${convitesAbertos} profissionais querem te acompanhar`}
          </Text>
          <Text style={{ color: tema.acaoTexto, fontSize: tipografia.tamanho.sm }}>
            Toque para aceitar — é o que libera seu treino.
          </Text>
        </Pressable>
      )}

      {/*
        Sem profissional e sem convite: a pessoa criou a conta e não tem o que
        fazer. Dizer o e-mail dela aqui é o que destrava — é esse endereço que
        o profissional precisa para convidar.
      */}
      {convitesAbertos === 0 && !temProfissional && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ver minha equipe"
          onPress={() => router.push('/equipe')}
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
            Você ainda não tem profissional
          </Text>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            Peça para te convidarem usando o e-mail {usuario?.email}. Toque para ver os detalhes.
          </Text>
        </Pressable>
      )}

      {/*
        Recado do personal ou do médico não pode depender de a pessoa rolar a
        tela até um quadradinho no rodapé — foi onde ele estava e não é lugar
        de mensagem que espera resposta.
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
        Só quando já existe profissional e nenhum convite pendente. Antes
        disso, "seu personal não montou um plano" é resposta para a pergunta
        errada: o que falta é aceitar o convite, e dizer as duas coisas ao
        mesmo tempo faz a pessoa tentar resolver a que não depende dela.
      */}
      {falhouOPlano && (
        <FalhouAoCarregar
          mensagem="Não deu para buscar seu treino agora. Ele continua salvo — assim que a rede voltar, aparece aqui."
          aoTentarDeNovo={() => setTentativa((t) => t + 1)}
        />
      )}

      {semPlano && temProfissional && convitesAbertos === 0 && (
        <View
          style={{
            backgroundColor: tema.superficie,
            borderRadius: raio.lg,
            borderWidth: 1,
            borderColor: tema.borda,
            padding: espacamento.lg,
          }}
        >
          <Text style={{ color: tema.textoPrimario, fontWeight: '600' }}>Nenhum treino ativo</Text>
          <Text style={{ color: tema.textoSecundario, marginTop: espacamento.xs }}>
            Seu personal ainda não montou ou ativou um plano para você.
          </Text>
        </View>
      )}

      {/*
        A dieta só cobra quando o horário da refeição já passou — cobrar de
        manhã pelo jantar ensina a ignorar o aviso, e aviso ignorado não cobra
        mais nada depois.
      */}
      {cobranca && cobranca.pendentes.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${cobranca.pendentes.length} refeições sem registro hoje`}
          onPress={() => router.push('/nutricao')}
          style={{
            backgroundColor: tema.superficie,
            borderRadius: raio.lg,
            borderWidth: cobranca.urgencia === 'ATRASADO' ? 2 : 1,
            borderColor: cobranca.urgencia === 'ATRASADO' ? tema.alerta : tema.borda,
            padding: espacamento.lg,
            gap: espacamento.xs,
          }}
        >
          <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>
            🍽️ {cobranca.respondidas} de {cobranca.total} refeições registradas
          </Text>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            {cobranca.mensagem}
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

      {/*
        Antes dos atalhos: o contador é informação, os atalhos são navegação.
        Enterrá-lo entre botões faria dele mais um botão.
      */}
      <ContadorDeCalorias />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.md }}>
        {[
          { rotulo: '🏃 Cardio', destino: '/cardio', descricao: 'Registrar corrida, bike, caminhada' },
          { rotulo: '⚙️ Meus dados', destino: '/perfil', descricao: 'Altura e dados do metabolismo' },
          { rotulo: '👥 Minha equipe', destino: '/equipe', descricao: 'Equipe e autorizacoes' },
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
