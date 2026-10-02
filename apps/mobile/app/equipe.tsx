import {
  DOCUMENTOS_LEGAIS,
  EscopoDado,
  FINALIDADE_POR_ESCOPO,
  type ConsentimentoResumo,
  type VinculoResumo,
} from '@vivio/contracts';
import { espacamento, raio, tipografia } from '@vivio/ui-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { FalhouAoCarregar } from '../src/componentes/Estado';
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
  LEITURA_AUTOMATICA: 'Leitura automática de documentos',
};

/** A ordem em que fazem sentido decididos, não a do enum. */
const ESCOPOS: EscopoDado[] = [
  'TREINO',
  'EVOLUCAO',
  'NUTRICAO',
  'CLINICO',
  'MENSAGENS',
  // Por último de propósito: é a única que manda dado para FORA do app, e vem
  // depois das que só decidem quem, aqui dentro, vê o quê.
  'LEITURA_AUTOMATICA',
];

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
  /*
    Separado do `erro` porque as consequências são opostas.

    `erro` também cobre a falha de um TOQUE (aceitar, autorizar), e aí a lista
    tem de continuar na tela. Falhar ao CARREGAR é outra coisa: com `vinculos`
    em `[]` e `consentimentos` em `[]`, a tela afirmava duas mentiras ao mesmo
    tempo — "Ninguém ainda", para quem tem profissional, e todas as chaves de
    autorização desligadas, para quem autorizou tudo. A segunda é a pior: a
    pessoa reautoriza o que já estava autorizado, e o registro de consentimento
    — que é documento de LGPD — ganha uma linha que não corresponde a decisão
    nenhuma.
  */
  const [falhouAoCarregar, setFalhouAoCarregar] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [v, c] = await Promise.all([
        sdk.vinculos.meusProfissionais(),
        sdk.consentimentos.listar(),
      ]);
      setVinculos(v);
      setConsentimentos(c);
      setErro(null);
      setFalhouAoCarregar(false);
    } catch {
      setFalhouAoCarregar(true);
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

  /**
   * Recusar pergunta antes; aceitar não.
   *
   * Os dois botões do convite têm o mesmo tamanho e ficam lado a lado — e o da
   * direita apaga o convite sem volta. Quem errou o toque precisa pedir ao
   * profissional que convide de novo, e quem acabou de instalar o app não sabe
   * que é isso que falta: fica com a tela inicial dizendo que não há
   * profissional nenhum. É o mesmo raciocínio de `pedirParaRevogar` — a direção
   * que desfaz é a que confirma.
   */
  function pedirParaRecusar(vinculo: VinculoResumo) {
    Alert.alert(
      `Recusar ${vinculo.contraparte.nome}?`,
      'O convite é apagado. Para voltar atrás, essa pessoa precisa te convidar de novo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Recusar',
          style: 'destructive',
          onPress: () => void responder(vinculo, false),
        },
      ],
    );
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

  if (falhouAoCarregar) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: tema.fundo }}
        contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.lg }}
      >
        <FalhouAoCarregar
          mensagem="Não deu para carregar sua equipe e suas autorizações. Nada mudou: o que você já autorizou continua valendo."
          aoTentarDeNovo={() => void carregar()}
        />
      </ScrollView>
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
                  onPress={() => pedirParaRecusar(v)}
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

      {/*
        Os documentos ficam ao alcance NESTA tela, e não escondidos num menu: é
        aqui que a pessoa decide o que compartilhar, e é aqui que ela pode querer
        saber para onde o dado vai. Abrem no navegador, servidos pelo site.
      */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: espacamento.lg, paddingVertical: espacamento.lg }}>
        {(['termos', 'privacidade'] as const).map((qual) => (
          <Pressable
            key={qual}
            accessibilityRole="link"
            accessibilityLabel={qual === 'termos' ? 'Termos de uso' : 'Política de privacidade'}
            onPress={() => void Linking.openURL(DOCUMENTOS_LEGAIS[qual])}
          >
            <Text
              style={{
                color: tema.textoSecundario,
                fontSize: tipografia.tamanho.sm,
                textDecorationLine: 'underline',
              }}
            >
              {qual === 'termos' ? 'Termos de uso' : 'Política de privacidade'}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
