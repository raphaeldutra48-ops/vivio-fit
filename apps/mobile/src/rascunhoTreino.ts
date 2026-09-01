import { rascunhoAindaVale, type RascunhoDeTreino } from '@vivio/contracts';
import { apagar, gravar, ler } from './armazenamento';

/**
 * Gravação e leitura do treino em andamento.
 *
 * A regra de quando um rascunho ainda serve mora em `@vivio/contracts` — aqui
 * é só entrada e saída do aparelho. A separação existe porque a regra é
 * testável e esta parte não: o aplicativo não tem suíte, e deixar a decisão
 * junto do `AsyncStorage` seria escondê-la de todo teste.
 *
 * Um rascunho por aluno, e não um por sessão. Ninguém faz dois treinos ao
 * mesmo tempo, e um rascunho por sessão deixaria lixo acumulando no aparelho a
 * cada plano novo — sem ninguém para limpar.
 */

const chave = (alunoId: string) => `vivio.rascunho.${alunoId}`;

export async function salvarRascunho(
  alunoId: string,
  rascunho: Omit<RascunhoDeTreino, 'salvoEm'>,
): Promise<void> {
  await gravar(chave(alunoId), { ...rascunho, salvoEm: new Date().toISOString() });
}

/**
 * O rascunho desta sessão, se ainda valer.
 *
 * Rascunho vencido ou de outra sessão é **apagado** ao ser lido, não só
 * ignorado. Deixá-lo no aparelho não custa nada hoje e custa amanhã: um
 * `salvoEm` no futuro por relógio errado ressuscitaria semanas depois.
 */
export async function lerRascunho(
  alunoId: string,
  sessaoId: string,
): Promise<RascunhoDeTreino | null> {
  const guardado = await ler<RascunhoDeTreino>(chave(alunoId));
  if (!guardado) return null;

  // Estrutura inesperada — versão antiga do app, gravação truncada. Some.
  if (!Array.isArray(guardado.series) || typeof guardado.sessaoId !== 'string') {
    await apagar(chave(alunoId));
    return null;
  }

  if (!rascunhoAindaVale(guardado, sessaoId, new Date())) {
    await apagar(chave(alunoId));
    return null;
  }

  return guardado;
}

export async function descartarRascunho(alunoId: string): Promise<void> {
  await apagar(chave(alunoId));
}
