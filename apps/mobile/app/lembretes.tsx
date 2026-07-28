import { PREVIA_LEMBRETE, TipoLembrete, type LembreteResumo } from '@vivio/contracts';
import { alvoToqueMin, espacamento, raio, tipografia } from '@vivio/ui-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { sdk } from '../src/sdk';
import { useSessao } from '../src/sessao';

const DIAS = [
  { numero: 1, sigla: 'S' },
  { numero: 2, sigla: 'T' },
  { numero: 3, sigla: 'Q' },
  { numero: 4, sigla: 'Q' },
  { numero: 5, sigla: 'S' },
  { numero: 6, sigla: 'S' },
  { numero: 7, sigla: 'D' },
];

const FORMATO_HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function Lembretes() {
  const { tema } = useSessao();
  const [config, setConfig] = useState<LembreteResumo | null>(null);
  const [horario, setHorario] = useState('07:00');
  const [dias, setDias] = useState<number[]>([]);
  const [ativo, setAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const todos = await sdk.lembretes.listar();
        const treino = todos.find((l) => l.tipo === TipoLembrete.TREINO);
        if (treino) {
          setConfig(treino);
          setHorario(treino.horarios[0] ?? '07:00');
          setDias(treino.diasDaSemana);
          setAtivo(treino.ativo);
        }
      } catch {
        setErro('Não foi possível carregar seus lembretes.');
      }
    })();
  }, []);

  function alternarDia(numero: number) {
    setDias((atual) =>
      atual.includes(numero) ? atual.filter((d) => d !== numero) : [...atual, numero].sort(),
    );
  }

  async function salvar() {
    if (!FORMATO_HORARIO.test(horario)) {
      setErro('Use o formato HH:MM, por exemplo 07:30.');
      return;
    }
    setSalvando(true);
    setErro(null);
    setMensagem(null);
    try {
      const salvo = await sdk.lembretes.definir({
        tipo: TipoLembrete.TREINO,
        horarios: [horario],
        diasDaSemana: dias,
        canais: ['PUSH'],
        ativo,
      });
      setConfig(salvo);
      setMensagem('Lembrete salvo.');
    } catch {
      setErro('Não foi possível salvar. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  const previa = PREVIA_LEMBRETE[TipoLembrete.TREINO];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tema.fundo }}
      contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.lg }}
    >
      <View
        style={{
          backgroundColor: tema.superficie,
          borderRadius: raio.lg,
          borderWidth: 1,
          borderColor: tema.borda,
          padding: espacamento.lg,
          gap: espacamento.lg,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: tema.textoPrimario, fontWeight: '700', fontSize: tipografia.tamanho.lg }}>
            Lembrete de treino
          </Text>
          <Switch
            accessibilityLabel="Ativar lembrete de treino"
            value={ativo}
            onValueChange={setAtivo}
            trackColor={{ true: tema.primariaFundo, false: tema.borda }}
          />
        </View>

        <View style={{ gap: espacamento.xs }}>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            Horário
          </Text>
          <TextInput
            accessibilityLabel="Horário do lembrete, formato HH:MM"
            style={{
              minHeight: alvoToqueMin,
              borderWidth: 1,
              borderColor: tema.borda,
              borderRadius: raio.md,
              paddingHorizontal: espacamento.md,
              color: tema.textoPrimario,
              backgroundColor: tema.fundo,
              fontSize: tipografia.tamanho.xl,
              fontWeight: '700',
            }}
            keyboardType="numbers-and-punctuation"
            placeholder="07:00"
            placeholderTextColor={tema.textoSecundario}
            value={horario}
            onChangeText={setHorario}
            maxLength={5}
          />
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
            No seu horário local.
          </Text>
        </View>

        <View style={{ gap: espacamento.xs }}>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            Dias {dias.length === 0 && '(todos)'}
          </Text>
          <View style={{ flexDirection: 'row', gap: espacamento.xs }}>
            {DIAS.map((dia) => {
              const marcado = dias.includes(dia.numero);
              return (
                <Pressable
                  key={dia.numero}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: marcado }}
                  accessibilityLabel={`Dia ${dia.numero} da semana`}
                  onPress={() => alternarDia(dia.numero)}
                  style={{
                    flex: 1,
                    minHeight: alvoToqueMin,
                    borderRadius: raio.sm,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: marcado ? tema.primariaFundo : 'transparent',
                    borderWidth: 1,
                    borderColor: marcado ? tema.primariaFundo : tema.borda,
                  }}
                >
                  <Text
                    style={{
                      color: marcado ? tema.primariaTexto : tema.textoSecundario,
                      fontWeight: '700',
                    }}
                  >
                    {dia.sigla}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Prévia: o aluno vê exatamente o que vai chegar */}
        <View
          style={{
            backgroundColor: tema.fundo,
            borderRadius: raio.md,
            borderWidth: 1,
            borderColor: tema.borda,
            padding: espacamento.md,
          }}
        >
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
            Você vai receber assim:
          </Text>
          <Text style={{ color: tema.textoPrimario, fontWeight: '700', marginTop: espacamento.xs }}>
            {previa.titulo}
          </Text>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            {previa.corpo}
          </Text>
        </View>

        <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
          Se você já tiver treinado no dia, o lembrete não chega.
        </Text>
      </View>

      {erro && <Text style={{ color: tema.erro }}>{erro}</Text>}
      {mensagem && <Text style={{ color: tema.sucesso }}>{mensagem}</Text>}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Salvar lembrete"
        disabled={salvando}
        onPress={() => void salvar()}
        style={{
          minHeight: 52,
          borderRadius: raio.md,
          backgroundColor: tema.acaoFundo,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: salvando ? 0.6 : 1,
        }}
      >
        <Text style={{ color: tema.acaoTexto, fontWeight: '700', fontSize: tipografia.tamanho.lg }}>
          {salvando ? 'Salvando…' : config ? 'Atualizar lembrete' : 'Criar lembrete'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
