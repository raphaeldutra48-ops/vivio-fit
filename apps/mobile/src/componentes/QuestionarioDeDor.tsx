import {
  MomentoDaDor,
  ROTULO_MOMENTO_DOR,
  ROTULO_TIPO_DOR,
  TipoDeDor,
} from '@vivio/contracts';
import type { Tema } from '@vivio/ui-native';
import { alvoToqueMin, espacamento, raio, tipografia } from '@vivio/ui-native';
import { Pressable, Text, TextInput, View } from 'react-native';

export interface RespostaDeDor {
  local: string;
  tipo: TipoDeDor | null;
  momento: MomentoDaDor | null;
  exercicioId: string | null;
  relato: string;
}

export const DOR_VAZIA: RespostaDeDor = {
  local: '',
  tipo: null,
  momento: null,
  exercicioId: null,
  relato: '',
};

/**
 * O que se pergunta a quem acabou de sentir dor.
 *
 * Nada é obrigatório, e isso é decisão e não descuido: quem está com dor não
 * pode ser obrigado a classificar nada para conseguir avisar. "Doeu o ombro" e
 * mais nada já é melhor do que um formulário abandonado no meio.
 *
 * As perguntas existem porque "sentiu dor" sozinho não muda conduta nenhuma —
 * o personal precisa saber **onde**, **que tipo** e **em qual movimento** para
 * decidir se troca o exercício, reduz a carga ou manda procurar um médico. E
 * ele está online, não do lado, então não tem como perguntar olhando.
 */
export function QuestionarioDeDor({
  itens,
  valor,
  aoMudar,
  tema,
}: {
  itens: { id: string; nome: string }[];
  valor: RespostaDeDor;
  aoMudar: (v: RespostaDeDor) => void;
  tema: Tema;
}) {
  const campo = {
    minHeight: alvoToqueMin,
    borderWidth: 1,
    borderColor: tema.borda,
    borderRadius: raio.md,
    paddingHorizontal: espacamento.md,
    color: tema.textoPrimario,
    backgroundColor: tema.fundo,
  };

  const Pergunta = ({ children }: { children: React.ReactNode }) => (
    <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>{children}</Text>
  );

  const Opcao = ({
    escolhida,
    titulo,
    ajuda,
    aoTocar,
    rotuloAcessivel,
  }: {
    escolhida: boolean;
    titulo: string;
    ajuda?: string;
    aoTocar: () => void;
    rotuloAcessivel: string;
  }) => (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: escolhida }}
      accessibilityLabel={rotuloAcessivel}
      onPress={aoTocar}
      style={{
        minHeight: alvoToqueMin,
        paddingHorizontal: espacamento.md,
        borderRadius: raio.md,
        borderWidth: escolhida ? 2 : 1,
        borderColor: escolhida ? tema.erro : tema.borda,
        flexDirection: 'row',
        alignItems: 'center',
        gap: espacamento.sm,
      }}
    >
      <Text style={{ color: tema.textoPrimario, fontWeight: escolhida ? '700' : '400' }}>
        {titulo}
      </Text>
      {ajuda && (
        <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs, flex: 1 }}>
          {ajuda}
        </Text>
      )}
    </Pressable>
  );

  return (
    <View
      style={{
        gap: espacamento.md,
        borderLeftWidth: 3,
        borderLeftColor: tema.erro,
        paddingLeft: espacamento.md,
      }}
    >
      <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>
        Me conta um pouco mais
      </Text>
      <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
        Nada aqui é obrigatório. Cada resposta ajuda seu personal a decidir o que mudar antes do
        próximo treino.
      </Text>

      <View style={{ gap: espacamento.xs }}>
        <Pergunta>Onde doeu?</Pergunta>
        <TextInput
          accessibilityLabel="Onde doeu"
          placeholder="ombro direito, lombar, joelho esquerdo…"
          placeholderTextColor={tema.textoSecundario}
          value={valor.local}
          onChangeText={(local) => aoMudar({ ...valor, local })}
          maxLength={80}
          style={campo}
        />
      </View>

      <View style={{ gap: espacamento.xs }}>
        <Pergunta>Que tipo de dor?</Pergunta>
        {(Object.keys(ROTULO_TIPO_DOR) as TipoDeDor[]).map((t) => (
          <Opcao
            key={t}
            escolhida={valor.tipo === t}
            titulo={ROTULO_TIPO_DOR[t].titulo}
            ajuda={ROTULO_TIPO_DOR[t].ajuda}
            rotuloAcessivel={`${ROTULO_TIPO_DOR[t].titulo} — ${ROTULO_TIPO_DOR[t].ajuda}`}
            // Tocar de novo desmarca: a pessoa pode ter errado, e não há como
            // voltar para "não respondi" se a escolha for definitiva.
            aoTocar={() => aoMudar({ ...valor, tipo: valor.tipo === t ? null : t })}
          />
        ))}
      </View>

      <View style={{ gap: espacamento.xs }}>
        <Pergunta>Quando?</Pergunta>
        {(Object.keys(ROTULO_MOMENTO_DOR) as MomentoDaDor[]).map((m) => (
          <Opcao
            key={m}
            escolhida={valor.momento === m}
            titulo={ROTULO_MOMENTO_DOR[m]}
            rotuloAcessivel={ROTULO_MOMENTO_DOR[m]}
            aoTocar={() => aoMudar({ ...valor, momento: valor.momento === m ? null : m })}
          />
        ))}
      </View>

      <View style={{ gap: espacamento.xs }}>
        <Pergunta>Em qual exercício?</Pergunta>
        {itens.map((item) => (
          <Opcao
            key={item.id}
            escolhida={valor.exercicioId === item.id}
            titulo={item.nome}
            rotuloAcessivel={`Doeu em ${item.nome}`}
            aoTocar={() =>
              aoMudar({ ...valor, exercicioId: valor.exercicioId === item.id ? null : item.id })
            }
          />
        ))}
        {/*
          "Não sei dizer" é uma resposta, e precisa existir: sem ela a pessoa
          aponta um exercício qualquer para o formulário parar de perguntar, e
          o personal troca o movimento errado.
        */}
        <Opcao
          escolhida={valor.exercicioId === null && valor.tipo !== null}
          titulo="Não sei dizer"
          rotuloAcessivel="Não sei dizer em qual exercício"
          aoTocar={() => aoMudar({ ...valor, exercicioId: null })}
        />
      </View>

      <View style={{ gap: espacamento.xs }}>
        <Pergunta>Quer explicar o que aconteceu?</Pergunta>
        <TextInput
          accessibilityLabel="Explique o que aconteceu"
          placeholder="senti quando estava descendo o peso, achei que forcei demais…"
          placeholderTextColor={tema.textoSecundario}
          value={valor.relato}
          onChangeText={(relato) => aoMudar({ ...valor, relato })}
          maxLength={1000}
          multiline
          style={{ ...campo, minHeight: 90, paddingTop: espacamento.sm, textAlignVertical: 'top' }}
        />
      </View>
    </View>
  );
}
