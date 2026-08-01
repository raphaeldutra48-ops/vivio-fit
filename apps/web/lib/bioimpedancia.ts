import { faixaDeGordura, type AvaliacaoBioimpedanciaInput, type SexoBiologico } from '@vivio/contracts';
import { arredondar, numeroDoCampo, problemaDeFaixa, problemaDeFaixaOpcional } from './campos';

/**
 * Leitura dos campos, validação e prévia da bioimpedância.
 *
 * A tela é uma transcrição: o profissional copia o que a balança mostrou. Isso
 * a torna a mais fácil de errar por digitação e a que menos perdoa — nenhum
 * dos oito números tem de onde ser conferido, e o schema tem faixa para todos.
 *
 * O que existia antes: `Number(valores[chave]?.replace(',','.')) || 0` para
 * tudo, e um `completo` que só olhava `peso > 0 && gordura > 0`. As outras seis
 * faixas não eram conferidas em lugar nenhum, e o `opcional()` devolvia esse
 * mesmo `|| 0` — então campo opcional com lixo digitado virava `0` e era
 * recusado pelo `.min()` do schema como se alguém tivesse errado de propósito.
 */

/** Campos que as balanças costumam reportar. Só peso e gordura são exigidos. */
export interface CampoDaBalanca {
  chave: keyof ValoresDaBalanca;
  rotulo: string;
  unidade: string;
  faixa: { min: number; max: number };
  obrigatorio?: boolean;
  inteiro?: boolean;
}

export interface ValoresDaBalanca {
  pesoKg?: string;
  percentualGordura?: string;
  massaMagraKg?: string;
  alturaCm?: string;
  aguaCorporalPercentual?: string;
  massaOsseaKg?: string;
  taxaMetabolicaBasal?: string;
  gorduraVisceral?: string;
}

/**
 * Faixas espelhadas de `avaliacaoBioimpedanciaSchema`. A tabela é a mesma que
 * desenha o formulário — assim campo novo sem faixa não passa despercebido.
 */
export const CAMPOS: CampoDaBalanca[] = [
  { chave: 'pesoKg', rotulo: 'Peso', unidade: 'kg', faixa: { min: 20, max: 400 }, obrigatorio: true },
  {
    chave: 'percentualGordura',
    rotulo: 'Gordura',
    unidade: '%',
    faixa: { min: 1, max: 70 },
    obrigatorio: true,
  },
  { chave: 'massaMagraKg', rotulo: 'Massa magra', unidade: 'kg', faixa: { min: 10, max: 200 } },
  { chave: 'alturaCm', rotulo: 'Altura', unidade: 'cm', faixa: { min: 80, max: 260 } },
  {
    chave: 'aguaCorporalPercentual',
    rotulo: 'Água corporal',
    unidade: '%',
    faixa: { min: 20, max: 80 },
  },
  { chave: 'massaOsseaKg', rotulo: 'Massa óssea', unidade: 'kg', faixa: { min: 0.5, max: 10 } },
  {
    chave: 'taxaMetabolicaBasal',
    rotulo: 'Taxa metabólica basal',
    unidade: 'kcal',
    faixa: { min: 500, max: 5000 },
    inteiro: true,
  },
  { chave: 'gorduraVisceral', rotulo: 'Gordura visceral', unidade: 'nível', faixa: { min: 1, max: 60 } },
];

export interface PreviaBioimpedancia {
  percentualGordura: number;
  faixa: string;
  massaGordaKg: number;
  massaMagraKg: number;
  /** `true` quando a massa magra veio da balança, não da subtração. */
  massaMagraInformada: boolean;
}

/** Mensagem para um campo específico, ou `null`. */
export function problemaDoCampo(campo: CampoDaBalanca, valores: ValoresDaBalanca): string | null {
  const texto = valores[campo.chave];
  const opcoes = { inteiro: campo.inteiro };
  return campo.obrigatorio
    ? problemaDeFaixa(texto, campo.faixa, campo.unidade, opcoes)
    : problemaDeFaixaOpcional(texto, campo.faixa, campo.unidade, opcoes);
}

/** Tudo que impede salvar, em texto para a tela. Vazio significa que dá. */
export function problemasDaBioimpedancia(alunoId: string, valores: ValoresDaBalanca): string[] {
  const problemas: string[] = [];

  if (alunoId === '') problemas.push('Escolha o aluno.');

  for (const campo of CAMPOS) {
    const problema = problemaDoCampo(campo, valores);
    if (problema) problemas.push(`${campo.rotulo} (${campo.unidade}): ${problema}.`);
  }

  return problemas;
}

export function podeSalvarBioimpedancia(alunoId: string, valores: ValoresDaBalanca): boolean {
  return problemasDaBioimpedancia(alunoId, valores).length === 0;
}

/**
 * Prévia da composição, ou `null` enquanto peso e percentual não servirem.
 *
 * Espelha `calcularPorBioimpedancia` do servidor, **inclusive na parte que a
 * tela antes contrariava**: quando a balança informa a massa magra, é ela que
 * vale — não `peso - massa gorda`. A legenda da tela já prometia isso; a
 * prévia é que mostrava a derivada e mudava de número depois de salvar.
 */
export function previaDaBioimpedancia(
  valores: ValoresDaBalanca,
  sexo: SexoBiologico,
): PreviaBioimpedancia | null {
  const peso = CAMPOS[0]!;
  const gordura = CAMPOS[1]!;
  if (problemaDoCampo(peso, valores) || problemaDoCampo(gordura, valores)) return null;

  const pesoKg = numeroDoCampo(valores.pesoKg)!;
  const percentual = numeroDoCampo(valores.percentualGordura)!;

  // Massa magra com lixo digitado não pode virar prévia: o campo já está
  // marcado como problema e a derivada é a resposta honesta até ele ser
  // corrigido.
  const massaMagraCampo = CAMPOS.find((c) => c.chave === 'massaMagraKg')!;
  const informada = problemaDoCampo(massaMagraCampo, valores)
    ? null
    : numeroDoCampo(valores.massaMagraKg);

  const massaGordaKg = arredondar((pesoKg * percentual) / 100);

  return {
    percentualGordura: arredondar(percentual, 1),
    faixa: faixaDeGordura(percentual, sexo),
    massaGordaKg,
    massaMagraKg: arredondar(informada ?? pesoKg - massaGordaKg),
    massaMagraInformada: informada !== null,
  };
}

/** Só faz sentido com `problemasDaBioimpedancia` vazio. */
export function corpoDaBioimpedancia(
  valores: ValoresDaBalanca,
  data: Date,
): AvaliacaoBioimpedanciaInput {
  // `?? undefined` e não `?? 0`: campo opcional em branco é ausência, e um
  // zero seria recusado pelo `.min()` como se fosse erro de digitação.
  const opcional = (chave: keyof ValoresDaBalanca) => numeroDoCampo(valores[chave]) ?? undefined;

  return {
    metodo: 'BIOIMPEDANCIA',
    data,
    pesoKg: numeroDoCampo(valores.pesoKg) ?? 0,
    percentualGordura: numeroDoCampo(valores.percentualGordura) ?? 0,
    alturaCm: opcional('alturaCm'),
    massaMagraKg: opcional('massaMagraKg'),
    aguaCorporalPercentual: opcional('aguaCorporalPercentual'),
    massaOsseaKg: opcional('massaOsseaKg'),
    taxaMetabolicaBasal: opcional('taxaMetabolicaBasal'),
    gorduraVisceral: opcional('gorduraVisceral'),
  };
}
