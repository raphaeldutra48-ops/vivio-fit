import { ErroApi } from '@vivio/sdk';

/**
 * A frase que se mostra a uma pessoa quando uma ação falha.
 *
 * O painel repetia `e instanceof Error ? e.message : 'frase própria'` em
 * dezenove lugares, e o `Error` genérico é justamente o que NÃO se mostra: dele
 * saem "Failed to fetch", "NetworkError when attempting to fetch resource" e
 * "Cannot read properties of undefined (reading 'nome')". Ler isso no lugar de
 * "não foi possível salvar" faz a pessoa achar que o sistema quebrou de um jeito
 * grave — e, o que é pior, não diz o que fazer.
 *
 * Só `ErroApi` tem mensagem escrita para gente: ela vem da nossa API e do nosso
 * SDK, que já traduzem recusa de política, formato de arquivo e limite de envio.
 * Qualquer outra coisa cai na frase da tela, que sabe o que a pessoa estava
 * tentando fazer.
 */
export function fraseDeErro(e: unknown, generica: string): string {
  if (!(e instanceof ErroApi)) return generica;
  /*
    Falta de rede é o único caso em que a mensagem do SDK diz menos que a tela:
    ele descreve a causa técnica, e o que importa aqui é que nada foi perdido e
    que vale tentar de novo.
  */
  if (e.codigo === 'ERRO_DE_REDE') return 'Sem conexão agora. O que você preencheu continua aqui — tente de novo.';
  return e.message;
}
