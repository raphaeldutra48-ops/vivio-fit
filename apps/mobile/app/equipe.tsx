import {
  EscopoDado,
  FINALIDADE_POR_ESCOPO,
  type ConsentimentoResumo,
  type VinculoResumo,
} from '@vivio/contracts';
import { espacamento, raio, tipografia } from '@vivio/ui-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { sdk } from '../src/sdk';
import { useSessao } from '../src/sessao';

const NOME_DO_PAPEL: Record<string, string> = {
  PERSONAL: 'Personal trainer',
  NUTRICIONISTA: 'Nutricionista',
  MEDICO: 'Médico(a)',
};

const ROTULO_ESCOPO: Record<EscopoDado, string> = {
  TREINO: 'Treino',
  NUTRICAO: 'Alimentação',
  CLINICO: 'Saúde',
  EVOLUCAO: 'Peso, medidas e fotos',
  MENSAGENS: 'Conversa entre profissionais',
};

/** A ordem em que fazem sentido decididos, não a do enum. */
const ESCOPOS: EscopoDado[] = ['TREINO', 'EVOLUCAO', 'NUTRICAO', 'CLINICO', 'MENSAGENS'];

/**
 * Equipe de cuidado e autorizações.
 *
 * A tela que faltava — e sem ela o app inteiro não saía do lugar. O
 * profissional convidava, e o convite não tinha onde chegar: o aluno não podia
 * aceitar nem autorizar nada, então nunca havia vínculo ativo, e sem vínculo
 * não há treino, dieta nem acompanhamento.
 *
 * O consentimento é por escopo e revogável a qualquer momento, porque é isso
 * que a LGPD exige de dado de saúde: autorização específica por finalidade, e
 * não um "aceito tudo" no cadastro. Cada chave aqui é uma decisão separada da
 * pessoa sobre o próprio corpo.
 */
export default function Equipe() {
  const { usuario, tema } = useSessao();

  const [vinculos, setVinculos] = useState<VinculoResumo[] | null>(null);
  const [consentimentos, setConsentimentos] = useState<ConsentimentoResumo[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [v, c] = await Promise.all([
        sdk.vinculos.meusProfissionais(),
        sdk.consentimentos.listar(),
      ]);
      setVinculos(v);
      setConsentimentos(c);
      setErro(null);
    } catch {
      setErro('Não foi possível carregar sua equipe.');
      setVinculos([]);
    }
  }, []);

  useEffect(() => {
    if (usuario) void carregar();
  }, [usuario, carregar]);

  /**
   * Aceitar já libera o treino, e só o treino.
   *
   * Era o passo em que todo mundo travava: a pessoa aceitava o convite, e o
   * profissional continuava sem conseguir montar nada, porque faltava uma
   * autorização que ninguém sabia que existia. Aceitar sem poder treinar não
   * é aceitar coisa nenhuma.
   *
   * Os outros quatro escopos continuam sendo decisão à parte. A LGPD anula
   * autorização genérica para dado de saúde (Art. 11 pede finalidade
   * específica e destacada), e por isso o texto do que está sendo liberado
   * fica no próprio botão — um toque, mas lido.
   */
  async function responder(vinculo: VinculoResumo, aceitar: boolean) {
    setOcupado(vinculo.id);
    try {
      if (!aceitar) {
        await sdk.vinculos.recusar(vinculo.id);
      } else {
        await sdk.vinculos.aceitar(vinculo.id);
        if (!concedido(EscopoDado.TREINO)) {
          // Falhar aqui não desfaz o vínculo: o aceite é o que importa, e a
          // autorização a pessoa consegue dar na própria tela, logo abaixo.
          await sdk.consentimentos
            .conceder({ escopo: EscopoDado.TREINO })
            .catch(() => setErro('Vínculo aceito, mas a autorização de treino falhou. Toque em Treino abaixo.'));
        }
      }
      await carregar();
    } catch {
      setErro('Não foi possível responder ao convite. Tente de novo.');
    } finally {
      setOcupado(null);
    }
  }

  const concedido = (escopo: EscopoDado) =>
    consentimentos.find((c) => c.escopo === escopo && c.revogadoEm === null) ?? null;

  async function alternar(escopo: EscopoDado) {
    const atual = concedido(escopo);
    setOcupado(escopo);
    try {
      if (atual) await sdk.consentimentos.revogar(atual.id);
      else await sdk.consentimentos.conceder({ escopo });
      await carregar();
    } catch {
      setErro('Não foi possível alterar a autorização. Tente de novo.');
    } finally {
      setOcupado(null);
    }
  }

  function pedirParaRevogar(escopo: EscopoDado) {
    /*
      Conceder é um toque; retirar passa por confirmação. Não é para dificultar
      — é porque retirar sem querer faz o plano de treino sumir da tela sem a
      pessoa entender por quê, e o susto é pior que o toque a mais.
    */
    Alert.alert(
      `Parar de compartilhar ${ROTULO_ESCOPO[escopo]}?`,
      'Seus profissionais deixam de ver esses dados na hora. Você pode autorizar de novo quando quiser.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Parar de compartilhar', style: 'destructive', onPress: () => void alternar(escopo) },
      ],
    );
  }

  if (!vinculos) {
    return (
      <View style={{ flex: 1, backgroundColor: tema.fundo, justifyContent: 'center' }}>
        <ActivityIndicator color={tema.acaoFundo} />
      </View>
    );
  }

  const pendentes = vinculos.filter((v) => v.aguardandoMinhaResposta);
  const ativos = vinculos.filter((v) => v.status === 'ATIVO');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tema.fundo }}
      contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.lg }}
    >
      {erro && <Text style={{ color: tema.erro }}>{erro}</Text>}

      {/* Convites primeiro: é o que trava tudo enquanto não for respondido. */}
      {pendentes.length > 0 && (
        <View style={{ gap: espacamento.md }}>
          <Text style={{ color: tema.textoPrimario, fontWeight: '700', fontSize: tipografia.tamanho.lg }}>
            {pendentes.length === 1 ? 'Convite recebido' : 'Convites recebidos'}
          </Text>

          {pendentes.map((v) => (
            <View
              key={v.id}
              style={{
                backgroundColor: tema.superficie,
                borderRadius: raio.lg,
                borderWidth: 2,
                borderColor: tema.acaoFundo,
                padding: espacamento.lg,
                gap: espacamento.md,
              }}
            >
              <View>
                <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>
                  {v.contraparte.nome}
                </Text>
                <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
                  {NOME_DO_PAPEL[v.tipo] ?? v.tipo} quer te acompanhar
                </Text>
              </View>

              {/*
                O texto do que vai ser liberado fica ao lado do botão, e não
                escondido atrás dele. A LGPD exige finalidade específica para
                dado de saúde — um toque só, mas lido.
              */}
              <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
                Ao aceitar, você libera <Text style={{ fontWeight: '700' }}>seus treinos</Text>:{' '}
                {FINALIDADE_POR_ESCOPO[EscopoDado.TREINO].toLowerCase()} As demais autorizações
                ficam abaixo, uma a uma.
              </Text>

              <View style={{ flexDirection: 'row', gap: espacamento.md }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Aceitar ${v.contraparte.nome}`}
                  disabled={ocupado === v.id}
                  onPress={() => void responder(v, true)}
                  style={{
                    flex: 1,
                    minHeight: 52,
                    borderRadius: raio.md,
                    backgroundColor: tema.acaoFundo,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: ocupado === v.id ? 0.5 : 1,
                  }}
                >
                  <Text style={{ color: tema.acaoTexto, fontWeight: '700' }}>
                    Aceitar e liberar treino
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Recusar ${v.contraparte.nome}`}
                  disabled={ocupado === v.id}
                  onPress={() => void responder(v, false)}
                  style={{
                    flex: 1,
                    minHeight: 52,
                    borderRadius: raio.md,
                    borderWidth: 1,
                    borderColor: tema.borda,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: ocupado === v.id ? 0.5 : 1,
                  }}
                >
                  <Text style={{ color: tema.textoPrimario }}>Recusar</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={{ gap: espacamento.md }}>
        <Text style={{ color: tema.textoPrimario, fontWeight: '700', fontSize: tipografia.tamanho.lg }}>
          Quem me acompanha
        </Text>

        {ativos.length === 0 ? (
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
            <Text style={{ color: tema.textoPrimario, fontWeight: '600' }}>
              Ninguém ainda
            </Text>
            <Text style={{ color: tema.textoSecundario }}>
              Peça ao seu personal, nutricionista ou médico para te convidar pelo e-mail{' '}
              <Text style={{ fontWeight: '700' }}>{usuario?.email}</Text>. O convite aparece aqui.
            </Text>
          </View>
        ) : (
          ativos.map((v) => (
            <View
              key={v.id}
              style={{
                backgroundColor: tema.superficie,
                borderRadius: raio.lg,
                borderWidth: 1,
                borderColor: tema.borda,
                padding: espacamento.lg,
              }}
            >
              <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>
                {v.contraparte.nome}
              </Text>
              <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
                {NOME_DO_PAPEL[v.tipo] ?? v.tipo}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={{ gap: espacamento.md }}>
        <View>
          <Text style={{ color: tema.textoPrimario, fontWeight: '700', fontSize: tipografia.tamanho.lg }}>
            O que eu compartilho
          </Text>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            Você decide item por item, e pode mudar quando quiser. Sem autorização, seu profissional
            não vê nem consegue montar nada.
          </Text>
        </View>

        {ESCOPOS.map((escopo) => {
          const ativo = concedido(escopo) !== null;
          return (
            <Pressable
              key={escopo}
              accessibilityRole="switch"
              accessibilityState={{ checked: ativo }}
              accessibilityLabel={`${ROTULO_ESCOPO[escopo]}: ${ativo ? 'compartilhando' : 'não compartilhado'}`}
              disabled={ocupado === escopo}
              onPress={() => (ativo ? pedirParaRevogar(escopo) : void alternar(escopo))}
              style={{
                backgroundColor: tema.superficie,
                borderRadius: raio.lg,
                borderWidth: ativo ? 2 : 1,
                borderColor: ativo ? tema.sucesso : tema.borda,
                padding: espacamento.lg,
                gap: espacamento.xs,
                opacity: ocupado === escopo ? 0.5 : 1,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: espacamento.sm }}>
                <Text style={{ color: tema.textoPrimario, fontWeight: '700', flex: 1 }}>
                  {ROTULO_ESCOPO[escopo]}
                </Text>
                <Text
                  style={{
                    color: ativo ? tema.sucesso : tema.textoSecundario,
                    fontWeight: '700',
                    fontSize: tipografia.tamanho.sm,
                  }}
                >
                  {ativo ? '✓ Compartilhando' : 'Tocar para autorizar'}
                </Text>
              </View>
              {/*
                O texto da finalidade vem do contrato, o mesmo que fica gravado
                no registro do consentimento. Se a tela escrevesse outro, a
                pessoa teria autorizado uma coisa e o sistema guardaria outra.
              */}
              <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
                {FINALIDADE_POR_ESCOPO[escopo]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
