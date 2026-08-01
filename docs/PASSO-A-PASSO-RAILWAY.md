# Subir o Vívio Fit no Railway — roteiro

Ordem pensada para **descobrir problema cedo e barato**: primeiro sobe nas URLs
provisórias do Railway, prova que as imagens Docker funcionam, e só depois entra
o domínio. Se algum `docker build` quebrar (pendência 18), você descobre na
etapa 3, não com o DNS já apontado.

Funciona porque `algo-api.up.railway.app` e `algo-web.up.railway.app` são
subdomínios do mesmo domínio — *same-site* — então o cookie do login já se
comporta como vai se comportar no domínio final.

Tempo: ~40 min até estar no ar.

---

## Etapa 1 — Código no GitHub (~5 min)

**O repositório local já está pronto.** 31 commits na branch `main`, árvore
limpa, nenhum `.env` versionado em commit nenhum (conferido no histórico
inteiro). Falta só o repositório remoto — que depende da sua conta.

1. Em [github.com/new](https://github.com/new), crie `vivio-fit` como
   **Private**. Não marque nada em "Initialize this repository" — o histórico
   já existe aqui e um README criado lá causaria conflito.

2. Conecte e envie (troque `SEU-USUARIO`):

```bash
git remote add origin https://github.com/SEU-USUARIO/vivio-fit.git
```

```bash
git push -u origin main
```

O GitHub vai pedir autenticação. Se pedir senha, use um **Personal Access
Token** (Settings → Developer settings → Tokens), não a senha da conta — o
GitHub não aceita senha em push desde 2021.

> Privado importa: o schema do banco e as regras de negócio não precisam ser
> públicos. O `.env` está no `.gitignore` e nunca foi commitado, mas repositório
> público é superfície desnecessária.

---

## Etapa 2 — Criar os dois serviços (~10 min)

No Railway: **New Project → Deploy from GitHub repo → vivio-fit**.

Ele vai criar um serviço. Renomeie para **`api`** e configure em **Settings**:

| Campo | Valor |
|---|---|
| Build → Builder | `Dockerfile` |
| Build → Dockerfile Path | `apps/api/Dockerfile` |
| Build → Root Directory | *(vazio)* |
| Deploy → Health Check Path | `/api/v1/health` |

> Root Directory **vazio** é essencial: o Dockerfile precisa do monorepo inteiro
> para o pnpm resolver o workspace. Apontar para `apps/api` faz o build falhar.

Depois, no mesmo projeto: **New → GitHub Repo → o mesmo repositório**. Renomeie
para **`web`**:

| Campo | Valor |
|---|---|
| Build → Dockerfile Path | `apps/web/Dockerfile` |
| Build → Root Directory | *(vazio)* |

Em cada serviço, **Settings → Networking → Generate Domain**. Anote os dois
endereços; vamos chamá-los de `URL_API` e `URL_WEB`.

---

## Etapa 3 — Variáveis e primeiro deploy (~15 min)

### Gere os dois segredos

Rode duas vezes e guarde cada resultado:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> Não reaproveite os de desenvolvimento — eles já circularam nesta máquina.

### Serviço `api` → Variables

Cole tudo de uma vez (o Railway aceita colar várias linhas em **Raw Editor**),
trocando os valores marcados:

```
NODE_ENV=production
DATABASE_URL=<Neon, a string COM -pooler>
DIRECT_URL=<Neon, a string SEM -pooler>
JWT_ACCESS_SECRET=<primeiro segredo gerado>
JWT_REFRESH_SECRET=<segundo segredo gerado>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
COOKIE_SAMESITE=lax
PROXY_HOPS=1
ORIGENS_PERMITIDAS=https://<URL_WEB>
WEB_PUBLIC_URL=https://<URL_WEB>
API_PUBLIC_URL=https://<URL_API>
EMAIL_REMETENTE=Vívio Fit <nao-responda@viviofit.com.br>
LEMBRETES_ATIVOS=true
MEDIA_DIR=./media
```

`SMTP_URL` fica de fora por enquanto — sem ela o e-mail vai para o log do
Railway, que é onde você vai pegar o link na etapa 5.

### Serviço `web` → Variables

```
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://<URL_API>
```

E em **Settings → Build → Build Args** (não é variável comum):

```
NEXT_PUBLIC_API_URL=https://<URL_API>
```

> Precisa nos dois lugares: `NEXT_PUBLIC_*` é embutido no JavaScript durante o
> build. Se ficar só em Variables, a web sobe apontando para `localhost:3333` e
> nenhuma tela carrega.

### Deploy

Cada serviço → **Deploy**. O primeiro leva alguns minutos (instala o workspace
inteiro). A API roda `prisma migrate deploy` sozinha no start.

**Se algum build falhar:** copie as últimas ~30 linhas do log e me mande. As
imagens nunca foram construídas nesta máquina (sem Docker aqui), então é o
ponto mais provável de tropeço.

---

## Etapa 4 — Destravar a primeira conta

Aqui tem uma pegadinha que trava o app se você não souber.

O seed **não** roda em produção — de propósito: ele cria contas com senha
conhecida (`Senha@123`), que não podem existir num ambiente real.

Então:

1. Acesse `https://<URL_WEB>/cadastrar` e crie sua conta de profissional —
   escolha a profissão, informe o registro no conselho e a UF.

2. **Confirme o e-mail.** Sem `SMTP_URL`, o link sai no log: no Railway, serviço
   `api` → **Deployments → View Logs**, procure `[Correio]`. Copie a URL e abra
   no navegador.

3. **Ative o profissional.** Um profissional recém-criado nasce aguardando
   verificação do registro no conselho e **não consegue convidar aluno nenhum**.

   Como ainda não existe nenhum admin em produção, esta primeira vez é pelo
   terminal do Railway (**api → ⋮ → Run command**):

```bash
pnpm --filter @vivio/api exec tsx prisma/ativar-profissional.ts SEU@EMAIL
```

   Deve responder `Ativado: Raphael (PERSONAL) — CREF 000000/CE`.

   **Só a primeira vez.** Depois, com uma conta ADMIN no banco, a verificação é
   feita pela tela `/admin/profissionais`, que mostra a fila de quem aguarda,
   o registro declarado e um link para a consulta pública do conselho.

Agora entre em `https://<URL_WEB>` e você consegue convidar alunos.

---

## Etapa 5 — Conferir

1. `https://<URL_API>/api/v1/health` → **200**
2. `https://<URL_API>/docs` → **404** (a documentação não pode ficar exposta)
3. Login → recarregue a página → **a sessão sobrevive**
4. Console do navegador: `localStorage` e `document.cookie` **vazios**
5. Convide um aluno e aceite pelo app

> **Não suba foto de evolução que importe.** O disco do contêiner é apagado a
> cada deploy (pendência 19).

---

## Etapa 6 — E-mail de verdade (Resend)

Enquanto `SMTP_URL` não existir, todo cadastro depende de você pescar o link no
log. Para o app funcionar sozinho:

1. Conta em [resend.com](https://resend.com) — 3.000 e-mails/mês grátis.
2. **Domains → Add Domain → `viviofit.com.br`** (precisa do domínio já
   registrado).
3. O Resend mostra registros DNS (SPF, DKIM). Eles entram no registro.br, em
   **Editar Zona DNS**.
4. **API Keys → Create**. A chave vira:

```
SMTP_URL=smtp://resend:SUA_CHAVE_AQUI@smtp.resend.com:587
```

5. Cole em `api → Variables` e redeploy.

---

## Etapa 7 — Domínio próprio

Depois de registrar `viviofit.com.br` no registro.br:

1. Railway → serviço `api` → **Networking → Custom Domain** →
   `api.viviofit.com.br`
2. Railway → serviço `web` → **Custom Domain** → `app.viviofit.com.br`
3. Cada um mostra um destino CNAME. No registro.br, **Editar Zona DNS**:

| Nome | Tipo | Valor |
|---|---|---|
| `api` | CNAME | o que o Railway mostrar |
| `app` | CNAME | o que o Railway mostrar |

4. Atualize no serviço `api`: `ORIGENS_PERMITIDAS`, `WEB_PUBLIC_URL` e
   `API_PUBLIC_URL` para os endereços novos.
5. Atualize no serviço `web`: `NEXT_PUBLIC_API_URL` **e o Build Arg** →
   **redeploy** (build arg mudou, precisa reconstruir).
6. Aponte o app do aluno: `apps/mobile/app.json`, em `expo.extra.apiUrl`.

O HTTPS é emitido sozinho depois que o DNS propaga.

---

## Onde eu entro

- Build quebrado: me mande as últimas linhas do log
- Erro em runtime: idem, com a rota que falhou
- Depois do domínio no ar: eu ajusto o app do aluno e revisamos a lista da
  etapa 5 juntos

Segredos (senha do Neon, chave do Resend, JWT) vão **direto no painel do
Railway** — não passe por aqui.
