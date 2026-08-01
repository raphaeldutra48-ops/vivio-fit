# Deploy — Vívio Fit

Passo a passo para colocar o app no ar com domínio próprio.

**Decisões já tomadas:** domínio `viviofit.com.br`; Railway hospeda a API e a
web; banco no Neon (já provisionado).

**Por que Railway nos dois:** `api.viviofit.com.br` e `app.viviofit.com.br`
são subdomínios do mesmo domínio, ou seja, *same-site*. É isso que faz o cookie
`SameSite=Lax` do refresh token funcionar sem precisar de token anti-CSRF. Web
na Vercel (`*.vercel.app`) e API no Railway (`*.railway.app`) seriam sites
diferentes e o cookie não seria enviado — ver pendência 17.

---

## 1. Registrar o domínio — passo manual do Raphael

`viviofit.com.br` estava **livre** na consulta RDAP de 2026-07-30. Livre hoje
não é reserva: quem registra primeiro fica com ele.

`.com.br` se registra no **[registro.br](https://registro.br)** — é o
registrador oficial, não há intermediário mais barato.

1. Criar a conta (CPF ou CNPJ; para `.com.br` não é exigido CNPJ).
2. Buscar `viviofit`, selecionar `.com.br`.
3. Pagar boleto ou PIX (~R$ 40/ano). **O domínio só passa a funcionar depois da
   compensação** — pode levar algumas horas.

Alternativas verificadas, também livres: `viviofit.app.br`, `appviviofit.com.br`.

Se for uso comercial sério, vale antes uma busca gratuita no
[INPI](https://busca.inpi.gov.br) — nome com marca de terceiro pode ser
contestado depois, e aí tudo abaixo teria de ser refeito.

---

## 2. Contas necessárias

| Serviço | Para quê | Plano |
|---|---|---|
| [Railway](https://railway.app) | API + web | Hobby (US$ 5/mês de crédito) |
| [Neon](https://neon.tech) | PostgreSQL | Já criado |
| [Resend](https://resend.com) | Envio de e-mail | 3.000/mês grátis |

**Sobre o e-mail:** sem isso ninguém confirma cadastro e ninguém entra
(pendência 15). O Resend exige verificar o domínio por DNS — os registros saem
no painel dele e entram no mesmo lugar do passo 5.

---

## 3. Subir o código para o GitHub

O Railway constrói a partir de um repositório.

```bash
git init && git add -A && git commit -m "Vívio Fit"
```

Depois crie o repositório **privado** no GitHub e faça o push. Privado importa:
o `.env` está no `.gitignore`, mas o schema do banco e as regras de negócio não
precisam ser públicos.

> Confira antes que `git status` não lista nenhum `.env`.

---

## 4. Criar os dois serviços no Railway

No mesmo projeto, **New → GitHub Repo**, apontando para o repositório. Crie
dois serviços a partir dele:

### Serviço `api`
- **Settings → Build → Dockerfile Path:** `apps/api/Dockerfile`
- **Settings → Build → Root Directory:** deixe vazio (a raiz do monorepo — o
  Dockerfile precisa do workspace inteiro para o pnpm resolver as dependências)
- **Settings → Deploy → Health Check Path:** `/api/v1/health`

### Serviço `web`
- **Dockerfile Path:** `apps/web/Dockerfile`
- **Root Directory:** vazio
- **Build Arg:** `NEXT_PUBLIC_API_URL=https://api.viviofit.com.br`

> `NEXT_PUBLIC_*` é embutido no JavaScript durante o build, não lido em runtime.
> Mudar a URL da API exige **reconstruir** a imagem da web, não só reiniciar.

---

## 5. Apontar o domínio

No Railway, em cada serviço: **Settings → Networking → Custom Domain**.

- serviço `api` → `api.viviofit.com.br`
- serviço `web` → `app.viviofit.com.br`

O Railway mostra um destino `CNAME` para cada um. No registro.br, em
**Editar Zona DNS**, crie:

| Nome | Tipo | Valor |
|---|---|---|
| `api` | CNAME | (o que o Railway mostrar) |
| `app` | CNAME | (o que o Railway mostrar) |

O certificado HTTPS é emitido sozinho depois que o DNS propaga (minutos a
algumas horas).

---

## 6. Variáveis de ambiente

### Serviço `api`

| Variável | Valor | Observação |
|---|---|---|
| `NODE_ENV` | `production` | desliga o `/docs` e liga o cookie `Secure` |
| `DATABASE_URL` | string do Neon (**pooler**) | cole direto no Railway, nunca no chat |
| `DIRECT_URL` | string do Neon (**sem** pooler) | usada pelas migrações |
| `JWT_ACCESS_SECRET` | gere novo | **não reaproveite o de desenvolvimento** |
| `JWT_REFRESH_SECRET` | gere novo | idem |
| `JWT_ACCESS_TTL` | `15m` | |
| `JWT_REFRESH_TTL` | `30d` | |
| `ORIGENS_PERMITIDAS` | `https://app.viviofit.com.br` | sem isto a API **não sobe** |
| `WEB_PUBLIC_URL` | `https://app.viviofit.com.br` | monta o link de confirmação |
| `API_PUBLIC_URL` | `https://api.viviofit.com.br` | monta as URLs de mídia |
| `COOKIE_SAMESITE` | `lax` | |
| `PROXY_HOPS` | `1` | sem ela o limite de login por IP vê um IP só (o do proxy) |
| `SMTP_URL` | do Resend | sem ela o e-mail só vai para o log |
| `EMAIL_REMETENTE` | `Vívio Fit <nao-responda@viviofit.com.br>` | |
| `LEMBRETES_ATIVOS` | `true` | |
| `MEDIA_DIR` | `./media` | ⚠️ disco efêmero — ver pendência 19 |

O modelo completo, com comentários, está em `apps/api/.env.producao.exemplo`.

Para gerar cada segredo:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Serviço `web`

| Variável | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `NEXT_PUBLIC_API_URL` | `https://api.viviofit.com.br` (também como build arg) |

---

## 7. Aplicativo do aluno

O `apps/mobile` **não** vai para o Railway. Antes de gerar o build, aponte a API
em `apps/mobile/app.json`, em `expo.extra.apiUrl`, para
`https://api.viviofit.com.br`. Publicar nas lojas é um passo à parte (conta de
desenvolvedor Apple US$ 99/ano, Google US$ 25 única vez).

---

## 8. Conferir depois de subir

1. `https://api.viviofit.com.br/api/v1/health` responde 200.
2. `https://api.viviofit.com.br/docs` responde **404** — a documentação não
   pode ficar exposta em produção.
3. Cadastre uma conta em `https://app.viviofit.com.br` e **receba o e-mail de
   verdade**. É o teste que prova a pendência 15 paga.
4. Confirme o link, entre, recarregue a página — a sessão precisa sobreviver
   (é o cookie httpOnly funcionando através do domínio real).
5. No console do navegador, `localStorage` e `document.cookie` vazios.

**Não subir foto de evolução que importe** enquanto a pendência 19 estiver
aberta: o disco do contêiner é apagado a cada deploy.

---

## O que ainda não foi verificado

As imagens Docker **não foram construídas** — esta máquina não tem Docker. O que
foi verificado aqui: os comandos de build que os Dockerfiles executam
(`turbo run build --filter=...`), a geração do bundle standalone do Next e sua
execução em `apps/web/server.js`, a recusa da API a subir sem
`ORIGENS_PERMITIDAS` e o CORS respondendo só para origem conhecida.

O primeiro `docker build` pode acusar algum caminho — é o risco conhecido deste
passo. Se acontecer, o log do Railway aponta a linha.
