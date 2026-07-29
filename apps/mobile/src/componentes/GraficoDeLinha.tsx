import type { PontoDaSerie } from '@vivio/contracts';
import type { Tema } from '@vivio/ui-native';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

interface Props {
  pontos: PontoDaSerie[];
  unidade: string;
  cor: string;
  tema: Tema;
  altura?: number;
  /** Rótulo acessível — o gráfico é imagem para quem enxerga, texto para quem não. */
  descricao: string;
}

const MARGEM = { topo: 14, base: 22, esquerda: 6, direita: 6 };

/**
 * Gráfico de linha desenhado à mão em SVG.
 *
 * Escolhas de leitura, não de enfeite:
 *  - a escala Y usa o intervalo real dos dados com 10% de folga; começar do zero
 *    achataria a curva e esconderia justamente a variação que interessa;
 *  - só o primeiro e o último rótulo de data aparecem, para não virar ruído;
 *  - tocar num ponto mostra o valor daquele dia.
 */
export function GraficoDeLinha({
  pontos,
  unidade,
  cor,
  tema,
  altura = 170,
  descricao,
}: Props) {
  const [largura, setLargura] = useState(320);
  const [selecionado, setSelecionado] = useState<number | null>(null);

  const geometria = useMemo(() => {
    if (pontos.length === 0) return null;

    const valores = pontos.map((p) => p.valor);
    const minimo = Math.min(...valores);
    const maximo = Math.max(...valores);
    // Série constante viraria divisão por zero — abre uma faixa artificial.
    const folga = maximo === minimo ? Math.max(1, Math.abs(maximo) * 0.05) : (maximo - minimo) * 0.1;
    const baixo = minimo - folga;
    const alto = maximo + folga;

    const larguraUtil = largura - MARGEM.esquerda - MARGEM.direita;
    const alturaUtil = altura - MARGEM.topo - MARGEM.base;

    const coords = pontos.map((p, i) => ({
      x: MARGEM.esquerda + (pontos.length === 1 ? larguraUtil / 2 : (i / (pontos.length - 1)) * larguraUtil),
      y: MARGEM.topo + alturaUtil - ((p.valor - baixo) / (alto - baixo)) * alturaUtil,
      ponto: p,
    }));

    const linha = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');
    const area = `${linha} L${coords[coords.length - 1]!.x},${altura - MARGEM.base} L${coords[0]!.x},${altura - MARGEM.base} Z`;

    return { coords, linha, area, minimo, maximo };
  }, [pontos, largura, altura]);

  if (!geometria || pontos.length === 0) {
    return (
      <Text style={{ color: tema.textoSecundario, fontSize: 13 }}>
        Ainda sem medições suficientes para o gráfico.
      </Text>
    );
  }

  const emFoco = selecionado !== null ? geometria.coords[selecionado] : null;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={descricao}
      onLayout={(e) => setLargura(e.nativeEvent.layout.width)}
    >
      <Svg width="100%" height={altura}>
        <Defs>
          <LinearGradient id="areaDoGrafico" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={cor} stopOpacity={0.22} />
            <Stop offset="1" stopColor={cor} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {/* Linhas de referência do topo e da base da faixa */}
        {[MARGEM.topo, altura - MARGEM.base].map((y) => (
          <Line
            key={y}
            x1={0}
            y1={y}
            x2={largura}
            y2={y}
            stroke={tema.borda}
            strokeWidth={1}
            strokeDasharray="3 5"
          />
        ))}

        <Path d={geometria.area} fill="url(#areaDoGrafico)" />
        <Path
          d={geometria.linha}
          stroke={cor}
          strokeWidth={2.5}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {geometria.coords.map((c, i) => (
          <Circle
            key={c.ponto.data}
            cx={c.x}
            cy={c.y}
            r={selecionado === i ? 6 : 3.5}
            fill={selecionado === i ? cor : tema.superficie}
            stroke={cor}
            strokeWidth={2}
          />
        ))}
      </Svg>

      {/* Alvos de toque grandes por cima do SVG — o ponto de 3px é pequeno demais */}
      <View style={{ flexDirection: 'row', position: 'absolute', top: 0, left: 0, right: 0, height: altura }}>
        {pontos.map((p, i) => (
          <Pressable
            key={p.data}
            accessibilityRole="button"
            accessibilityLabel={`${new Date(`${p.data}T12:00:00`).toLocaleDateString('pt-BR')}: ${p.valor} ${unidade}`}
            onPress={() => setSelecionado(selecionado === i ? null : i)}
            style={{ flex: 1 }}
          />
        ))}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
        <Text style={{ color: tema.textoSecundario, fontSize: 11 }}>
          {new Date(`${pontos[0]!.data}T12:00:00`).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
          })}
        </Text>
        {emFoco && (
          <Text style={{ color: cor, fontSize: 12, fontWeight: '700' }}>
            {emFoco.ponto.valor} {unidade} ·{' '}
            {new Date(`${emFoco.ponto.data}T12:00:00`).toLocaleDateString('pt-BR')}
          </Text>
        )}
        <Text style={{ color: tema.textoSecundario, fontSize: 11 }}>
          {new Date(`${pontos[pontos.length - 1]!.data}T12:00:00`).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
          })}
        </Text>
      </View>
    </View>
  );
}
