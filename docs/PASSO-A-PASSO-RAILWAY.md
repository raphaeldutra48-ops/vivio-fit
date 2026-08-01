# Subir o Vívio Fit — roteiro

Ordem pensada para **descobrir problema cedo e barato**: primeiro sobe nas URLs
provisórias do Railway e prova que as imagens Docker funcionam; só depois entra
o domínio. Se algum `docker build` quebrar (pendência 18), você descobre na
etapa 2, com o DNS ainda intocado.

> **O que vai parecer quebrado na etapa 2, e não está.** Nas URLs provisórias, a
> sessão **não sobrevive ao recarregar a página**. Isso é esperado:
> `up.railway.app` está na Public Suffix List, então `algo-api.up.railway.app` e
> `algo-web.up.railway.app` contam como **sites diferentes** para o navegador, e
> o cookie `SameSite=Lax` do refresh não é enviado. Some sozinho na etapa 4,
> quando `api.viviofit.com.br` e `app.viviofit.com.br` passam a ser o mesmo
> site. Até lá: login funciona, navegar funciona, recarregar derruba.

Tempo: ~45 min de trabalho, mais a propagação do DNS.

---

## Etapa 0 — Registrar o domínio (você, ~15 min)

Em [registro.br](https://registro.br): busque `viviofit.com.br`, registre
(~R$ 40/ano). Exige CPF e pagamento — é ação sua, com sua conta.

Não precisa esperar propagar para seguir: as etapas 1 a 3 não dependem dele.

---

## Etapa 1 — Código no GitHub ✔

Feito. `github.com/raphaeldutra48-ops/vivio-fit`, branch `main` em dia.

Daqui em diante, cada `git push` no `main` dispara um deploy novo no Railway.

---

## Etapa 2 — Criar os dois serviços (~10 min)

No Railway: **New Project → Deploy from GitHub repo → vivio-fit**.

Ele cria um serviço. Renomeie para **`api`** e ajuste em **Settings**:

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
| Build → Builder | `Dockerfile` |
| Build → Dockerfile Path | `apps/web/Dockerfile` |
| Build → Root Directory | *(vazio)* |

Em cada serviço, **Settings → Networking → Generate Domain**. Anote os dois
endereços; abaixo eles são `URL_API` e `URL_WEB`.

---

## Etapa 3 — Variáveis e primeiro deploy (~15 min)

### Gere os dois segredos

Rode duas vezes e guarde cada resultado:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> Não reaproveite os de desenvolvimento — eles já circularam nesta máquina.

### Serviço `api` → Variables

Cole tudo de uma vez (**Raw Editor** aceita várias linhas), trocando o que está
entre `<>`:

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
ADMIN_EMAIL=<seu e-mail>
ADMIN_SENHA=<uma senha sua, 12+ caracteres, com letra e número>
ADMIN_NOME=<seu nome>
SEMEAR_CATALOGO=true
```

As quatro últimas são **de instalação**. Com elas presentes, o contêiner cria o
administrador e popula exercícios e alimentos no start — e escreve no log o que
fez. Sem elas o app subiria funcionando e inútil: nenhum exercício para montar
treino, nenhum alimento para montar dieta.

`SMTP_URL` fica de fora por enquanto: sem ela o link de confirmação sai no log
do Railway, que é de onde você vai pegá-lo na etapa 5.

### Serviço `web` → Variables

```
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://<URL_API>
```

E em **Settings → Build → Build Args** (não é a mesma coisa que Variables):

```
NEXT_PUBLIC_API_URL=https://<URL_API>
```

> Precisa nos dois lugares: `NEXT_PUBLIC_*` é embutido no JavaScript durante o
> build. Se ficar só em Variables, a web sobe apontando para `localhost:3333` e
> nenhuma tela carrega.

### Deploy

Cada serviço → **Deploy**. O primeiro leva alguns minutos (instala o workspace
inteiro, mobile incluído — o pnpm precisa dele para o `--frozen-lockfile`).

No log da `api` você deve ver, nesta ordem:

```
→ aplicando migrações
→ ADMIN_EMAIL presente: criando o primeiro administrador
Admin criado: seu@email
→ SEMEAR_CATALOGO=true: populando exercícios e alimentos
Exercícios globais: 23
Alimentos: 45
API na porta 3333 — origens: https://<URL_WEB>
```

**Agora apague `ADMIN_EMAIL`, `ADMIN_SENHA`, `ADMIN_NOME` e `SEMEAR_CATALOGO`**
das variáveis. Senha em texto claro no painel é senha exposta a todo mundo que
tem acesso ao projeto. Os dois scripts são idempotentes — se rodarem de novo por
engano, não duplicam nada — mas não há motivo para deixá-los armados.

**Se algum build falhar:** copie as últimas ~30 linhas do log e me mande. As
imagens nunca foram construídas (esta máquina não tem Docker), então é o ponto
mais provável de tropeço.

---

## Etapa 4 — Domínio próprio (~10 min + propagação)

1. Railway → serviço `api` → **Networking → Custom Domain** →
   `api.viviofit.com.br`
2. Railway → serviço `web` → **Custom Domain** → `app.viviofit.com.br`
3. Cada um mostra um destino CNAME. No registro.br, **Editar Zona DNS**:

| Nome | Tipo | Valor |
|---|---|---|
| `api` | CNAME | o que o Railway mostrar |
| `app` | CNAME | o que o Railway mostrar |

4. No serviço `api`, troque os três endereços:

```
ORIGENS_PERMITIDAS=https://app.viviofit.com.br
WEB_PUBLIC_URL=https://app.viviofit.com.br
API_PUBLIC_URL=https://api.viviofit.com.br
```

5. No serviço `web`, troque `NEXT_PUBLIC_API_URL` **e o Build Arg** para
   `https://api.viviofit.com.br` → **redeploy** (build arg mudou, precisa
   reconstruir a imagem).

6. Me avise: eu aponto o app do aluno (`apps/mobile/app.json`,
   `expo.extra.apiUrl`) para o endereço novo.

O HTTPS é emitido sozinho depois que o DNS propaga (minutos a algumas horas).

**É aqui que a sessão passa a sobreviver ao recarregar** — `api.` e `app.` são
subdomínios de `viviofit.com.br`, mesmo site, e o cookie `Lax` volta a viajar.

---

## Etapa 5 — Conferir

| # | O quê | Esperado |
|---|---|---|
| 1 | `https://api.viviofit.com.br/api/v1/health` | 200 |
| 2 | `https://api.viviofit.com.br/docs` | **404** — a documentação não pode ficar exposta |
| 3 | Login em `app.viviofit.com.br` | entra |
| 4 | Recarregar a página | **a sessão sobrevive** |
| 5 | Console do navegador: `localStorage` e `document.cookie` | **vazios** |
| 6 | Errar a senha 11 vezes | a 11ª responde "Muitas tentativas. Aguarde 15 minutos" |
| 7 | `/admin/profissionais` com a conta admin | abre a fila de verificação |
| 8 | Cadastrar-se como profissional e aprovar pelo painel | passa a convidar aluno |

O passo 8 tem uma pegadinha: sem `SMTP_URL`, o link de confirmação de e-mail sai
no log (`api → Deployments → View Logs`, procure `[Correio]`). Copie e abra no
navegador.

> **Não suba foto de evolução que importe.** O disco do contêiner é apagado a
> cada deploy (pendência 19).

---

## Etapa 6 — E-mail de verdade (Resend, ~10 min)

Enquanto `SMTP_URL` não existir, todo cadastro depende de você pescar o link no
log. Para o app funcionar sozinho:

1. Conta em [resend.com](https://resend.com) — 3.000 e-mails/mês grátis.
2. **Domains → Add Domain → `viviofit.com.br`**.
3. O Resend mostra registros DNS (SPF, DKIM). Eles entram no registro.br, em
   **Editar Zona DNS**.
4. **API Keys → Create**. A chave vira:

```
SMTP_URL=smtp://resend:SUA_CHAVE_AQUI@smtp.resend.com:587
```

5. Cole em `api → Variables` e redeploy.

---

## O que continua pendente depois de tudo isso

| # | O quê | Consequência de deixar como está |
|---|---|---|
| 19 | Fotos gravam no disco do contêiner | somem a cada deploy — resolver antes de usuário real |
| 16 | Falha de SMTP é engolida | cadastro responde 201 e o e-mail não chega |
| 4b | Limite de tentativas é por processo | com mais de uma instância, o atacante ganha o dobro |
| 20 | Sem gateway | pagamento PIX é conferido no banco e marcado à mão (a tela já diz isso) |

Lista completa e atualizada em [PENDENCIAS.md](PENDENCIAS.md).

---

## Onde eu entro

- Build quebrado: me mande as últimas linhas do log
- Erro em runtime: idem, com a rota que falhou
- Depois do domínio no ar: eu aponto o app do aluno e revisamos a etapa 5 juntos

Segredos (senha do Neon, chave do Resend, JWT, senha do admin) vão **direto no
painel do Railway** — não passe por aqui.
