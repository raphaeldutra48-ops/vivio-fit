# Pendências

Dívidas conscientes assumidas durante a construção. Cada uma tem o passo em que
deve ser paga. Não apagar item sem resolver — mover para "Resolvidas".

## Abertas

### 1. Verificação de e-mail não bloqueia o login
**Assumida em:** B2
**Estado:** conta de aluno nasce `ATIVA` com `emailVerifEm = null`. A API devolve
`usuario.emailVerificado: false`, mas nada é bloqueado.
**Por quê:** confirmar e-mail exige serviço de envio, que só entra junto com o
push (C8). Bloquear agora deixaria o ambiente de desenvolvimento inutilizável.
**Pagar em:** C8, junto com a infraestrutura de notificação.
**Risco enquanto aberta:** cadastro com e-mail de terceiro. Baixo em dev, **não
aceitável em produção** — não lançar sem isso.

### 2. Teste roda contra o banco de desenvolvimento
**Assumida em:** B2
**Estado:** os e2e criam e apagam usuários no mesmo Neon usado para desenvolver.
Usam sufixo único por execução, então não colidem entre si.
**Por quê:** evitar montar um segundo banco antes de existir o que testar.
**Pagar em:** antes do CI (fim da Fase 0). O Neon tem branches — criar um branch
`test` e apontar `DATABASE_URL` de teste para ele.

### 3. `PerfilProfissional.verificadoPorId` sem relação declarada
**Assumida em:** B1
**Estado:** guarda o id do admin que verificou, mas sem foreign key.
**Por quê:** evitar uma terceira relação `User -> User` no schema antes de existir
a tela de verificação do admin.
**Pagar em:** quando o painel admin de verificação for construído.

### 4. Rate limit ausente
**Assumida em:** B2
**Estado:** `/auth/login` aceita tentativas ilimitadas.
**Por quê:** rate limit distribuído precisa de Redis, que chega no C8.
**Pagar em:** C8. Enquanto isso, argon2id já torna força bruta cara.

### 5. Tokens no localStorage (web)
**Assumida em:** C3
**Estado:** `apps/web` guarda access e refresh token em `localStorage`.
**Por quê:** simples e suficiente para desenvolver; cookie httpOnly exigiria o
backend emitindo `Set-Cookie` e tratamento de CSRF.
**Risco:** XSS na web consegue ler o refresh token de 30 dias.
**Pagar em:** antes do lançamento. Migrar o refresh token para cookie httpOnly
+ SameSite=Lax e manter só o access token em memória.

### 6. Reordenação por arrastar não implementada
**Assumida em:** C3
**Estado:** a montagem de treino reordena exercícios com botões ↑ ↓.
**Por quê:** funciona com teclado e leitor de tela sem biblioteca extra; o
arrastar é polimento, não requisito do fluxo.
**Pagar em:** quando a tela receber acabamento visual (pós-C4).

## Resolvidas

_(nada ainda)_
