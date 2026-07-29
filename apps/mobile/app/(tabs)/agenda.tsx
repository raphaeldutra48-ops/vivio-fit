import {
  ROTULO_STATUS,
  ROTULO_TIPO_COMPROMISSO,
  type CompromissoResumo,
  type StatusCompromisso,
} from '@vivio/contracts';
import { alvoToqueMin, espacamento, raio, tipografia } from '@vivio/ui-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { sdk } from '../../src/sdk';
import { useSessao } from '../../src/sessao';

/** Próximos 60 dias — o aluno não precisa navegar por mês. */
const DIAS_A_FRENTE = 60;

function agrupaPorDia(lista: CompromissoResumo[]): [string, CompromissoResumo[]][] {
  const mapa = new Map<string, CompromissoResumo[]>();
  for (const c of lista) {
    const dia = c.inicioEm.slice(0, 10);
    (mapa.get(dia) ?? mapa.set(dia, []).get(dia)!).push(c);
  }
  return [...mapa.entries()];
}

export default function Agenda() {
  const { usuario, tema } = useSessao();
  const [compromissos, setCompromissos] = useState<CompromissoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    if (!usuario) return;
    const agora = new Date();
    const fim = new Date(agora.getTime() + DIAS_A_FRENTE * 864e5);
    try {
      setCompromissos(await sdk.agenda.meus(agora.toISOString(), fim.toISOString()));
      setErro(null);
    } catch {
      setErro('Não foi possível carregar sua agenda.');
    } finally {
      setCarregando(false);
    }
  }, [usuario]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  async function responder(id: string, status: StatusCompromisso) {
    try {
      await sdk.agenda.mudarStatus(id, { status });
      await recarregar();
    } catch {
      setErro('Não foi possível atualizar. Tente de novo.');
    }
  }

  const corDoStatus = (s: StatusCompromisso) =>
    s === 'CONFIRMADO' || s === 'REALIZADO' ? tema.sucesso : tema.textoSecundario;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tema.fundo }}
      contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.lg }}
    >
      {carregando && <ActivityIndicator color={tema.primariaFundo} />}
      {erro && <Text style={{ color: tema.erro }}>{erro}</Text>}

      {!carregando && compromissos.length === 0 && (
        <View
          style={{
            backgroundColor: tema.superficie,
            borderRadius: raio.lg,
            borderWidth: 1,
            borderColor: tema.borda,
            padding: espacamento.lg,
          }}
        >
          <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>
            Nenhum atendimento marcado
          </Text>
          <Text style={{ color: tema.textoSecundario, marginTop: espacamento.xs }}>
            Quando seu personal, nutricionista ou médico marcar uma avaliação ou consulta, ela
            aparece aqui.
          </Text>
        </View>
      )}

      {agrupaPorDia(compromissos).map(([dia, doDia]) => (
        <View key={dia} style={{ gap: espacamento.sm }}>
          <Text
            style={{
              color: tema.textoSecundario,
              fontSize: tipografia.tamanho.sm,
              fontWeight: '600',
            }}
          >
            {new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', {
              weekday: 'long',
              day: '2-digit',
              month: 'long',
            })}
          </Text>

          {doDia.map((c) => (
            <View
              key={c.id}
              style={{
                backgroundColor: tema.superficie,
                borderRadius: raio.lg,
                borderWidth: 1,
                borderColor: tema.borda,
                padding: espacamento.lg,
                gap: espacamento.sm,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text
                  style={{
                    color: tema.textoPrimario,
                    fontSize: tipografia.tamanho.xl,
                    fontWeight: '700',
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {new Date(c.inicioEm).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
                <Text style={{ color: corDoStatus(c.status), fontWeight: '700' }}>
                  {ROTULO_STATUS[c.status]}
                </Text>
              </View>

              <View>
                <Text style={{ color: tema.textoPrimario, fontWeight: '600' }}>
                  {ROTULO_TIPO_COMPROMISSO[c.tipo]}
                </Text>
                <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
                  com {c.profissional.nome}
                  {c.local ? ` · ${c.local}` : ''} · {c.duracaoMin} min
                </Text>
              </View>

              {/* O aluno confirma presença ou avisa que não vai. Nada além disso. */}
              {c.status === 'AGENDADO' && (
                <View style={{ flexDirection: 'row', gap: espacamento.sm }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Confirmar presença em ${ROTULO_TIPO_COMPROMISSO[c.tipo]}`}
                    onPress={() => void responder(c.id, 'CONFIRMADO')}
                    style={{
                      flex: 1,
                      minHeight: alvoToqueMin,
                      borderRadius: raio.md,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: tema.acaoFundo,
                    }}
                  >
                    <Text style={{ color: tema.acaoTexto, fontWeight: '700' }}>
                      Confirmar presença
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cancelar este atendimento"
                    onPress={() => void responder(c.id, 'CANCELADO')}
                    style={{
                      minHeight: alvoToqueMin,
                      paddingHorizontal: espacamento.lg,
                      borderRadius: raio.md,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: tema.borda,
                    }}
                  >
                    <Text style={{ color: tema.textoSecundario }}>Não vou</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
