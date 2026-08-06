# Ligar o e-mail de verdade (pendência 15)

Hoje o Vívio Fit **não envia e-mail nenhum**. Quem tenta se cadastrar vê "confira
sua caixa de entrada", mas a mensagem só existe no log do contêiner. Na prática:
ninguém novo entra no app.

Isso não é um bug de código — é uma conta que ainda não foi criada. São 5 passos,
uns 20 minutos, e o único que pode demorar é a propagação de DNS no passo 2.

---

## Passo 1 — Criar a conta no Resend

1. Vá em **resend.com** e crie a conta (dá para entrar com o Google).
2. O plano gratuito manda **3.000 e-mails por mês, 100 por dia**. É de sobra para
   começar; um cadastro gasta 1.

**Por que Resend e não outro:** é o que tem menos burocracia para domínio próprio.
SES (Amazon) é mais barato em volume alto, mas começa numa "sandbox" que só envia
para endereços que você pré-aprovou, e sair dela é um pedido escrito que demora
dias. Você não tem volume alto ainda.

---

## Passo 2 — Verificar o domínio `viviofit.com.br`

Sem isto o Resend só deixa enviar para o seu próprio e-mail, e a mensagem chega
como `onboarding@resend.dev` — não como Vívio Fit.

1. No painel do Resend: **Domains** → **Add Domain**.
2. Digite `viviofit.com.br`.
3. Ele mostra uma tabela de registros DNS (uns 3: um `MX`, e dois `TXT` — SPF e
   DKIM).
4. **Não feche essa tela.** Abra o registro.br em outra aba, vá no seu domínio →
   **Editar zona DNS**, e adicione cada um deles — igualzinho aos 4 que você já
   adicionou para o app funcionar.
5. Volte no Resend e clique **Verify**. Pode levar de minutos a algumas horas,
   dependendo de quando o registro.br propaga.

**Me manda um print da tabela do Resend** que eu te digo exatamente o que
digitar em cada campo do registro.br, como fiz da outra vez.

> Sobre o DKIM: é a assinatura que prova que a mensagem saiu mesmo do
> viviofit.com.br. Sem ela, Gmail e Outlook jogam no spam ou recusam — não é
> opcional.

---

## Passo 3 — Criar a API key

1. No Resend: **API Keys** → **Create API Key**.
2. Nome: `vivio-producao`. Permissão: **Sending access**.
3. Ela aparece **uma única vez**, começando com `re_`.

⚠️ **Não cole essa chave aqui no chat.** Ela é a senha de envio: quem tiver ela
manda e-mail assinado como Vívio Fit para quem quiser. Se aparecer numa conversa,
já vale como vazada e tem que ser trocada. Guarde direto no Railway, no passo 4.

---

## Passo 4 — As variáveis no Railway

No serviço **@vivio/api** → aba **Variables**, uma variável só:

| Variável | Valor |
|---|---|
| `RESEND_API_KEY` | a chave `re_...`, colada inteira e sozinha |

Só a chave, sozinha. Nada de montar URL.

> **Por que não SMTP:** o Railway **bloqueia a saída na porta 587**. A tentativa
> morre em `Connection timeout`, que se parece com chave errada e não é —
> custou um deploy para descobrir. O envio vai pela API HTTP do Resend, na
> porta 443, que nenhuma plataforma bloqueia. Ver `formaDeEnvio` em
> `src/entrega-de-email.ts`.

`EMAIL_REMETENTE` já está configurada. Se um dia precisar mudar, ela tem de usar
o domínio **verificado no passo 2** — um `@gmail.com` ali faz o Resend recusar.

> `SMTP_URL` continua funcionando e ganha da chave quando as duas existem. É a
> saída para trocar de provedor sem tocar em código.

Depois **apague a variável `EMAIL_SEM_ENTREGA`**. Ela é a declaração de "eu sei
que ninguém consegue se cadastrar"; com o SMTP no lugar, ela só serviria para
esconder uma falha futura. Sem `SMTP_URL` e sem ela, a API se recusa a subir —
é proposital.

Clique **Deploy** para as variáveis valerem.

---

## Passo 5 — Conferir

Mesmo esquema das outras tarefas de instalação: **uma variável dispara e some**.

No Railway, adicione em **@vivio/api**:

| Variável | Valor |
|---|---|
| `EMAIL_TESTE_PARA` | `raphaeldutra48@gmail.com` |

Clique **Deploy**. Abra a aba **Deploy Logs** e procure a linha
`→ EMAIL_TESTE_PARA presente`. Logo abaixo vem, em ordem:

- `Conexão e credenciais: OK.` — a `SMTP_URL` está certa.
- `Aceito pelo servidor. id: ...` — o Resend recebeu a mensagem.
- e o lembrete de que **aceito não é entregue**: confira a caixa de entrada
  **e o spam**.

Se cair no spam, falta DNS do passo 2.

Se falhar, o log diz qual dos dois problemas é — "não conecta" (usuário/senha
ou porta errada) ou "conecta e recusa a mensagem" (quase sempre o domínio do
`EMAIL_REMETENTE` não verificado). São soluções diferentes.

**Depois apague `EMAIL_TESTE_PARA`**, ou todo deploy manda um e-mail de teste.

> O log nunca imprime a `SMTP_URL` — só protocolo, usuário e servidor. A chave
> não aparece.

Depois disso, o teste que vale: cadastrar uma conta nova em
`app.viviofit.com.br` e receber o link.

---

## O que já está pronto do meu lado

- A API **recusa subir** em produção sem `SMTP_URL` ou com `WEB_PUBLIC_URL`
  errada, em vez de subir e falhar calada.
- O nome digitado no cadastro não entra mais cru na mensagem. Quem se cadastra
  ainda não provou ser dono do endereço: dava para cadastrar o e-mail de outra
  pessoa, pôr um link de golpe no campo "nome", e a vítima receberia esse link
  dentro de um e-mail assinado pelo nosso domínio.
- O script de teste acima, para não precisar sujar a base tentando.
