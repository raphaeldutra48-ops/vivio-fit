import {
  TIPOS_COM_OPCOES,
  type PerguntaInput,
  type SalvarModeloAnamneseInput,
} from '@vivio/contracts';

/**
 * Validação e montagem do corpo do modelo de anamnese.
 *
 * Fora do componente porque é a parte que erra em silêncio: uma opção vazia ou
 * um `ajuda: ''` só aparecem quando o Zod do servidor recusa, depois de a
 * pessoa ter montado o questionário inteiro. Aqui dá para testar sem renderizar.
 */

/** Mensagens para exibir; vazio significa que dá para salvar. */
export function problemasDasPerguntas(perguntas: PerguntaInput[]): string[] {
  return perguntas.flatMap((p, i) => {
    if (p.texto.trim().length < 3) return [`Pergunta ${i + 1}: escreva o texto`];
    if (TIPOS_COM_OPCOES.includes(p.tipo) && p.opcoes.filter(Boolean).length < 2) {
      return [`Pergunta ${i + 1}: escolha precisa de ao menos duas opções`];
    }
    return [];
  });
}

export function podeSalvarModelo(nome: string, perguntas: PerguntaInput[]): boolean {
  return (
    nome.trim().length >= 2 && perguntas.length > 0 && problemasDasPerguntas(perguntas).length === 0
  );
}

export function corpoDoModelo(
  nome: string,
  descricao: string,
  perguntas: PerguntaInput[],
): SalvarModeloAnamneseInput {
  return {
    nome: nome.trim(),
    descricao: descricao.trim() || undefined,
    perguntas: perguntas.map((p) => ({
      ...p,
      texto: p.texto.trim(),
      // Linha em branco no campo "uma opção por linha" viraria string vazia, que
      // o schema recusa. E trocar o tipo da pergunta depois de digitar opções
      // deixava as antigas penduradas num tipo que não as usa.
      opcoes: TIPOS_COM_OPCOES.includes(p.tipo) ? p.opcoes.map((o) => o.trim()).filter(Boolean) : [],
      ajuda: p.ajuda?.trim() || undefined,
    })),
  };
}
