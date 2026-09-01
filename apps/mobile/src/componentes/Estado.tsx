import { alvoToqueMin, espacamento, raio, tipografia } from '@vivio/ui-native';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSessao } from '../sessao';

/**
 * Os dois estados que faltavam nas abas: carregando e falhou.
 *
 * Antes elas tinham um só. `.catch(() => undefined)` engolia o erro e a lista
 * ficava vazia — o mesmo vazio de quem nunca treinou. Na prática, o aluno sem
 * sinal abria "Evolução" e lia **"0 treinos · 0 séries · 0 kg"** com a frase
 * "Seus treinos aparecem aqui depois que você registrar o primeiro", tendo
 * cinquenta treinos gravados no servidor.
 *
 * Não é feiura, é informação falsa: quem lê aquilo conclui que perdeu o
 * histórico. Vazio, erro e espera são três coisas diferentes e precisam de três
 * caras diferentes.
 */

export function Carregando({ oQue }: { oQue?: string }) {
  const { tema } = useSessao();
  return (
    <View style={{ paddingVertical: espacamento.xl, gap: espacamento.sm, alignItems: 'center' }}>
      <ActivityIndicator color={tema.acaoFundo} />
      {oQue && (
        <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
          {oQue}
        </Text>
      )}
    </View>
  );
}

/**
 * Falha de carregamento, com saída.
 *
 * O botão de tentar de novo não é enfeite: a causa quase sempre é rede
 * intermitente na academia, e um toque resolve. Sem ele, a única saída visível
 * é fechar o app.
 */
export function FalhouAoCarregar({
  mensagem,
  aoTentarDeNovo,
}: {
  mensagem?: string;
  aoTentarDeNovo?: () => void;
}) {
  const { tema } = useSessao();
  return (
    <View
      style={{
        backgroundColor: tema.superficie,
        borderRadius: raio.lg,
        borderWidth: 1,
        borderColor: tema.borda,
        padding: espacamento.lg,
        gap: espacamento.sm,
      }}
    >
      <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>
        Não foi possível carregar
      </Text>
      <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
        {mensagem ?? 'Verifique sua conexão. Seus dados continuam salvos no servidor.'}
      </Text>
      {aoTentarDeNovo && (
        <Pressable
          accessibilityRole="button"
          onPress={aoTentarDeNovo}
          style={{
            minHeight: alvoToqueMin,
            borderRadius: raio.md,
            backgroundColor: tema.acaoFundo,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: espacamento.xs,
          }}
        >
          <Text style={{ color: tema.acaoTexto, fontWeight: '700' }}>Tentar de novo</Text>
        </Pressable>
      )}
    </View>
  );
}
