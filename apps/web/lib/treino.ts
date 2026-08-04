import type { CriarPlanoTreinoInput } from '@vivio/contracts';
import { numeroDoCampo, problemaDeFaixa, problemaDeFaixaOpcional } from './campos';

/**
 * Leitura e validação da montagem de treino.
 *
 * Terceira e última tela da pendência 14b. Aqui o estado guardava o próprio
 * `ItemTreinoInput`, com número dentro — então apagar o campo de séries para
 * redigitar estacionava um `0`, que o `min(1)` do schema recusa. E o
 * `podeSalvar` só conferia o nome do plano e se cada sessão tinha item:
 * séries, repetições, carga e descanso não eram olhados em lugar nenhum.
 */

/** Espelham `itemTreinoSchema` e `sessaoTreinoSchema`. */
const LIMITE = {
  series: { min: 1, max: 20 },
  carga: { min: 0, max: 1000 },
  descanso: { min: 0, max: 900 },
  dia: { min: 1, max: 7 },
} as const;

export interface ItemDeTreinoDigitado {
  exercicioId: string;
  /** Só para a mensagem de erro dizer de qual exercício está falando. */
  nome: string;
  series: string;
  repsAlvo: string;
  cargaSugeridaKg: string;
  descansoSeg: string;
}

export interface SessaoDigitada {
  nome: string;
  diaSugerido: string;
  itens: ItemDeTreinoDigitado[];
}

export function problemaDasSeries(texto: string): string | null {
  return problemaDeFaixa(texto, LIMITE.series, 'séries', { inteiro: true });
}

/**
 * Texto livre — "8-12", "até a falha", "30s". Não é número, e tentar
 * transformar em número quebraria metade dos usos legítimos.
 */
export function problemaDasReps(texto: string): string | null {
  const limpo = texto.trim();
  if (limpo === '') return 'informe as repetições';
  if (limpo.length > 30) return 'no máximo 30 caracteres';
  return null;
}

/** Opcional. Zero é válido: exercício de peso corporal tem carga zero. */
export function problemaDaCarga(texto: string): string | null {
  return problemaDeFaixaOpcional(texto, LIMITE.carga, 'kg');
}

/** Opcional, e inteiro: o schema não aceita meio segundo de descanso. */
export function problemaDoDescanso(texto: string): string | null {
  return problemaDeFaixaOpcional(texto, LIMITE.descanso, 'segundos', { inteiro: true });
}

export function problemaDoItem(item: ItemDeTreinoDigitado): string | null {
  return (
    problemaDasSeries(item.series) ??
    problemaDasReps(item.repsAlvo) ??
    problemaDaCarga(item.cargaSugeridaKg) ??
    problemaDoDescanso(item.descansoSeg)
  );
}

export function problemasDoTreino(nome: string, sessoes: SessaoDigitada[]): string[] {
  const problemas: string[] = [];

  if (nome.trim().length < 2) problemas.push('Dê um nome ao plano (ao menos 2 letras).');

  sessoes.forEach((sessao, i) => {
    const comoChamar = sessao.nome.trim() || `Sessão ${i + 1}`;

    if (sessao.nome.trim() === '') problemas.push(`Sessão ${i + 1}: dê um nome.`);
    if (sessao.itens.length === 0) problemas.push(`"${comoChamar}" está sem exercícios.`);

    for (const item of sessao.itens) {
      const problema = problemaDoItem(item);
      if (problema) problemas.push(`${item.nome} em "${comoChamar}": ${problema}.`);
    }
  });

  return problemas;
}

export function podeSalvarTreino(nome: string, sessoes: SessaoDigitada[]): boolean {
  return problemasDoTreino(nome, sessoes).length === 0;
}

/** Só faz sentido com `problemasDoTreino` vazio. */
export function corpoDoTreino(
  nome: string,
  objetivo: string,
  ativar: boolean,
  sessoes: SessaoDigitada[],
): CriarPlanoTreinoInput {
  return {
    nome: nome.trim(),
    objetivo: objetivo.trim() || undefined,
    ativar,
    sessoes: sessoes.map((s) => ({
      nome: s.nome.trim(),
      diaSugerido: numeroDoCampo(s.diaSugerido) ?? undefined,
      itens: s.itens.map((i) => ({
        exercicioId: i.exercicioId,
        series: numeroDoCampo(i.series) ?? 0,
        repsAlvo: i.repsAlvo.trim(),
        // `?? undefined` e não `?? 0`: carga em branco é ausência de sugestão,
        // e zero significaria "sem peso", que é outra coisa.
        cargaSugeridaKg: numeroDoCampo(i.cargaSugeridaKg) ?? undefined,
        descansoSeg: numeroDoCampo(i.descansoSeg) ?? undefined,
      })),
    })),
  };
}
