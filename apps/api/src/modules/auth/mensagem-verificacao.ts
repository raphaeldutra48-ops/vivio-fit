import type { Email } from './correio';

/** 24h: tempo de sobra para quem confirma no dia seguinte, curto para quem roubou o link. */
export const VALIDADE_HORAS = 24;

/** Nome próprio não passa disso; o corte evita saudação de dois parágrafos. */
const LIMITE_NOME = 40;

/**
 * Limpa o nome vindo do cadastro para uso dentro da mensagem.
 *
 * Isto não é capricho de formatação. Quem se cadastra **ainda não provou ser
 * dono do endereço** — provar é exatamente o que este e-mail serve para fazer.
 * Então dá para cadastrar o e-mail de outra pessoa e escolher o `nome`: a
 * vítima recebe, assinado pelo nosso domínio, um texto em parte escrito por
 * quem não é ela. Um cadastro com o nome
 * `Ana\n\nSua conta foi invadida, acesse http://golpe` vira parágrafo inteiro
 * na versão texto, e `<a href="http://golpe">clique</a>` vira link clicável na
 * versão HTML.
 *
 * Daí as duas medidas aqui — uma linha só, tamanho de nome — mais o escape do
 * HTML lá embaixo. A versão texto não precisa de escape porque texto puro não
 * interpreta marcação; precisa é de não ter quebra de linha.
 */
export function primeiroNomeSeguro(nome: string): string {
  const semControles = nome.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (semControles === '') return '';
  return semControles.split(/\s+/)[0].slice(0, LIMITE_NOME);
}

/**
 * Uma hora, e não as 24 da confirmação.
 *
 * Este link **troca a senha** — é mais poder que confirmar um endereço, e o
 * risco de ele ficar parado numa caixa de entrada é proporcional. Uma hora dá
 * folga para quem pediu e não abriu na hora, e é curto para quem alcançou a
 * caixa de outra pessoa.
 */
export const VALIDADE_REDEFINICAO_HORAS = 1;

export function escaparHtml(bruto: string): string {
  return bruto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Monta a mensagem de confirmação. Função pura de propósito: o texto que a
 * pessoa recebe é a parte que precisa de teste, e ela não depende de banco,
 * de configuração nem de SMTP.
 */
export function montarEmailDeVerificacao(nome: string, para: string, link: string): Email {
  const primeiro = primeiroNomeSeguro(nome);
  // Nome que sobrou vazio (só espaços, só emoji de controle) não vira "Olá, ."
  const saudacao = primeiro ? `Olá, ${primeiro}.` : 'Olá.';
  const linkHtml = escaparHtml(link);

  return {
    para,
    assunto: 'Confirme seu e-mail — Vívio Fit',
    texto: [
      saudacao,
      '',
      'Confirme seu e-mail para ativar sua conta no Vívio Fit:',
      link,
      '',
      `O link vale por ${VALIDADE_HORAS} horas.`,
      'Se não foi você quem se cadastrou, ignore esta mensagem — sem a confirmação a conta não é ativada.',
    ].join('\n'),
    html: [
      `<p>${escaparHtml(saudacao)}</p>`,
      '<p>Confirme seu e-mail para ativar sua conta no Vívio Fit:</p>',
      `<p><a href="${linkHtml}">Confirmar meu e-mail</a></p>`,
      `<p>O link vale por ${VALIDADE_HORAS} horas.</p>`,
      '<p>Se não foi você quem se cadastrou, ignore esta mensagem — sem a confirmação a conta não é ativada.</p>',
    ].join(''),
  };
}

/**
 * Mensagem de redefinição de senha.
 *
 * A frase final não é gentileza: quem recebe isto sem ter pedido precisa saber
 * que **nada aconteceu ainda** e que a senha atual continua valendo. Sem isso,
 * a reação natural é achar que a conta foi invadida — e correr para clicar no
 * link, que é exatamente o que um atacante quer.
 */
export function montarEmailDeRedefinicao(nome: string, para: string, link: string): Email {
  const primeiro = primeiroNomeSeguro(nome);
  const saudacao = primeiro ? `Olá, ${primeiro}.` : 'Olá.';
  const linkHtml = escaparHtml(link);
  const validade = `${VALIDADE_REDEFINICAO_HORAS} hora`;

  return {
    para,
    assunto: 'Redefinir sua senha — Vívio Fit',
    texto: [
      saudacao,
      '',
      'Recebemos um pedido para redefinir a senha da sua conta no Vívio Fit.',
      'Para escolher uma senha nova, abra este link:',
      link,
      '',
      `O link vale por ${validade} e só pode ser usado uma vez.`,
      'Se não foi você quem pediu, ignore esta mensagem: sua senha continua a mesma',
      'e ninguém consegue trocá-la sem abrir o link acima.',
    ].join('\n'),
    html: [
      `<p>${escaparHtml(saudacao)}</p>`,
      '<p>Recebemos um pedido para redefinir a senha da sua conta no Vívio Fit.</p>',
      `<p><a href="${linkHtml}">Escolher uma senha nova</a></p>`,
      `<p>O link vale por ${validade} e só pode ser usado uma vez.</p>`,
      '<p>Se não foi você quem pediu, ignore esta mensagem: sua senha continua a mesma e ninguém consegue trocá-la sem abrir o link acima.</p>',
    ].join(''),
  };
}
