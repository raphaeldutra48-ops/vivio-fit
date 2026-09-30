# Roteiro do primeiro teste com pessoas de verdade

Escrito em 30/09/2026, depois de operar as duas interfaces contra o banco real.

Este documento existe para uma coisa: **o primeiro teste com gente de fora não
pode ser o momento em que se descobre o que faltava**. Ele lista o que precisa
estar pronto antes, em que ordem testar, o que olhar em cada tela e o que fazer
quando algo falhar.

---

## 1. O que precisa estar pronto ANTES de convidar alguém

Em ordem de bloqueio. Os dois primeiros são impeditivos; sem eles o teste não
acontece.

### 1.1. SMTP próprio no Supabase — IMPEDITIVO

O serviço de e-mail embutido do Supabase tem limite baixo e **devolve 429 no
terceiro envio**. Foi medido: três cadastros, o primeiro passou, o terceiro
recebeu `over_email_send_rate_limit`. Sem SMTP próprio, a terceira pessoa que
tentar criar conta simplesmente não recebe o link — e o app diz a coisa certa
("o servidor não conseguiu responder agora"), mas ela não entra.

Onde: painel do Supabase → **Authentication → Emails → SMTP Settings**. Qualquer
provedor transacional serve (Resend, Postmark, SES, Brevo). O remetente precisa
ter SPF e DKIM configurados no domínio, senão o e-mail cai em spam — o que, na
prática, é o mesmo que não chegar.

**Como conferir que funcionou:** crie três contas seguidas com e-mails
diferentes. As três precisam receber o link. Se a terceira não receber, o SMTP
não está ativo (ou o limite é do provedor, não do Supabase).

### 1.2. Um APK instalável — IMPEDITIVO para o lado do aluno

O painel roda no navegador; o app do aluno, não. Sem build, o aluno só consegue
usar a versão web do Expo, que não tem câmera nem notificação.

```bash
cd apps/mobile
npx eas build -p android --profile preview
```

O perfil `preview` já está no `eas.json`, gera **APK** (não AAB) e usa canal
`preview` — é o que se instala direto no aparelho, sem loja. O build roda na
nuvem da Expo e leva de 10 a 25 minutos; o link do APK sai no fim.

### 1.3. Documentos legais preenchidos

`app/termos` e `app/privacidade` têm `[PREENCHER]` no lugar de razão social, CNPJ
e endereço. Enquanto estiverem assim, **ninguém de fora deveria criar conta**: o
cadastro pede aceite de um documento incompleto, e o formulário da página pública
coleta nome e telefone apontando para uma política que não diz quem é o
controlador dos dados.

### 1.4. Revisão clínica das faixas

As 20 faixas de marcadores de exame e as 8 regras de alerta não passaram por
revisão profissional. Enquanto não passarem, **não lance exame de pessoa real** —
o app vai opinar sobre o resultado, e a opinião não foi conferida por ninguém
habilitado. Cadastro, treino, dieta e check-in podem ser testados sem isso.

---

## 2. A decisão que muda tudo: qual banco

Hoje existe **um único projeto Supabase**, e as suítes rodam contra ele. Isso é
possível porque não há pessoa real cadastrada — e há uma guarda que confere isso
(`packages/banco/teste/guarda-de-producao.ts`) e recusa rodar se encontrar.

**No instante em que a primeira pessoa de verdade criar conta, as suítes param de
poder rodar contra esse banco.** A guarda vai recusar, e é isso que se quer: um
teste que apaga dados de teste não pode conviver com dado de gente.

Duas saídas, e a escolha é sua:

- **(a) Um segundo projeto Supabase só para teste.** É o certo a médio prazo:
  as suítes apontam para lá (`SUPABASE_POOLER_URL` no `.env.supabase` do
  `packages/banco`), e o projeto atual passa a ser só produção. Custa um projeto
  novo e uma aplicação de RLS (`pnpm --filter @vivio/banco rls:aplicar`).
- **(b) Manter um só, aceitando que as suítes de banco e de SDK ficam paradas.**
  As de contracts, web, mobile e ui continuam rodando (não tocam o banco) — são
  1.056 das 1.413 provas. Perde-se a verificação de RLS automatizada.

Recomendo **(a)** antes do primeiro convite, porque é mais barato fazer isso agora
do que descobrir depois que a única forma de rodar a suíte é apagar dado de
cliente.

---

## 3. A ordem do teste

### 3.1. Como profissional (painel, no navegador)

1. **Criar conta** em `/cadastrar` com o registro do conselho de verdade.
2. **Confirmar o e-mail** pelo link. Se o link não chegar, o problema é o 1.1.
3. **Verificar o registro:** entre como admin (`admin@viviofit.com.br`) em
   `/admin/profissionais` e confira o número no site do conselho antes de
   liberar. A tela repete registro, UF e nome na confirmação justamente para isso.
   **Sem esse passo o profissional não recebe aluno nem publica página.**
4. **Preencher o perfil** em `/cadastros/perfil`. Atenção: trocar o registro
   depois de verificado DERRUBA a verificação — a tela avisa, e o banco impõe.
5. **Convidar o aluno** em `/alunos`, pelo e-mail que a pessoa vai usar no app.

### 3.2. Como aluno (aplicativo, no celular)

6. **Instalar o APK** e criar conta com o mesmo e-mail do convite.
7. **Confirmar o e-mail** e entrar.
8. **Aceitar o convite** em *Minha equipe* — sem isso não há treino nem dieta, e
   a tela inicial explica exatamente isso.
9. **Autorizar o que vai compartilhar** em *O que eu compartilho*. Cada escopo é
   uma decisão separada: treino, evolução, nutrição. **Autorizar é um toque;
   retirar pergunta antes.**

### 3.3. O ciclo que prova que o produto funciona

10. Profissional **monta um treino** (`/alunos/{id}/treino/novo`).
11. Aluno **executa o treino** no app: digita carga e repetições, marca as séries,
    conclui. Teste de propósito com **vírgula** (`42,5`) — é o que o teclado
    brasileiro oferece.
12. Aluno **faz o check-in do dia**, inclusive um dia com "não treinei".
13. Profissional confere em `/alunos/{id}` e em `/feedback` se o treino e o
    check-in chegaram.
14. Profissional **monta a dieta** e o aluno **registra refeições e água**.
15. Aluno **envia uma foto de evolução** e libera para um profissional. Confira
    dos dois lados: quem não foi liberado não deve ver nada.
16. Profissional **cria uma cobrança** e gera o PIX em `/receba-facil`. O código
    é gerado pelo app, mas **o dinheiro não passa por aqui** — a tela diz isso.

---

## 4. O que olhar em cada tela

A pergunta é sempre a mesma: **a tela está afirmando algo que ela não sabe?**

- Frase de vazio ("nenhum...", "você ainda não tem...") só pode aparecer quando a
  busca DEU CERTO e veio vazia. Se aparecer junto de um aviso de erro, é defeito.
- Número zero é uma afirmação. "0 treinos" para quem treinou é pior que
  "não deu para buscar".
- Botão que não faz nada é defeito, mesmo sem erro na tela. Se clicar e nada
  acontecer, anote a tela e o que estava preenchido.
- Mensagem técnica ("Failed to fetch", "undefined") nunca deveria aparecer. Se
  aparecer, é caminho que escapou da varredura.

---

## 5. Quando algo falhar

1. **Console do navegador** (F12 → Console) e a aba Rede: o código HTTP diz de
   quem é o problema. 401/403 é autorização; 404 é ausência; 429 é limite; 5xx é
   servidor.
2. **Se for no ambiente local e parecer absurdo, limpe o cache do Next antes de
   investigar.** Em 30/09 perdi tempo com uma "falha" em que o nome do
   profissional não aparecia: era `.next` com um bundle de dois dias antes.
   `rm -rf apps/web/.next` e reinicie.
3. **Diagnóstico do banco:** `pnpm --filter @vivio/banco diagnostico` roda 18
   verificações contra o ambiente real (páginas no ar, RLS, cabeçalhos, rotina de
   lembrete, mídia órfã) e leva menos de um minuto.
4. **Auditoria de RLS:** `pnpm --filter @vivio/banco exec tsx prisma/auditar-rls.ts`
   diz se alguma tabela ou função ficou aberta.
5. **As suítes:** rodadas por CÓDIGO DE SAÍDA, não pelo resumo na tela. Um teste
   pode passar e a suíte reprovar por exceção não capturada:
   ```bash
   pnpm --filter @vivio/contracts test && pnpm --filter @vivio/ui test && \
   pnpm --filter @vivio/web test && pnpm --filter @vivio/mobile test && \
   pnpm --filter @vivio/banco run test:sem-banco
   ```

---

## 6. O que NÃO vai funcionar, e é esperado

- **Lembrete não chega ao celular.** A rotina do banco dispara e grava o aviso na
  caixa do app, mas não há push: falta `expo-notifications` e um build nativo
  (pendência 10). O lembrete aparece dentro do app, não na tela de bloqueio.
- **Pagamento não confirma sozinho.** Não há gateway: quem recebeu marca como
  pago (pendência 20).
- **Excluir conta não existe como botão.** A decisão envolve retenção de registro
  clínico e depende de revisão jurídica (pendência 27).
- **Dois deploys por push falham no Railway.** Integração antiga ainda conectada
  ao repositório; não afeta o app (pendência 28).

---

## 7. Depois do teste

Se o teste usou contas descartáveis e você quer devolver o banco ao estado de
semente, **não apague na mão**: `packages/banco/exportar` gera uma cópia antes, e
a ordem de restauração está resolvida lá. Apagar aluno sem cuidado deixa mídia
órfã no storage — o diagnóstico acusa, mas o arquivo continua pago.
