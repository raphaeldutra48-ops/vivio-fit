import type { RegistrarExecucaoInput } from '@vivio/contracts';
import { gravar, ler } from './armazenamento';

/**
 * Fila de saída dos treinos executados.
 *
 * O treino é gravado AQUI ANTES de qualquer tentativa de envio. Se o app
 * fechar, a bateria acabar ou a rede não voltar, o treino não se perde — ele
 * sai da fila só depois que o servidor confirmar.
 *
 * A idempotência fica por conta do `clienteUuid`, que é gerado no aparelho no
 * início do treino: reenviar a mesma entrada nunca duplica no servidor.
 */

export interface ItemDaFila {
  /** Mesmo uuid enviado ao servidor — é a identidade do treino. */
  clienteUuid: string;
  alunoId: string;
  execucao: RegistrarExecucaoInput;
  enfileiradoEm: string;
  tentativas: number;
  ultimoErro?: string;
}

const CHAVE = 'vivio.fila.execucoes';

export async function lerFila(): Promise<ItemDaFila[]> {
  return (await ler<ItemDaFila[]>(CHAVE)) ?? [];
}

async function escreverFila(itens: ItemDaFila[]): Promise<void> {
  await gravar(CHAVE, itens);
}

/** Enfileira; se o mesmo treino já estiver na fila, substitui em vez de duplicar. */
export async function enfileirar(
  alunoId: string,
  execucao: RegistrarExecucaoInput,
): Promise<ItemDaFila[]> {
  const fila = await lerFila();
  const existente = fila.findIndex((i) => i.clienteUuid === execucao.clienteUuid);

  const item: ItemDaFila = {
    clienteUuid: execucao.clienteUuid,
    alunoId,
    execucao,
    enfileiradoEm: new Date().toISOString(),
    tentativas: existente >= 0 ? (fila[existente]?.tentativas ?? 0) : 0,
  };

  const atualizada = [...fila];
  if (existente >= 0) atualizada[existente] = item;
  else atualizada.push(item);

  await escreverFila(atualizada);
  return atualizada;
}

export async function remover(clienteUuid: string): Promise<ItemDaFila[]> {
  const fila = (await lerFila()).filter((i) => i.clienteUuid !== clienteUuid);
  await escreverFila(fila);
  return fila;
}

export async function registrarFalha(clienteUuid: string, erro: string): Promise<void> {
  const fila = await lerFila();
  const atualizada = fila.map((i) =>
    i.clienteUuid === clienteUuid ? { ...i, tentativas: i.tentativas + 1, ultimoErro: erro } : i,
  );
  await escreverFila(atualizada);
}

/**
 * Datas viram string no JSON do storage. Ao reenviar, o Zod do servidor aceita
 * string ISO (`z.coerce.date`), então basta repassar como está.
 */
export function paraEnvio(item: ItemDaFila): RegistrarExecucaoInput {
  return item.execucao;
}
