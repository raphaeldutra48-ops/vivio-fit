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


### 7. nodeLinker hoisted no workspace inteiro
**Assumida em:** C4
**Estado:** `pnpm-workspace.yaml` usa `nodeLinker: hoisted` por causa do Metro.
**Consequência:** o monorepo perde o isolamento estrito do pnpm — um pacote passa
a conseguir importar dependência que não declarou, e o erro só aparece no build
de produção.
**Mitigação atual:** `pnpm build` roda os 7 workspaces no CI e pegaria o caso.
**Alternativa futura:** isolar o mobile em workspace próprio, ou reavaliar quando
o Metro melhorar o suporte a symlinks.

### 8. React precisa da mesma versão exata em web e mobile
**Assumida em:** C4
**Estado:** `apps/web` e `apps/mobile` fixam `react`/`react-dom` em `19.2.3`.
**Por quê:** com nodeLinker hoisted, faixas diferentes (`^19.0.0` vs `19.2.3`)
geram duas cópias de React e o build da web quebra com
`Cannot read properties of null (reading 'useContext')`.
**Como aplicar:** ao atualizar o React, atualizar os dois apps juntos, na mesma
versão exata.

### 9. Offline: WatermelonDB trocado por cache + fila
**Assumida em:** C6
**Estado:** o modo offline usa `AsyncStorage` (cache do plano ativo e das
séries anteriores + fila de saída), não WatermelonDB como o plano previa.
**Por quê:** WatermelonDB exige *dev client* nativo — quebraria o Expo Go — e é
um motor de sincronização relacional bidirecional. A Fase 1 precisa de cache de
leitura e fila de escrita; a parte difícil (idempotência) já está no servidor.
**Reavaliar em:** quando houver edição offline de dados que o profissional também
edita (dieta, anotações), aí a resolução de conflito justifica o peso.

## Resolvidas

### Testes e2e mutavam os dados do seed — resolvida em C6
**Era:** os e2e usavam as contas do seed. O teste de execução ativava um plano
próprio (arquivando o da Ana) e, pior, qualquer treino feito no app virava "a
última execução" e quebrava as asserções da coluna ANTERIOR — suíte instável.
**Correção:** `execucao.e2e.spec.ts` cria o próprio aluno (registro + vínculo +
consentimento) no `beforeAll` e apaga tudo dele no `afterAll`.
**Verificado:** duas rodadas seguidas, 77 testes passando nas duas.
**Ainda aberto:** os demais e2e continuam usando o seed (ver pendência 2).
