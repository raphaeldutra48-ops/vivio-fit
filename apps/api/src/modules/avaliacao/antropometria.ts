import {
  DOBRAS_DO_PROTOCOLO,
  ProtocoloDobras,
  type Dobra,
  type ResultadoComposicao,
  type SexoBiologico,
} from '@vivio/contracts';

/**
 * Cálculo de composição corporal por dobras cutâneas.
 *
 * Fica isolado de propósito: é a única parte do app onde um erro de fórmula
 * vira um número clínico errado na tela do paciente. Sem banco, sem HTTP —
 * entrada e saída puras, testáveis diretamente.
 *
 * Caminho: somatório das dobras -> densidade corporal (Jackson & Pollock) ->
 * percentual de gordura (Siri).
 *
 * São equações de ESTIMATIVA de campo, validadas para população adulta não
 * atleta. Não substituem DEXA nem diagnóstico.
 */

export class ErroDeCalculo extends Error {}

/** Siri (1961): converte densidade corporal em percentual de gordura. */
export function siri(densidade: number): number {
  if (densidade <= 0) throw new ErroDeCalculo('Densidade corporal inválida.');
  return 495 / densidade - 450;
}

/**
 * Jackson & Pollock — densidade corporal a partir do somatório de dobras (mm)
 * e da idade (anos). Cada combinação protocolo × sexo tem coeficientes próprios.
 */
export function densidadeCorporal(
  protocolo: ProtocoloDobras,
  sexo: SexoBiologico,
  somaMm: number,
  idade: number,
): number {
  const s = somaMm;
  const s2 = s * s;

  if (protocolo === ProtocoloDobras.POLLOCK_3) {
    // Jackson & Pollock (1978) homens: peitoral, abdominal, coxa
    if (sexo === 'M') return 1.10938 - 0.0008267 * s + 0.0000016 * s2 - 0.0002574 * idade;
    // Jackson, Pollock & Ward (1980) mulheres: tríceps, supra-ilíaca, coxa
    return 1.0994921 - 0.0009929 * s + 0.0000023 * s2 - 0.0001392 * idade;
  }

  // Pollock 7 dobras
  if (sexo === 'M') return 1.112 - 0.00043499 * s + 0.00000055 * s2 - 0.00028826 * idade;
  return 1.097 - 0.00046971 * s + 0.00000056 * s2 - 0.00012828 * idade;
}

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
  if (percentual < 1 || percentual > 70) {
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
