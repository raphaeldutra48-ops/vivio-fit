import type { ConversaResumo, MensagemResumo } from '@vivio/contracts';
import { alvoToqueMin, espacamento, raio, tipografia } from '@vivio/ui-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { sdk } from '../src/sdk';
import { useSessao } from '../src/sessao';
import { gerarUuid } from '../src/uuid';

const NOME_DO_PAPEL: Record<string, string> = {
  PERSONAL: 'Personal trainer',
  NUTRICIONISTA: 'Nutricionista',
  MEDICO: 'Médico(a)',
};

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Chat do aluno com a equipe de cuidado.
 *
 * Existia só do lado do profissional: ele mandava mensagem para um aluno que
 * não tinha onde ler. Era o buraco mais estranho do app — todo o resto
 * (feedback, dor, adesão) leva a uma conversa que não acontecia.
 *
 * O aluno **não** inicia conversa aqui. Ela nasce quando o profissional
 * escreve, e é isso que a lista mostra: quem já falou com você. Deixar o aluno
 * abrir conversa com qualquer membro da equipe é possível pela API, mas
 * abriria a porta para mandar mensagem a um profissional que talvez nem
 * atenda por ali — melhor esperar o primeiro contato vir de quem cobra por ele.
 */
export default function Chat() {
  const { usuario, tema } = useSessao();

  const [conversas, setConversas] = useState<ConversaResumo[]>([]);
  const [ativa, setAtiva] = useState<ConversaResumo | null>(null);
  const [mensagens, setMensagens] = useState<MensagemResumo[]>([]);
  const [texto, setTexto] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const lista = useRef<FlatList<MensagemResumo>>(null);

  const carregarConversas = useCallback(async () => {
    try {
      const encontradas = await sdk.chat.listarConversas();
      setConversas(encontradas);
      return encontradas;
    } catch {
      setErro('Não foi possível carregar suas conversas.');
      return [];
    } finally {
      setCarregando(false);
    }
  }, []);

  const abrir = useCallback(async (conversa: ConversaResumo) => {
    setAtiva(conversa);
    setErro(null);
    try {
      const historico = await sdk.chat.mensagens(conversa.id);
      // A API devolve da mais nova para a mais antiga; a tela lê ao contrário.
      setMensagens([...historico.dados].reverse());
      await sdk.chat.marcarVista(conversa.id);
    } catch {
      setErro('Não foi possível abrir a conversa.');
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const encontradas = await carregarConversas();
      // Com uma conversa só, abrir a lista para a pessoa escolher entre uma
      // opção é passo perdido: entra direto.
      if (encontradas.length === 1) await abrir(encontradas[0]!);
    })();
  }, [carregarConversas, abrir]);

  /* Sondagem leve enquanto o WebSocket não está ligado nesta tela. */
  useEffect(() => {
    if (!ativa) return;
    const intervalo = setInterval(() => {
      void sdk.chat
        .mensagens(ativa.id)
        .then((h) => setMensagens([...h.dados].reverse()))
        .catch(() => undefined);
    }, 15_000);
    return () => clearInterval(intervalo);
  }, [ativa]);

  async function enviar() {
    const corpo = texto.trim();
    if (!corpo || !ativa) return;

    setTexto('');
    try {
      const enviada = await sdk.chat.enviar(ativa.id, { clienteUuid: gerarUuid(), corpo });
      setMensagens((atual) =>
        atual.some((m) => m.id === enviada.id) ? atual : [...atual, enviada],
      );
    } catch {
      setErro('Não foi possível enviar. Tente de novo.');
      // Devolve o texto: perder o que a pessoa escreveu por causa de rede é
      // pior do que o erro em si.
      setTexto(corpo);
    }
  }

  if (carregando) {
    return (
      <View style={{ flex: 1, backgroundColor: tema.fundo, justifyContent: 'center' }}>
        <ActivityIndicator color={tema.acaoFundo} />
      </View>
    );
  }

  if (conversas.length === 0) {
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
            Nenhuma conversa ainda
          </Text>
          <Text style={{ color: tema.textoSecundario }}>
            Quando seu personal, nutricionista ou médico enviar uma mensagem, ela aparece aqui — e
            você responde por este mesmo lugar.
          </Text>
        </View>
      </View>
    );
  }

  /* Mais de um profissional: escolhe com quem falar antes. */
  if (!ativa) {
    return (
      <View style={{ flex: 1, backgroundColor: tema.fundo, padding: espacamento.lg, gap: espacamento.md }}>
        {conversas.map((conversa) => (
          <Pressable
            key={conversa.id}
            accessibilityRole="button"
            accessibilityLabel={`Abrir conversa com ${conversa.contraparte?.nome ?? 'profissional'}`}
            onPress={() => void abrir(conversa)}
            style={{
              backgroundColor: tema.superficie,
              borderRadius: raio.lg,
              borderWidth: 1,
              borderColor: conversa.naoLidas > 0 ? tema.acaoFundo : tema.borda,
              padding: espacamento.lg,
              gap: 2,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>
                {conversa.contraparte?.nome ?? 'Profissional'}
              </Text>
              {conversa.naoLidas > 0 && (
                <View
                  style={{
                    minWidth: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: tema.acaoFundo,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 6,
                  }}
                >
                  <Text style={{ color: tema.acaoTexto, fontSize: tipografia.tamanho.xs, fontWeight: '700' }}>
                    {conversa.naoLidas}
                  </Text>
                </View>
              )}
            </View>
            <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
              {conversa.contraparte ? (NOME_DO_PAPEL[conversa.contraparte.papel] ?? conversa.contraparte.papel) : ''}
            </Text>
            <Text numberOfLines={1} style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
              {conversa.ultimaMensagem?.corpo ?? 'sem mensagens'}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
      style={{ flex: 1, backgroundColor: tema.fundo }}
    >
      {conversas.length > 1 && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setAtiva(null)}
          style={{ padding: espacamento.md, borderBottomWidth: 1, borderBottomColor: tema.borda }}
        >
          <Text style={{ color: tema.textoSecundario }}>← Todas as conversas</Text>
        </Pressable>
      )}

      <FlatList
        ref={lista}
        data={mensagens}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.sm }}
        onContentSizeChange={() => lista.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <Text style={{ color: tema.textoSecundario, textAlign: 'center' }}>
            Ainda sem mensagens nesta conversa.
          </Text>
        }
        renderItem={({ item }) => (
          <View
            style={{
              alignSelf: item.minha ? 'flex-end' : 'flex-start',
              maxWidth: '82%',
              backgroundColor: item.minha ? tema.acaoFundo : tema.superficie,
              borderWidth: item.minha ? 0 : 1,
              borderColor: tema.borda,
              borderRadius: raio.lg,
              paddingHorizontal: espacamento.md,
              paddingVertical: espacamento.sm,
              gap: 2,
            }}
          >
            <Text style={{ color: item.minha ? tema.acaoTexto : tema.textoPrimario }}>
              {item.corpo}
            </Text>
            <Text
              style={{
                color: item.minha ? tema.acaoTexto : tema.textoSecundario,
                fontSize: tipografia.tamanho.xs,
                opacity: 0.8,
                alignSelf: 'flex-end',
              }}
            >
              {hora(item.enviadaEm)}
            </Text>
          </View>
        )}
      />

      {erro && (
        <Text style={{ color: tema.erro, paddingHorizontal: espacamento.lg }}>{erro}</Text>
      )}

      <View
        style={{
          flexDirection: 'row',
          gap: espacamento.sm,
          padding: espacamento.md,
          borderTopWidth: 1,
          borderTopColor: tema.borda,
          backgroundColor: tema.superficie,
        }}
      >
        <TextInput
          accessibilityLabel="Escreva sua mensagem"
          placeholder="Escreva sua mensagem…"
          placeholderTextColor={tema.textoSecundario}
          value={texto}
          onChangeText={setTexto}
          maxLength={4000}
          multiline
          style={{
            flex: 1,
            minHeight: alvoToqueMin,
            maxHeight: 120,
            borderWidth: 1,
            borderColor: tema.borda,
            borderRadius: raio.md,
            paddingHorizontal: espacamento.md,
            paddingTop: espacamento.sm,
            color: tema.textoPrimario,
            backgroundColor: tema.fundo,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Enviar mensagem"
          disabled={!texto.trim()}
          onPress={() => void enviar()}
          style={{
            minWidth: 64,
            minHeight: alvoToqueMin,
            borderRadius: raio.md,
            backgroundColor: tema.acaoFundo,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: texto.trim() ? 1 : 0.5,
          }}
        >
          <Text style={{ color: tema.acaoTexto, fontWeight: '700' }}>Enviar</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
