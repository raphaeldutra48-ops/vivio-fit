import { createTransport } from 'nodemailer';
import { formaDeEnvio, type FormaDeEnvio } from '../entrega-de-email';
import { enviarPelaApiDoResend, type Email } from '../modules/auth/correio';
import { montarEmailDeVerificacao } from '../modules/auth/mensagem-verificacao';

/**
 * Prova que a configuração de e-mail entrega de verdade.
 *
 * Mora em `src/` e não em `scripts/` por um motivo de empacotamento: a imagem
 * de produção copia `dist/`, e não o código-fonte. Um script fora de `src/`
 * existiria no repositório e não no contêiner — que é exatamente o único lugar
 * onde a chave existe.
 *
 * Sem isto, o único jeito de testar era cadastrar uma conta em produção e
 * torcer — o que suja a base a cada tentativa e, quando falha, não diz por quê:
 * o correio engole o erro de propósito (pendência 16), para uma falha do
 * provedor não derrubar um cadastro já gravado. Aqui o erro é o produto, então
 * ele aparece inteiro.
 *
 * Em desenvolvimento:
 *   EMAIL_TESTE_PARA=voce@exemplo.com pnpm --filter @vivio/api email-teste
 * No Railway: defina EMAIL_TESTE_PARA e faça deploy — o `entrada.sh` chama a
 * versão compilada, do mesmo jeito que faz com as outras tarefas.
 *
 * A mensagem enviada é a de confirmação de cadastro, com um link falso, e sai
 * pelo mesmo caminho que produção usa. É de propósito: testar com um "hello
 * world" por outra via provaria que o provedor responde, não que a mensagem que
 * importa passa pelo filtro de spam com o remetente e o domínio reais.
 */

const LINK_FALSO = 'https://app.viviofit.com.br/verificar-email?token=ESTE-LINK-E-DE-TESTE';

/** Nunca imprime a URL inteira: ela carrega a senha do provedor. */
function descreverSemVazar(forma: FormaDeEnvio): string {
  if (forma.via === 'RESEND') return 'api.resend.com (HTTP)';
  try {
    const u = new URL(forma.url);
    return `${u.protocol}//${u.username ? `${u.username}:***@` : ''}${u.host}`;
  } catch {
    return '(SMTP_URL em formato irreconhecível)';
  }
}

async function porResend(chave: string, remetente: string, email: Email): Promise<void> {
  const { id, erro } = await enviarPelaApiDoResend(chave, remetente, {
    ...email,
    assunto: `[teste] ${email.assunto}`,
  });

  if (erro) {
    console.error('O Resend recusou a mensagem:');
    console.error(erro);
    console.error('');
    console.error('Os dois motivos comuns, e a própria mensagem acima diz qual é:');
    console.error('  - "API key is invalid": a chave em RESEND_API_KEY está errada ou foi revogada.');
    console.error('  - "domain is not verified": o domínio de EMAIL_REMETENTE não está verificado.');
    process.exit(1);
  }

  console.log(`Aceito pelo Resend. id: ${id ?? '(sem id na resposta)'}`);
}

async function porSmtp(url: string, remetente: string, email: Email): Promise<void> {
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
    console.error('Se foi "Connection timeout", quase certamente é a plataforma bloqueando a');
    console.error('porta de SMTP — o Railway faz isso. Nesse caso use RESEND_API_KEY, que sai');
    console.error('por HTTP na 443 e não esbarra em bloqueio de porta.');
    console.error('Se foi recusa de autenticação, confira usuário e senha na SMTP_URL.');
    process.exit(1);
  }

  try {
    const resultado = await transporte.sendMail({
      from: remetente,
      to: email.para,
      subject: `[teste] ${email.assunto}`,
      text: email.texto,
      html: email.html,
    });
    console.log(`Aceito pelo servidor. id: ${resultado.messageId}`);
  } catch (erro) {
    console.error('Conectou, mas a mensagem foi recusada:');
    console.error(String(erro));
    console.error('');
    console.error('Quase sempre é o remetente: o domínio de EMAIL_REMETENTE precisa estar');
    console.error('verificado no provedor antes de poder enviar por ele.');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const para = process.env.EMAIL_TESTE_PARA?.trim();
  const forma = formaDeEnvio();
  const remetente = process.env.EMAIL_REMETENTE?.trim();

  if (!para) {
    console.error('Defina EMAIL_TESTE_PARA com o endereço que deve receber a mensagem.');
    process.exit(1);
  }

  if (!forma) {
    console.error('Sem RESEND_API_KEY nem SMTP_URL — não há para onde enviar.');
    console.error('Defina RESEND_API_KEY com a chave re_... que o Resend deu (só a chave,');
    console.error('nada mais). Ver docs/PASSO-A-PASSO-EMAIL.md.');
    process.exit(1);
  }

  if (!remetente) {
    console.error('EMAIL_REMETENTE não está definida.');
    console.error('Ela precisa usar um domínio já verificado no provedor, ou a mensagem é recusada.');
    process.exit(1);
  }

  console.log(`Saída por: ${descreverSemVazar(forma)}`);
  console.log(`Remetente: ${remetente}`);
  console.log(`Para:      ${para}`);
  console.log('');

  const email = montarEmailDeVerificacao('Teste', para, LINK_FALSO);

  if (forma.via === 'RESEND') await porResend(forma.chave, remetente, email);
  else await porSmtp(forma.url, remetente, email);

  console.log('');
  console.log('Aceito não é entregue. Confira a caixa de entrada E o spam.');
  console.log('Se caiu no spam, faltam os registros de DNS do domínio no provedor.');
}

void main();
