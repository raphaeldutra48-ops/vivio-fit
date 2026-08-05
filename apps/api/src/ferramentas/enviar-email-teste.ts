import { createTransport } from 'nodemailer';
import { montarEmailDeVerificacao } from '../modules/auth/mensagem-verificacao';

/**
 * Prova que a configuração de e-mail entrega de verdade.
 *
 * Mora em `src/` e não em `scripts/` por um motivo de empacotamento: a imagem
 * de produção copia `dist/`, e não o código-fonte. Um script fora de `src/`
 * existiria no repositório e não no contêiner — que é exatamente o único lugar
 * onde a `SMTP_URL` existe para ser testada.
 *
 * Sem isto, o único jeito de testar `SMTP_URL` é cadastrar uma conta em
 * produção e torcer — o que suja a base a cada tentativa e, quando falha, não
 * diz por quê: o `CorreioSmtp` engole o erro de propósito (pendência 16), para
 * uma falha do provedor não derrubar um cadastro já gravado. Aqui o erro é o
 * produto, então ele aparece inteiro.
 *
 * Em desenvolvimento:
 *   EMAIL_TESTE_PARA=voce@exemplo.com pnpm --filter @vivio/api email-teste
 * No Railway: defina EMAIL_TESTE_PARA e faça deploy — o `entrada.sh` chama a
 * versão compilada, do mesmo jeito que faz com as outras tarefas.
 *
 * A mensagem enviada é a de confirmação de cadastro, com um link falso. É de
 * propósito: testar com um "hello world" provaria que o SMTP aceita conexão,
 * não que a mensagem que importa passa pelo filtro de spam com o remetente e o
 * domínio reais.
 */

/** Nunca imprime a URL: ela carrega a chave da API do provedor. */
function descreverSemVazar(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username ? `${u.username}:***@` : ''}${u.host}`;
  } catch {
    return '(SMTP_URL em formato irreconhecível)';
  }
}

async function main(): Promise<void> {
  const para = process.env.EMAIL_TESTE_PARA?.trim();
  const url = process.env.SMTP_URL?.trim();
  const remetente = process.env.EMAIL_REMETENTE?.trim();

  if (!para) {
    console.error('Defina EMAIL_TESTE_PARA com o endereço que deve receber a mensagem.');
    process.exit(1);
  }

  if (!url) {
    console.error('SMTP_URL não está definida — não há para onde enviar.');
    console.error('É a última peça que falta: contrate o provedor, verifique o domínio e');
    console.error('defina SMTP_URL e EMAIL_REMETENTE. Ver docs/PASSO-A-PASSO-EMAIL.md.');
    console.error('Depois apague EMAIL_SEM_ENTREGA, que é o que segura a API de pé sem e-mail.');
    process.exit(1);
  }

  if (!remetente) {
    console.error('EMAIL_REMETENTE não está definida.');
    console.error('Ela precisa usar um domínio já verificado no provedor, ou a mensagem é recusada.');
    process.exit(1);
  }

  console.log(`Servidor:  ${descreverSemVazar(url)}`);
  console.log(`Remetente: ${remetente}`);
  console.log(`Para:      ${para}`);
  console.log('');

  const transporte = createTransport(url);

  // `verify` separa "não conecta / credencial errada" de "conecta mas recusa a
  // mensagem". São dois problemas com soluções bem diferentes, e descobrir qual
  // é economiza a tarde de quem está configurando.
  try {
    await transporte.verify();
    console.log('Conexão e credenciais: OK.');
  } catch (erro) {
    console.error('Falhou já na conexão/autenticação:');
    console.error(String(erro));
    console.error('');
    console.error('Confira usuário e senha na SMTP_URL, e se a porta é a que o provedor pede.');
    process.exit(1);
  }

  const email = montarEmailDeVerificacao(
    'Teste',
    para,
    'https://app.viviofit.com.br/verificar-email?token=ESTE-LINK-E-DE-TESTE',
  );

  try {
    const resultado = await transporte.sendMail({
      from: remetente,
      to: email.para,
      subject: `[teste] ${email.assunto}`,
      text: email.texto,
      html: email.html,
    });
    console.log(`Aceito pelo servidor. id: ${resultado.messageId}`);
    console.log('');
    console.log('Aceito não é entregue. Confira a caixa de entrada E o spam.');
    console.log('Se caiu no spam, faltam os registros de DNS do domínio no provedor.');
  } catch (erro) {
    console.error('Conectou, mas a mensagem foi recusada:');
    console.error(String(erro));
    console.error('');
    console.error('Quase sempre é o remetente: o domínio de EMAIL_REMETENTE precisa estar');
    console.error('verificado no provedor antes de poder enviar por ele.');
    process.exit(1);
  }
}

void main();
