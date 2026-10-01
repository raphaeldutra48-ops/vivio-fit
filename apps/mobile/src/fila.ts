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

/*
  Treino recusado DE VEZ não pode sair em silêncio.

  Quando o servidor devolve erro definitivo — consentimento retirado, sessão que
  não existe mais, dado que o schema recusa — reenviar não resolve, e o item
  precisa sair da fila para não travar os outros. Era o que a sincronização já
  fazia; o problema é que ela só apagava.

  O efeito disso em quem usa: o aviso "1 treino aguardando envio" simplesmente
  desaparecia. Contador em zero é a mesma tela de "tudo enviado" — e a pessoa
  acreditava que uma hora de academia tinha subido. Não subiu, e ninguém dos dois
  lados ficou sabendo.

  Agora o item vai para uma lista separada, com o motivo. Ele continua no
  aparelho, aparece na aba de evolução e pode ser reenfileirado: um 403 por
  autorização retirada se resolve autorizando de novo, e aí o reenvio funciona.
*/
const CHAVE_DESCARTADOS = 'vivio.fila.descartados';

export interface ItemDescartado extends ItemDaFila {
  descartadoEm: string;
  /** O código do erro que o servidor devolveu — é o que explica o descarte. */
  motivo: string;
}

export async function lerDescartados(): Promise<ItemDescartado[]> {
  return (await ler<ItemDescartado[]>(CHAVE_DESCARTADOS)) ?? [];
}

/** Tira da fila e guarda em separado, com o motivo. */
export async function descartar(clienteUuid: string, motivo: string): Promise<ItemDaFila[]> {
  const fila = await lerFila();
  const item = fila.find((i) => i.clienteUuid === clienteUuid);
  if (item) {
    const descartados = await lerDescartados();
    const semDuplicata = descartados.filter((d) => d.clienteUuid !== clienteUuid);
    await gravar(CHAVE_DESCARTADOS, [
      ...semDuplicata,
      { ...item, descartadoEm: new Date().toISOString(), motivo },
    ]);
  }
  return remover(clienteUuid);
}

/**
 * Devolve um descartado para a fila.
 *
 * Existe porque a causa mais comum de descarte é reversível: o aluno retirou a
 * autorização de treino, o envio foi recusado, e depois ele autorizou de novo.
 * Sem isto o treino ficaria guardado para sempre sem chance de subir.
 */
export async function reenfileirar(clienteUuid: string): Promise<ItemDaFila[]> {
  const descartados = await lerDescartados();
  const item = descartados.find((d) => d.clienteUuid === clienteUuid);
  if (!item) return lerFila();

  await gravar(
    CHAVE_DESCARTADOS,
    descartados.filter((d) => d.clienteUuid !== clienteUuid),
  );
  return enfileirar(item.alunoId, item.execucao);
}

/** Esquece um descartado — é a pessoa dizendo "esse eu não quero mais". */
export async function esquecerDescartado(clienteUuid: string): Promise<ItemDescartado[]> {
  const restantes = (await lerDescartados()).filter((d) => d.clienteUuid !== clienteUuid);
  await gravar(CHAVE_DESCARTADOS, restantes);
  return restantes;
}

export async function registrarFalha(clienteUuid: string, erro: string): Promise<void> {
  const fila = await lerFila();
  const atualizada = fila.map((i) =>
    i.clienteUuid === clienteUuid ? { ...i, tentativas: i.tentativas + 1, ultimoErro: erro } : i,
  );
  await escreverFila(atualizada);
}

/**
 * Datas viram string no JSON do storage, e continuam string ao reenviar.
 *
 * O SDK normaliza para ISO com fuso antes de subir — antes quem aceitava as
 * duas formas era o `z.coerce.date` da API, que não está mais no caminho.
 * Repassar como está segue certo; o que mudou é quem converte.
 */
export function paraEnvio(item: ItemDaFila): RegistrarExecucaoInput {
  return item.execucao;
}
