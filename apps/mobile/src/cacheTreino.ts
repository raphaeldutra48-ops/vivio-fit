import type { AnterioresDaSessao, PlanoTreinoCompleto } from '@vivio/contracts';
import { gravar, ler } from './armazenamento';

/**
 * Cache do que a tela de treino precisa para abrir sem rede.
 *
 * O payload do plano ativo já vem completo da API (exercício, instruções,
 * cargas) justamente para caber aqui — na academia não dá para buscar detalhe
 * sob demanda.
 */

interface ComData<T> {
  guardadoEm: string;
  dados: T;
}

const chavePlano = (alunoId: string) => `vivio.plano.${alunoId}`;
const chaveAnteriores = (alunoId: string, sessaoId: string) =>
  `vivio.anteriores.${alunoId}.${sessaoId}`;

export async function salvarPlano(alunoId: string, plano: PlanoTreinoCompleto): Promise<void> {
  await gravar(chavePlano(alunoId), { guardadoEm: new Date().toISOString(), dados: plano });
}

export async function lerPlano(
  alunoId: string,
): Promise<{ plano: PlanoTreinoCompleto; guardadoEm: string } | null> {
  const guardado = await ler<ComData<PlanoTreinoCompleto>>(chavePlano(alunoId));
  return guardado ? { plano: guardado.dados, guardadoEm: guardado.guardadoEm } : null;
}

export async function salvarAnteriores(
  alunoId: string,
  sessaoId: string,
  anteriores: AnterioresDaSessao,
): Promise<void> {
  await gravar(chaveAnteriores(alunoId, sessaoId), {
    guardadoEm: new Date().toISOString(),
    dados: anteriores,
  });
}

export async function lerAnteriores(
  alunoId: string,
  sessaoId: string,
): Promise<AnterioresDaSessao | null> {
  const guardado = await ler<ComData<AnterioresDaSessao>>(chaveAnteriores(alunoId, sessaoId));
  return guardado?.dados ?? null;
}
