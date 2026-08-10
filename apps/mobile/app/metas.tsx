import {
  ROTULO_TIPO_META,
  UNIDADE_TIPO_META,
  type MetaResumo,
} from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { espacamento, raio, tipografia } from '@vivio/ui-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { sdk } from '../src/sdk';
import { useSessao } from '../src/sessao';

function porExtenso(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  if (!ano || !mes || !dia) return iso;
  return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
  });
}

const numero = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/**
 * Metas do aluno — só leitura.
 *
 * A regra vem da API e é intencional: **o aluno lê, o profissional escreve.**
 * Meta é combinação de acompanhamento; se o próprio aluno pudesse criar e
 * marcar como cumprida, viraria lista de desejos e o profissional deixaria de
 * saber o que foi combinado.
 *
 * Como isso pode parecer uma tela quebrada — não há botão de adicionar —, ela
 * diz de quem vêm as metas em vez de deixar a pessoa procurando o "+".
 */
export default function Metas() {
  const { usuario, tema } = useSessao();
  const [metas, setMetas] = useState<MetaResumo[] | null>(null);
  const [semAutorizacao, setSemAutorizacao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!usuario) return;
    let ativo = true;
    sdk.metas
      .listar(usuario.id)
      .then((m) => ativo && setMetas(m))
      .catch((e) => {
        if (!ativo) return;
        /*
          403 por consentimento não é falha: é a consequência de o próprio
          aluno não ter liberado a evolução. Mostrar "erro ao carregar" faria
          ele procurar problema no app.
        */
        if (e instanceof ErroApi && e.codigo === 'CONSENTIMENTO_AUSENTE') {
          setSemAutorizacao(true);
          setMetas([]);
          return;
        }
        setErro('Não foi possível carregar suas metas.');
      });
    return () => {
      ativo = false;
    };
  }, [usuario]);

  const Cartao = ({ children }: { children: React.ReactNode }) => (
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
      {children}
    </View>
  );

  if (erro) {
    return (
      <View style={{ flex: 1, backgroundColor: tema.fundo, padding: espacamento.lg }}>
        <Text style={{ color: tema.erro }}>{erro}</Text>
      </View>
    );
  }

  if (!metas) {
    return (
      <View style={{ flex: 1, backgroundColor: tema.fundo, justifyContent: 'center' }}>
        <ActivityIndicator color={tema.acaoFundo} />
      </View>
    );
  }

  if (semAutorizacao) {
    return (
      <View style={{ flex: 1, backgroundColor: tema.fundo, padding: espacamento.lg }}>
        <Cartao>
          <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>
            Evolução não compartilhada
          </Text>
          <Text style={{ color: tema.textoSecundario }}>
            As metas são acompanhadas a partir das suas medidas e treinos. Para o seu profissional
            definir metas, autorize o compartilhamento de evolução no seu perfil.
          </Text>
        </Cartao>
      </View>
    );
  }

  if (metas.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: tema.fundo, padding: espacamento.lg }}>
        <Cartao>
          <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>Nenhuma meta ainda</Text>
          <Text style={{ color: tema.textoSecundario }}>
            As metas são combinadas com o seu personal ou nutricionista e aparecem aqui
            automaticamente. O progresso é calculado sozinho, a partir das medidas e dos treinos
            que você registra.
          </Text>
        </Cartao>
      </View>
    );
  }

  const abertas = metas.filter((m) => !m.atingida);
  const cumpridas = metas.filter((m) => m.atingida);

  const Barra = ({ progresso }: { progresso: number | null }) => {
    /*
      `null` não vira barra vazia. Barra em zero parece "não saiu do lugar", e
      o que houve foi ausência de medição — são coisas diferentes e a tela
      precisa dizer qual é.
    */
    if (progresso === null) {
      return (
        <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
          Ainda sem medição para acompanhar esta meta.
        </Text>
      );
    }

    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacamento.sm }}>
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ now: progresso, min: 0, max: 100 }}
          style={{
            flex: 1,
            height: 8,
            borderRadius: 4,
            backgroundColor: tema.borda,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${progresso}%`,
              height: '100%',
              borderRadius: 4,
              backgroundColor: progresso >= 100 ? tema.sucesso : tema.acaoFundo,
            }}
          />
        </View>
        <Text
          style={{
            color: tema.textoPrimario,
            fontWeight: '700',
            fontVariant: ['tabular-nums'],
            minWidth: 44,
            textAlign: 'right',
          }}
        >
          {progresso}%
        </Text>
      </View>
    );
  };

  const CartaoDaMeta = ({ meta }: { meta: MetaResumo }) => {
    const unidade = UNIDADE_TIPO_META[meta.tipo];
    return (
      <View
        style={{
          backgroundColor: tema.superficie,
          borderRadius: raio.lg,
          borderWidth: meta.atingida ? 2 : 1,
          borderColor: meta.atingida ? tema.sucesso : meta.atrasada ? tema.alerta : tema.borda,
          padding: espacamento.lg,
          gap: espacamento.sm,
        }}
      >
        <View>
          <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>{meta.titulo}</Text>
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
            {ROTULO_TIPO_META[meta.tipo]}
            {meta.exercicioNome ? ` · ${meta.exercicioNome}` : ''}
            {meta.alvo !== null ? ` · alvo ${numero(meta.alvo)} ${unidade}` : ''}
          </Text>
        </View>

        {meta.atingida ? (
          <Text style={{ color: tema.sucesso, fontWeight: '700' }}>✓ Meta atingida</Text>
        ) : (
          <Barra progresso={meta.progresso} />
        )}

        {/*
          De onde saiu para onde está. Só o percentual não conta a história —
          "começou em 80, agora 78" é o que a pessoa reconhece como esforço.
        */}
        {!meta.atingida && (meta.valorInicial !== null || meta.valorAtual !== null) && (
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            {meta.valorInicial !== null && `começou em ${numero(meta.valorInicial)} ${unidade}`}
            {meta.valorInicial !== null && meta.valorAtual !== null && ' · '}
            {meta.valorAtual !== null && `agora ${numero(meta.valorAtual)} ${unidade}`}
          </Text>
        )}

        {meta.prazo && !meta.atingida && (
          <Text
            style={{
              color: meta.atrasada ? tema.alerta : tema.textoSecundario,
              fontSize: tipografia.tamanho.sm,
              fontWeight: meta.atrasada ? '700' : '400',
            }}
          >
            {meta.atrasada ? 'Prazo vencido em ' : 'Prazo: '}
            {porExtenso(meta.prazo)}
          </Text>
        )}

        {meta.observacao && (
          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
            {meta.observacao}
          </Text>
        )}
      </View>
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tema.fundo }}
      contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.md }}
    >
      {abertas.map((meta) => (
        <CartaoDaMeta key={meta.id} meta={meta} />
      ))}

      {cumpridas.length > 0 && (
        <>
          {/*
            As cumpridas ficam, e embaixo. Sumir com elas apagaria a única
            prova de que o acompanhamento deu certo alguma vez — mas no topo
            elas empurrariam para baixo o que ainda precisa de esforço.
          */}
          <Text
            style={{
              color: tema.textoSecundario,
              fontSize: tipografia.tamanho.sm,
              marginTop: espacamento.md,
            }}
          >
            Já conquistadas
          </Text>
          {cumpridas.map((meta) => (
            <CartaoDaMeta key={meta.id} meta={meta} />
          ))}
        </>
      )}

      <Text
        style={{
          color: tema.textoSecundario,
          fontSize: tipografia.tamanho.xs,
          marginTop: espacamento.md,
        }}
      >
        As metas são definidas pelo seu profissional, e o progresso é calculado sozinho a partir
        das suas medidas e treinos — você não precisa marcar nada.
      </Text>
    </ScrollView>
  );
}
