import { VALIDADE_CALORIMETRIA_MESES, type CalorimetriaResumo } from '@vivio/contracts';
import { alvoToqueMin, espacamento, raio, tipografia } from '@vivio/ui-native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { sdk } from '../src/sdk';
import { useSessao } from '../src/sessao';

function porExtenso(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  if (!ano || !mes || !dia) return iso;
  return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/** `AAAA-MM-DD` do relógio local — não `toISOString`, que já virou amanhã à noite. */
function hojeLocal(): string {
  const d = new Date();
  const doisDigitos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
}

/**
 * Calorimetria indireta — o exame que mede o metabolismo em vez de estimá-lo.
 *
 * Vale a pena existir mesmo sendo raro: quando o aluno tem o laudo, o cálculo
 * calórico inteiro deixa de ser aproximação. E o app é honesto sobre a
 * validade — uma medição antiga, num corpo que mudou, é pior que a estimativa
 * de hoje.
 */
export default function Calorimetria() {
  const { usuario, tema } = useSessao();

  const [exames, setExames] = useState<CalorimetriaResumo[] | null>(null);
  const [aberto, setAberto] = useState(false);
  const [tmb, setTmb] = useState('');
  const [data, setData] = useState(hojeLocal());
  const [peso, setPeso] = useState('');
  const [equipamento, setEquipamento] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!usuario) return;
    try {
      setExames(await sdk.calorimetrias.listar(usuario.id));
      setErro(null);
    } catch {
      setErro('Não foi possível carregar seus exames.');
      setExames([]);
    }
  }, [usuario]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar() {
    const valor = Number(tmb);
    if (!usuario || !valor) return;
    setSalvando(true);
    try {
      await sdk.calorimetrias.registrar(usuario.id, {
        data,
        tmbMedidaKcal: valor,
        pesoNoExameKg: peso.trim() ? Number(peso.replace(',', '.')) : undefined,
        equipamento: equipamento.trim() || undefined,
      });
      setAberto(false);
      setTmb('');
      setPeso('');
      setEquipamento('');
      await carregar();
    } catch {
      setErro('Não foi possível salvar. Confira os valores e tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  const cartao = {
    backgroundColor: tema.superficie,
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: tema.borda,
    padding: espacamento.lg,
    gap: espacamento.sm,
  };

  const campo = {
    minHeight: alvoToqueMin,
    borderWidth: 1,
    borderColor: tema.borda,
    borderRadius: raio.md,
    paddingHorizontal: espacamento.md,
    color: tema.textoPrimario,
    backgroundColor: tema.fundo,
  };

  if (!exames) {
    return (
      <View style={{ flex: 1, backgroundColor: tema.fundo, justifyContent: 'center' }}>
        <ActivityIndicator color={tema.acaoFundo} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: tema.fundo }}
    >
      <ScrollView contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.md }}>
        {erro && <Text style={{ color: tema.erro }}>{erro}</Text>}

        <View style={cartao}>
          <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>
            O exame que mede, em vez de estimar
          </Text>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            A calorimetria indireta mede seu gasto em repouso pela respiração. Sem ela, o app
            calcula por fórmula — que erra de 10% a 15%. Com ela, usa o número real.
          </Text>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            Se você fez esse exame com seu médico ou nutricionista, registre aqui. Não precisa
            fazer — a maioria das pessoas nunca fez, e o app funciona sem.
          </Text>
        </View>

        {!aberto && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Registrar exame de calorimetria"
            onPress={() => setAberto(true)}
            style={{
              minHeight: 56,
              borderRadius: raio.md,
              backgroundColor: tema.acaoFundo,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: tema.acaoTexto, fontWeight: '700', fontSize: tipografia.tamanho.lg }}>
              + Registrar exame
            </Text>
          </Pressable>
        )}

        {aberto && (
          <View style={cartao}>
            <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
              Gasto em repouso medido (kcal/dia)
            </Text>
            <TextInput
              accessibilityLabel="Gasto em repouso em quilocalorias por dia"
              placeholder="1650"
              placeholderTextColor={tema.textoSecundario}
              keyboardType="number-pad"
              value={tmb}
              onChangeText={setTmb}
              maxLength={4}
              style={{
                ...campo,
                minHeight: 60,
                fontSize: tipografia.tamanho['2xl'],
                fontWeight: '700',
              }}
            />
            <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
              No laudo costuma aparecer como TMB, GEB, RMR ou "gasto energético de repouso".
            </Text>

            <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
              Data do exame
            </Text>
            <TextInput
              accessibilityLabel="Data do exame, ano-mês-dia"
              placeholder="2026-08-14"
              placeholderTextColor={tema.textoSecundario}
              value={data}
              onChangeText={setData}
              maxLength={10}
              style={campo}
            />

            <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
              Seu peso no dia do exame (kg)
            </Text>
            <TextInput
              accessibilityLabel="Peso no dia do exame"
              placeholder="—"
              placeholderTextColor={tema.textoSecundario}
              keyboardType="decimal-pad"
              value={peso}
              onChangeText={setPeso}
              style={campo}
            />
            {/*
              O peso do exame não é enfeite: é a régua que diz quando o
              resultado envelheceu. Sem ele, só a data controla — e o corpo
              muda mais rápido que o calendário.
            */}
            <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
              É o que permite o app avisar quando o resultado deixar de valer, caso seu peso mude
              bastante.
            </Text>

            <TextInput
              accessibilityLabel="Onde foi feito"
              placeholder="clínica ou equipamento (opcional)"
              placeholderTextColor={tema.textoSecundario}
              value={equipamento}
              onChangeText={setEquipamento}
              maxLength={120}
              style={campo}
            />

            <View style={{ flexDirection: 'row', gap: espacamento.md, marginTop: espacamento.sm }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancelar"
                onPress={() => setAberto(false)}
                style={{
                  flex: 1,
                  minHeight: 52,
                  borderRadius: raio.md,
                  borderWidth: 1,
                  borderColor: tema.borda,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: tema.textoPrimario }}>Cancelar</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Salvar exame"
                disabled={salvando || !Number(tmb)}
                onPress={() => void salvar()}
                style={{
                  flex: 2,
                  minHeight: 52,
                  borderRadius: raio.md,
                  backgroundColor: tema.acaoFundo,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: salvando || !Number(tmb) ? 0.5 : 1,
                }}
              >
                <Text style={{ color: tema.acaoTexto, fontWeight: '700' }}>
                  {salvando ? 'Salvando…' : Number(tmb) ? 'Salvar' : 'Informe o valor'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {exames.length === 0 ? (
          <View style={cartao}>
            <Text style={{ color: tema.textoSecundario }}>
              Nenhum exame registrado. Enquanto isso, o app estima seu metabolismo pela composição
              corporal ou por fórmula.
            </Text>
          </View>
        ) : (
          exames.map((e) => (
            <View
              key={e.id}
              style={{
                ...cartao,
                borderWidth: e.validade.valida ? 2 : 1,
                borderColor: e.validade.valida ? tema.sucesso : tema.borda,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: espacamento.sm }}>
                <Text
                  style={{
                    color: tema.textoPrimario,
                    fontSize: tipografia.tamanho['2xl'],
                    fontWeight: '700',
                  }}
                >
                  {e.tmbMedidaKcal.toLocaleString('pt-BR')}
                </Text>
                <Text style={{ color: tema.textoSecundario }}>kcal/dia em repouso</Text>
              </View>

              <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
                {porExtenso(e.data)}
                {e.pesoNoExameKg !== null ? ` · ${e.pesoNoExameKg} kg na época` : ''}
                {e.equipamento ? ` · ${e.equipamento}` : ''}
              </Text>

              {/*
                Dizer POR QUE deixou de valer, e não só que deixou. Sem o
                motivo, o número do gasto muda sozinho de um mês para o outro e
                a pessoa acha que o app se confundiu.
              */}
              {e.validade.valida ? (
                <Text style={{ color: tema.sucesso, fontWeight: '700', fontSize: tipografia.tamanho.sm }}>
                  ✓ Em uso no seu cálculo
                </Text>
              ) : (
                <Text style={{ color: tema.alerta, fontSize: tipografia.tamanho.sm }}>
                  {e.validade.motivo === 'MUDANCA_DE_PESO'
                    ? 'Seu peso mudou bastante desde este exame, então o app voltou a estimar. Vale refazer.'
                    : `Passou de ${VALIDADE_CALORIMETRIA_MESES} meses (${e.validade.mesesDesde} atrás), então o app voltou a estimar.`}
                </Text>
              )}

              <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
                Registrado por {e.registradoPor.nome}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
