import { marca, type Tema } from '@vivio/ui-native';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

const TRACADO = 'M 60 40 L 90 120 L 108 75 L 126 165 L 144 100 L 160 240 L 260 40';

/**
 * O símbolo da marca: um "V" que também é traçado de progressão.
 *
 * `id` precisa ser único por instância — dois gradientes com o mesmo id na
 * mesma tela fazem o segundo herdar o primeiro.
 */
export function Simbolo({
  tamanho = 32,
  id = 'vivio',
  monocromatico,
}: {
  tamanho?: number;
  id?: string;
  monocromatico?: string;
}) {
  const idGradiente = `grad-${id}`;
  const traco = monocromatico ?? `url(#${idGradiente})`;
  const pontos = monocromatico ?? marca.acento;

  // viewBox recortado no desenho real: no quadrado original o traçado ocupava
  // 71% da largura e o símbolo parecia pequeno ao lado do texto.
  return (
    <Svg width={tamanho} height={tamanho} viewBox="41 32 258 258">
      {!monocromatico && (
        <Defs>
          <LinearGradient id={idGradiente} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={marca.gradienteInicio} />
            <Stop offset="100%" stopColor={marca.gradienteFim} />
          </LinearGradient>
        </Defs>
      )}
      <Path
        d={TRACADO}
        fill="none"
        stroke={traco}
        strokeWidth={28}
        strokeLinecap="round"
        strokeLinejoin="round"
        translateX={10}
        translateY={6}
      />
      <Circle cx={118} cy={81} r={12} fill={pontos} />
      <Circle cx={170} cy={268} r={22} fill={pontos} />
    </Svg>
  );
}

/**
 * Símbolo + nome. O nome usa a cor do tema para continuar legível no escuro;
 * o símbolo mantém as cores da marca em qualquer tema.
 */
export function Marca({
  tamanho = 32,
  id = 'marca',
  tema,
}: {
  tamanho?: number;
  id?: string;
  tema: Tema;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tamanho * 0.28 }}>
      <Simbolo tamanho={tamanho} id={id} />
      {/* `marcaTexto` e `marcaAcento` e não as cores puras da logo: elas
          reprovam em contraste sobre fundo claro (ver paresDeContraste). */}
      <Text style={{ fontSize: tamanho * 0.82, fontWeight: '800', color: tema.textoPrimario }}>
        Vív<Text style={{ color: tema.marcaAcento }}>i</Text>o
        <Text style={{ fontWeight: '500', color: tema.marcaTexto }}> Fit</Text>
      </Text>
    </View>
  );
}
