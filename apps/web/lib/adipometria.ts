import {
  DOBRAS_DO_PROTOCOLO,
  PERCENTUAL_MAX,
  PERCENTUAL_MIN,
  ROTULO_DOBRA,
  densidadeCorporal,
  faixaDeGordura,
  siri,
  type AvaliacaoAdipometriaInput,
  type Dobra,
  type ProtocoloDobras,
  type SexoBiologico,
} from '@vivio/contracts';
import {
  arredondar,
  erroVisivel,
  numeroDoCampo,
  problemaDeFaixa,
  problemaDeFaixaOpcional,
} from './campos';

export { erroVisivel, numeroDoCampo };

/**
 * Leitura dos campos, validação e prévia da adipometria.
 *
 * Fora do componente pela razão de sempre — a conversão de texto para número
 * erra em silêncio — e por uma razão a mais, que só existe nesta tela: aqui o
 * número é clínico. Um campo mal lido não vira erro, vira um percentual de
 * gordura plausível e errado, escrito na avaliação de um paciente.
 *
 * O caso concreto que isto corrige: a prévia somava as dobras com
 * `Number(texto) || 0` e calculava a partir do que houvesse. Com duas de três
 * dobras preenchidas, a soma sai menor, a densidade sai maior e a tela mostra
 * um percentual BAIXO — que parece razoável e não é. O servidor sempre recusou
 * esse caso (`calcularPorDobras` exige o protocolo completo); a tela é que
 * mostrava mesmo assim.
 *
 * As equações não estão aqui: vêm de `@vivio/contracts`, as mesmas que a API
 * executa.
 */

/** Campos de texto da tela, como o usuário digitou. */
export interface EntradaNaTela {
  protocolo: ProtocoloDobras;
  sexo: SexoBiologico;
  idade: string;
  peso: string;
  altura: string;
  dobras: Record<string, string>;
}

export interface PreviaComposicao {
  somaMm: number;
  densidade: number;
  percentualGordura: number;
  faixa: string;
  /** Dependem do peso; ficam nulas enquanto ele não estiver válido. */
  massaGordaKg: number | null;
  massaMagraKg: number | null;
}

/** Espelham `avaliacaoAdipometriaSchema` em `@vivio/contracts`. */
const LIMITE = {
  dobra: { min: 1, max: 100 },
  idade: { min: 7, max: 100 },
  peso: { min: 20, max: 400 },
  altura: { min: 80, max: 260 },
} as const;

/** Mensagem para o campo da dobra, ou `null` se está boa. */
export function problemaDaDobra(texto: string | undefined): string | null {
  return problemaDeFaixa(texto, LIMITE.dobra, 'mm');
}

export function problemaDaIdade(texto: string): string | null {
  // Mensagens próprias: "preencha a idade" e "anos" dizem mais que o genérico.
  const n = numeroDoCampo(texto);
  if (n === null) return 'preencha a idade';
  if (!Number.isInteger(n)) return 'use anos inteiros';
  if (n < LIMITE.idade.min || n > LIMITE.idade.max) {
    return `entre ${LIMITE.idade.min} e ${LIMITE.idade.max} anos`;
  }
  return null;
}

export function problemaDoPeso(texto: string): string | null {
  return problemaDeFaixa(texto, LIMITE.peso, 'kg');
}

/** A altura é opcional: em branco não é problema. */
export function problemaDaAltura(texto: string): string | null {
  return problemaDeFaixaOpcional(texto, LIMITE.altura, 'cm');
}

/** Tudo que impede salvar, em texto para a tela. Vazio significa que dá. */
export function problemasDaAvaliacao(alunoId: string, entrada: EntradaNaTela): string[] {
  const problemas: string[] = [];

  if (alunoId === '') problemas.push('Escolha o aluno.');

  const idade = problemaDaIdade(entrada.idade);
  if (idade) problemas.push(`Idade (anos): ${idade}.`);

  const peso = problemaDoPeso(entrada.peso);
  if (peso) problemas.push(`Peso (kg): ${peso}.`);

  const altura = problemaDaAltura(entrada.altura);
  if (altura) problemas.push(`Altura (cm): ${altura}.`);

  for (const d of DOBRAS_DO_PROTOCOLO[entrada.protocolo][entrada.sexo]) {
    const problema = problemaDaDobra(entrada.dobras[d]);
    if (problema) problemas.push(`${ROTULO_DOBRA[d]} (mm): ${problema}.`);
  }

  return problemas;
}

export function podeSalvarAvaliacao(alunoId: string, entrada: EntradaNaTela): boolean {
  return problemasDaAvaliacao(alunoId, entrada).length === 0;
}

/**
 * Prévia do resultado, ou `null` quando ainda não dá para calcular.
 *
 * Exige o protocolo INTEIRO e a idade válida antes de devolver qualquer
 * número — é a mesma recusa que `calcularPorDobras` faz no servidor. Meio
 * protocolo produz um percentual baixo demais que parece razoável, e é
 * exatamente esse número que não pode aparecer na tela.
 */
export function previaDaAvaliacao(entrada: EntradaNaTela): PreviaComposicao | null {
  if (problemaDaIdade(entrada.idade)) return null;

  const exigidas = DOBRAS_DO_PROTOCOLO[entrada.protocolo][entrada.sexo];
  if (exigidas.some((d) => problemaDaDobra(entrada.dobras[d]))) return null;

  const somaMm = exigidas.reduce((soma, d) => soma + numeroDoCampo(entrada.dobras[d])!, 0);
  const idade = numeroDoCampo(entrada.idade)!;

  const densidade = densidadeCorporal(entrada.protocolo, entrada.sexo, somaMm, idade);
  const percentual = siri(densidade);

  // Mesma faixa de plausibilidade do servidor: fora dela é dobra digitada
  // errada (cm no lugar de mm), e mostrar o número seria pior que não mostrar.
  if (percentual < PERCENTUAL_MIN || percentual > PERCENTUAL_MAX) return null;

  const percentualGordura = arredondar(percentual, 1);
  const pesoKg = problemaDoPeso(entrada.peso) ? null : numeroDoCampo(entrada.peso);
  const massaGordaKg = pesoKg === null ? null : arredondar((pesoKg * percentual) / 100);

  return {
    somaMm: arredondar(somaMm, 1),
    densidade: arredondar(densidade, 4),
    percentualGordura,
    faixa: faixaDeGordura(percentualGordura, entrada.sexo),
    massaGordaKg,
    massaMagraKg: massaGordaKg === null || pesoKg === null ? null : arredondar(pesoKg - massaGordaKg),
  };
}

/** Só faz sentido com `problemasDaAvaliacao` vazio. */
export function corpoDaAvaliacao(entrada: EntradaNaTela, data: Date): AvaliacaoAdipometriaInput {
  const exigidas = DOBRAS_DO_PROTOCOLO[entrada.protocolo][entrada.sexo];
  const altura = numeroDoCampo(entrada.altura);

  return {
    metodo: 'ADIPOMETRIA',
    data,
    protocolo: entrada.protocolo,
    sexo: entrada.sexo,
    idade: numeroDoCampo(entrada.idade) ?? 0,
    pesoKg: numeroDoCampo(entrada.peso) ?? 0,
    // `?? undefined` e não `?? 0`: a altura é opcional, e um zero aqui seria
    // recusado pelo `min(80)` como se alguém tivesse digitado errado.
    alturaCm: altura ?? undefined,
    dobras: Object.fromEntries(
      exigidas.map((d) => [d, numeroDoCampo(entrada.dobras[d]) ?? 0]),
    ) as Record<Dobra, number>,
  };
}
