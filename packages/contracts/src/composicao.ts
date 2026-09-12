import {
  DOBRAS_DO_PROTOCOLO,
  ErroDeCalculo,
  PERCENTUAL_MAX,
  PERCENTUAL_MIN,
  densidadeCorporal,
  siri,
  type Dobra,
  type ProtocoloDobras,
  type ResultadoComposicao,
  type SexoBiologico,
} from './avaliacao';

/**
 * Composição corporal: a conferência que decide se o número pode ser gravado.
 *
 * As equações (Jackson & Pollock e Siri) já moravam aqui, porque a tela de
 * adipometria as executa para mostrar o percentual enquanto o profissional
 * digita. O que estava do lado de fora — dentro da API — era a outra metade:
 * exigir o protocolo completo, recusar o implausível e montar o resultado que
 * de fato entra no histórico.
 *
 * Era a metade que não podia ficar do lado do cliente enquanto a API existia, e
 * que agora precisa estar num lugar que os dois alcancem. Duas cópias de
 * coeficiente clínico divergem em silêncio; duas cópias da CONFERÊNCIA fazem
 * pior — uma delas aceita o que a outra recusa, e o número entra no histórico
 * do jeito errado com cara de medido.
 *
 * A recusa é do banco também: `avaliacao_escreve` diz QUEM pode medir. Isto
 * aqui diz se o que foi medido é um número possível.
 */

export { ErroDeCalculo, densidadeCorporal, siri };

const arredondar = (v: number, casas = 2): number => {
  const fator = 10 ** casas;
  return Math.round(v * fator) / fator;
};

export interface EntradaAdipometria {
  protocolo: ProtocoloDobras;
  sexo: SexoBiologico;
  idade: number;
  pesoKg: number;
  alturaCm?: number;
  dobras: Partial<Record<Dobra, number>>;
}

export function calcularPorDobras(entrada: EntradaAdipometria): ResultadoComposicao {
  const exigidas = DOBRAS_DO_PROTOCOLO[entrada.protocolo][entrada.sexo];

  // Faltando uma dobra, o somatório fica menor e o resultado sai baixo demais.
  // Melhor recusar do que devolver um número plausível e errado.
  const faltando = exigidas.filter((d) => entrada.dobras[d] === undefined);
  if (faltando.length > 0) {
    throw new ErroDeCalculo(`Faltam dobras para este protocolo: ${faltando.join(', ')}.`);
  }

  const somaDobrasMm = exigidas.reduce((soma, d) => soma + (entrada.dobras[d] ?? 0), 0);
  const densidade = densidadeCorporal(
    entrada.protocolo,
    entrada.sexo,
    somaDobrasMm,
    entrada.idade,
  );
  const percentual = siri(densidade);

  // Fora desta faixa o resultado não é fisiologicamente plausível — sinal de
  // dobra digitada errada (vírgula trocada, cm no lugar de mm).
  if (percentual < PERCENTUAL_MIN || percentual > PERCENTUAL_MAX) {
    throw new ErroDeCalculo(
      'O resultado ficou fora da faixa plausível. Confira as dobras — os valores são em milímetros.',
    );
  }

  const massaGordaKg = (entrada.pesoKg * percentual) / 100;

  return {
    percentualGordura: arredondar(percentual, 1),
    massaGordaKg: arredondar(massaGordaKg),
    massaMagraKg: arredondar(entrada.pesoKg - massaGordaKg),
    densidadeCorporal: arredondar(densidade, 4),
    somaDobrasMm: arredondar(somaDobrasMm, 1),
    imc: entrada.alturaCm ? arredondar(entrada.pesoKg / (entrada.alturaCm / 100) ** 2, 1) : undefined,
  };
}

export interface EntradaBioimpedancia {
  pesoKg: number;
  alturaCm?: number;
  percentualGordura: number;
  massaMagraKg?: number;
}

/**
 * A balança já entrega o percentual. O que fazemos é derivar o que ela não
 * informa e manter a mesma forma de saída da adipometria — assim os gráficos
 * não precisam saber de qual método veio o dado.
 */
export function calcularPorBioimpedancia(entrada: EntradaBioimpedancia): ResultadoComposicao {
  const massaGordaKg = (entrada.pesoKg * entrada.percentualGordura) / 100;

  return {
    percentualGordura: arredondar(entrada.percentualGordura, 1),
    massaGordaKg: arredondar(massaGordaKg),
    massaMagraKg: arredondar(entrada.massaMagraKg ?? entrada.pesoKg - massaGordaKg),
    imc: entrada.alturaCm ? arredondar(entrada.pesoKg / (entrada.alturaCm / 100) ** 2, 1) : undefined,
  };
}
