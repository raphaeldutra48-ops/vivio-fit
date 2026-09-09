import { TipoMeta, type MetaResumo } from './metas';

/**
 * Cálculo de progresso de meta.
 *
 * Módulo puro e separado do serviço porque é aqui que mora a decisão difícil —
 * **a direção da meta**. Emagrecer é ir de 80 para 75; ganhar carga é ir de 60
 * para 80. A mesma conta tem de servir aos dois, e errar o sinal dá um número
 * plausível e invertido: o aluno que engordou apareceria progredindo.
 */

export interface EntradaDeProgresso {
  tipo: TipoMeta;
  alvo: number | null;
  /** Valor no dia em que a meta foi criada. */
  inicial: number | null;
  /** Valor de agora. `null` quando ainda não há dado. */
  atual: number | null;
}

export interface ResultadoDeProgresso {
  progresso: number | null;
  atingida: boolean;
}

/**
 * Progresso de 0 a 100, e se a meta já foi atingida.
 *
 * A régua é a distância entre o início e o alvo — não a distância até zero.
 * Sem isso, quem saiu de 80 kg para 78 com alvo de 75 apareceria com 97%,
 * porque 78 é quase 75 em valor absoluto. Percorreu 40% do caminho, e é isso
 * que motiva ou acende alerta.
 */
export function calcularProgresso({
  tipo,
  alvo,
  inicial,
  atual,
}: EntradaDeProgresso): ResultadoDeProgresso {
  if (tipo === TipoMeta.LIVRE || alvo === null) return { progresso: null, atingida: false };
  if (atual === null) return { progresso: null, atingida: false };

  /*
    Sem valor inicial (meta criada antes de existir qualquer medição), não há
    régua: o progresso fica indefinido, mas ATINGIR ainda é aferível. Melhor
    não mostrar barra do que mostrar uma barra inventada.
  */
  if (inicial === null) {
    return { progresso: null, atingida: atingiuSemRegua(alvo, atual) };
  }

  // A direção sai dos próprios números: se o alvo é menor que o início, a meta
  // é de redução. Não é preciso o profissional declarar.
  const querReduzir = alvo < inicial;
  const atingida = querReduzir ? atual <= alvo : atual >= alvo;

  const distanciaTotal = Math.abs(alvo - inicial);

  /*
    Alvo igual ao inicial é meta de MANUTENÇÃO — "continue nos 75 kg". Não há
    caminho a percorrer, então dividir daria infinito. Vale 100 enquanto o
    valor não sair de lá.
  */
  if (distanciaTotal === 0) {
    return { progresso: atual === alvo ? 100 : 0, atingida: atual === alvo };
  }

  const percorrido = querReduzir ? inicial - atual : atual - inicial;
  const bruto = (percorrido / distanciaTotal) * 100;

  /*
    Limitado entre 0 e 100. Regredir mostra 0, não número negativo: barra
    negativa não desenha, e "-30%" faz o profissional pensar em erro de conta
    em vez de olhar o aluno. A regressão aparece em `valorAtual`, que é o dado
    honesto.
  */
  return {
    progresso: Math.round(Math.min(100, Math.max(0, bruto))),
    atingida,
  };
}

/**
 * Sem valor inicial não dá para saber se a meta é de subir ou descer, então a
 * igualdade é o único julgamento seguro — e "chegou perto" não conta.
 */
function atingiuSemRegua(alvo: number, atual: number): boolean {
  return atual === alvo;
}

/** Passou do prazo e não foi atingida. Sem prazo, nunca está atrasada. */
export function estaAtrasada(prazo: Date | null, atingida: boolean, agora = new Date()): boolean {
  if (!prazo || atingida) return false;
  return prazo.getTime() < agora.getTime();
}

// --- montagem ---------------------------------------------------------------

/** A linha da meta como ela está no banco, já com os números convertidos. */
export interface LinhaDeMeta {
  id: string;
  tipo: string;
  titulo: string;
  alvo: number | null;
  exercicioId: string | null;
  exercicioNome: string | null;
  valorInicial: number | null;
  /** `AAAA-MM-DD`, ou `null`. */
  prazo: string | null;
  observacao: string | null;
  /** ISO com fuso. */
  criadoEm: string;
  /** ISO com fuso, ou `null` enquanto aberta. */
  concluidaEm: string | null;
}

/**
 * A meta como a tela lê, com o progresso aferido na hora.
 *
 * Mora no contrato porque roda dos dois lados. E o progresso não é gravado de
 * propósito: um número guardado envelheceria na primeira pesagem nova, e a
 * diferença entre a barra e a origem apareceria como bug sem causa.
 */
export function montarMetaResumo(
  m: LinhaDeMeta,
  valorAtual: number | null,
  agora: Date = new Date(),
): MetaResumo {
  const { progresso, atingida } = calcularProgresso({
    tipo: m.tipo as TipoMeta,
    alvo: m.alvo,
    inicial: m.valorInicial,
    atual: valorAtual,
  });

  /*
    Concluída à mão vence a aferição. O profissional pode encerrar uma meta que
    deixou de fazer sentido — lesão, mudança de objetivo — e o sistema não deve
    reabri-la só porque o número ainda não bateu.
  */
  const concluida = m.concluidaEm !== null || atingida;

  return {
    id: m.id,
    tipo: m.tipo as TipoMeta,
    titulo: m.titulo,
    alvo: m.alvo,
    exercicioId: m.exercicioId,
    exercicioNome: m.exercicioNome,
    prazo: m.prazo,
    observacao: m.observacao,
    criadoEm: m.criadoEm,
    valorInicial: m.valorInicial,
    valorAtual,
    progresso,
    atingida: concluida,
    concluidaEm: m.concluidaEm,
    atrasada: estaAtrasada(m.prazo === null ? null : new Date(`${m.prazo}T00:00:00.000Z`), concluida, agora),
  };
}

/**
 * A ordem da lista: aberta antes de concluída, e mais recente antes de antiga.
 *
 * Meta concluída é registro; meta aberta é trabalho. Misturar as duas faria o
 * profissional caçar o que falta no meio do que já foi.
 */
export function ordenarMetas(metas: readonly MetaResumo[]): MetaResumo[] {
  return [...metas].sort(
    (a, b) =>
      Number(a.atingida) - Number(b.atingida) ||
      b.criadoEm.localeCompare(a.criadoEm) ||
      b.id.localeCompare(a.id),
  );
}
