import {
  CAMPOS_COMPARATIVO,
  variacaoEhPositiva,
  type CampoComparativo,
  type ComparativoDeEvolucao,
  type FotoDoComparativo,
  type LadoDoComparativo,
} from '@vivio/contracts';

/**
 * Preparo do comparativo para a tela e para o papel.
 *
 * Fica aqui, fora do componente, porque este é o documento que sai impresso e
 * vai para a mão do aluno: cada decisão de "o que mostrar quando falta dado"
 * precisa de teste, e componente com `useEffect` não se testa direito.
 */

export interface LinhaDoComparativo {
  chave: CampoComparativo;
  rotulo: string;
  unidade: string;
  antes: string | null;
  agora: string | null;
  variacao: string | null;
  /** `true` boa, `false` ruim, `null` neutra — ver `variacaoEhPositiva`. */
  positiva: boolean | null;
}

/** Número com vírgula decimal, sem casa quando é inteiro. */
export function numero(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

/**
 * A variação com sinal explícito.
 *
 * O `+` é obrigatório: sem ele, "2 kg" na coluna de variação é ambíguo entre
 * ganho e o valor absoluto da diferença — e num documento de evolução essa
 * ambiguidade é justamente o que não pode existir.
 */
export function comSinal(delta: number): string {
  return `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${numero(Math.abs(delta))}`;
}

/**
 * Uma linha por campo, sempre — inclusive as vazias.
 *
 * Some campo sem dado nenhum dos dois lados, porque linha inteira de travessão
 * só ocupa papel. Mas basta um lado ter valor para a linha ficar: mostrar que
 * a cintura foi medida uma vez só é informação útil para quem for medir a
 * próxima.
 */
export function linhasDoComparativo(c: ComparativoDeEvolucao): LinhaDoComparativo[] {
  return CAMPOS_COMPARATIVO.map(({ chave, rotulo, unidade }) => {
    const antes = c.antes[chave];
    const agora = c.agora[chave];
    const delta = c.diferenca[chave];

    return {
      chave,
      rotulo,
      unidade,
      antes: antes === null ? null : numero(antes),
      agora: agora === null ? null : numero(agora),
      variacao: delta === null ? null : comSinal(delta),
      positiva: delta === null ? null : variacaoEhPositiva(chave, delta),
    };
  }).filter((l) => l.antes !== null || l.agora !== null);
}

export interface ParDeFotos {
  angulo: string;
  antes: FotoDoComparativo | null;
  agora: FotoDoComparativo | null;
}

/** Ordem de leitura do corpo, não a ordem em que as fotos foram tiradas. */
const ORDEM_ANGULO = [
  'FRENTE',
  'LADO_DIREITO',
  'LADO_ESQUERDO',
  // `LADO` é herdado das fotos anteriores à separação dos dois lados. Fica
  // junto deles na ordem, porque é o que ele era.
  'LADO',
  'COSTAS',
  'LIVRE',
];

/**
 * Emparelha as fotos pelo ângulo.
 *
 * Ângulo presente de um lado só entra mesmo assim, com um vazio do outro: o
 * aluno que tirou a foto de costas hoje e não tirou há dois meses precisa ver
 * que a de hoje existe — escondê-la porque falta o par faria parecer que o app
 * perdeu a foto.
 */
export function paresDeFotos(antes: LadoDoComparativo, agora: LadoDoComparativo): ParDeFotos[] {
  const angulos = [...new Set([...antes.fotos, ...agora.fotos].map((f) => f.angulo))];

  return angulos
    .sort((a, b) => ORDEM_ANGULO.indexOf(a) - ORDEM_ANGULO.indexOf(b))
    .map((angulo) => ({
      angulo,
      antes: antes.fotos.find((f) => f.angulo === angulo) ?? null,
      agora: agora.fotos.find((f) => f.angulo === angulo) ?? null,
    }));
}

/** `2026-08-09` → `9 de agosto de 2026`. Data sem hora não leva fuso. */
export function porExtenso(iso: string | null): string | null {
  if (!iso) return null;
  const [ano, mes, dia] = iso.split('-').map(Number);
  if (!ano || !mes || !dia) return null;
  return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * O que o documento tem para dizer, em uma frase.
 *
 * Existe para o comparativo nunca sair mudo. Um documento que abre com tabela
 * vazia e nenhuma explicação faz a pessoa concluir que não evoluiu, quando o
 * que houve foi não ter sido medida.
 */
export function resumoDoPeriodo(c: ComparativoDeEvolucao): string {
  if (c.antes.data === null && c.agora.data === null) {
    return `Ainda não há medidas registradas para este período de ${c.dias} dias. O comparativo começa a existir a partir da primeira avaliação.`;
  }
  if (c.antes.data === null) {
    return `Há medida de agora, mas nenhuma de aproximadamente ${c.dias} dias atrás — não há com o que comparar ainda. Esta avaliação vira o ponto de partida do próximo comparativo.`;
  }
  if (c.agora.data === null) {
    return 'Há medida antiga, mas nenhuma recente. Vale marcar uma reavaliação para fechar o comparativo.';
  }
  return `Comparação entre ${porExtenso(c.antes.data)} e ${porExtenso(c.agora.data)}.`;
}
