# Pendências

Dívidas conscientes assumidas durante a construção. Cada uma tem o passo em que
deve ser paga. Não apagar item sem resolver — mover para "Resolvidas".

## Abertas

### 2. Teste roda contra o banco de desenvolvimento
**Assumida em:** B2
**Estado:** os e2e criam e apagam usuários no mesmo Neon usado para desenvolver.
Usam sufixo único por execução, então não colidem entre si.
**Por quê:** evitar montar um segundo banco antes de existir o que testar.
**Pagar em:** antes do CI (fim da Fase 0). O Neon tem branches — criar um branch
`test` e apontar `DATABASE_URL` de teste para ele.

### 4. Rate limit ausente
**Assumida em:** B2
**Estado:** `/auth/login` aceita tentativas ilimitadas.
**Por quê:** rate limit distribuído precisa de Redis, que chega no C8.
**Pagar em:** C8. Enquanto isso, argon2id já torna força bruta cara.

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

### 10. Push nao entrega de verdade (driver de log)
**Assumida em:** C8
**Estado:** todo o agendamento funciona — horario no fuso do aluno, dias da
semana, deduplicacao, "nao lembrar quem ja treinou". A entrega usa o driver de
log: escreve no console em vez de mandar para o aparelho.
**Por que:** enviar exige projeto no Firebase e credencial.
**Pagar em:** quando o Firebase existir. Trocar o provider de ENVIADOR por uma
implementacao com o SDK do FCM; nenhuma regra de agendamento muda.

### 11. Scheduler roda dentro do processo da API
**Assumida em:** C8
**Estado:** a varredura de lembretes usa @nestjs/schedule, a cada minuto, no
mesmo processo da API.
**Consequencia:** com varias instancias, todas varrem. E seguro (a unique
(userId, tipo, referenteA) impede envio duplicado, e ha teste para isso), mas
desperdica consulta ao banco.
**Pagar em:** quando houver Redis — mover para BullMQ com job unico.

### 12. Suite de testes lenta contra o Neon gratuito
**Assumida em:** Fase 2 (chat)
**Estado:** a suite leva ~4 minutos. Sob carga, uma requisicao chega a 10s
porque o compute gratuito do Neon escala a zero e limita. O timeout do vitest
subiu para 90s so para lentidao de infra nao ser lida como bug.
**Sintoma ja observado:** dois testes falharam por timeout numa rodada e
passaram na seguinte, sem mudanca de codigo.
**Pagar em:** junto com a pendencia 2 — branch de teste no Neon, e depois
Postgres local no CI.

### 13. Testes ainda apagam medidas da Ana
**Assumida em:** Fase 2
**Estado:** o e2e de consentimento faz deleteMany de Medida para Ana e Bruno
no afterAll. Depois de rodar a suite, os graficos de composicao corporal ficam
vazios ate alguem semear de novo.
**Por que sobrou:** em C6 corrigi so o teste de execucao; o de consentimento e
os demais continuam usando as contas do seed.
**Pagar em:** mesma correcao da pendencia 2 — cada teste cria o proprio aluno.

### 14. A web so tem teste do menu
**Assumida em:** Prescricoes
**Estado:** apps/web ganhou vitest, mas o unico arquivo testado e `lib/menu.ts`
(logica pura). Nenhum componente e renderizado em teste — nao ha jsdom nem
testing-library instalados. Toda verificacao de tela ate agora foi operando o
navegador na mao.
**Por que aceitei:** o que quebrou de verdade nesta fase foi regra em dado
(`ItemDeMenu.papeis` existia no tipo e nunca era aplicado — Medicamentos
aparecia para a nutricionista). Teste de logica pega isso; teste de render nao
pegaria mais barato.
**Risco:** regressao de formulario passa despercebida — por exemplo, o editor
de posologia enviar string vazia onde o schema espera ausencia.
**Pagar em:** quando existir o segundo formulario com a mesma complexidade do
`EditorDeItensPrescritos`, instalar jsdom + testing-library e cobrir os dois.

### 15. E-mail de produção depende de uma SMTP_URL que ainda não existe
**Assumida em:** verificação de e-mail
**Estado:** o driver SMTP está escrito e é escolhido sozinho quando `SMTP_URL`
está definida. Sem ela, o `CorreioDeLog` imprime a mensagem no log — que é o
comportamento certo em dev e **inaceitável em produção**: ninguém receberia o
link e ninguém conseguiria entrar.
**Pagar em:** no deploy. Contratar o provedor (Resend, SES, Postmark…), colar a
URL em `SMTP_URL` e `EMAIL_REMETENTE` nas variáveis do Railway, e conferir que
`WEB_PUBLIC_URL` aponta para o domínio real — é ela que monta o link.
**Como verificar:** cadastrar uma conta e receber o e-mail de fato.

### 16. Falha de SMTP é engolida
**Assumida em:** verificação de e-mail
**Estado:** `CorreioSmtp.enviar` captura o erro e apenas registra no log. Um
cadastro com provedor fora do ar responde 201 como se tudo tivesse dado certo, e
a pessoa fica esperando um e-mail que não vem.
**Por que aceitei:** a alternativa imediata era derrubar o cadastro já gravado
no banco por causa de uma falha externa, o que é pior. O reenvio na tela de
entrada é a saída manual.
**Pagar em:** quando existir fila (Redis, pendência 11) — enfileirar o envio com
retentativa em vez de tentar uma vez dentro da requisição.

### 17. `COOKIE_SAMESITE` precisa virar `none` se web e API não forem do mesmo site
**Assumida em:** cookie httpOnly
**Estado:** o cookie sai com `SameSite=Lax`, que só acompanha requisições
same-site. Porta não conta para "site", então `localhost:3000` → `localhost:3333`
funciona, e em produção funciona se forem subdomínios do mesmo domínio
(`app.viviofit.com.br` e `api.viviofit.com.br`).
**Risco:** hospedar a web na Vercel e a API no Railway são sites diferentes — o
cookie simplesmente não é enviado e ninguém mantém sessão. A env
`COOKIE_SAMESITE=none` cobre o caso, **mas** `None` desliga a proteção CSRF que
o `Lax` dava de graça: aí `/auth/refresh` e `/auth/logout` passam a precisar de
token anti-CSRF.
**Pagar em:** na decisão de hospedagem. Preferir domínios irmãos e continuar com
`Lax` é mais simples e mais seguro do que implementar anti-CSRF.

### 18. Imagens Docker nunca foram construídas
**Assumida em:** preparação do deploy
**Estado:** `apps/api/Dockerfile` e `apps/web/Dockerfile` estão escritos, mas
esta máquina não tem Docker — nenhum `docker build` rodou.
**O que foi verificado sem ele:** os comandos que as imagens executam
(`turbo run build --filter=@vivio/api` e `--filter=@vivio/web`), a geração do
bundle standalone do Next e sua execução real em `apps/web/server.js`, a recusa
da API a subir sem `ORIGENS_PERMITIDAS`, e o CORS respondendo só à origem
conhecida.
**O que continua sem prova:** o `pnpm install --frozen-lockfile` dentro do
contêiner, o `prisma generate` com o engine linkado contra a OpenSSL da imagem
slim, e os caminhos dos `COPY`.
**Pagar em:** no primeiro deploy — o log do Railway aponta a linha exata se algo
estiver errado.

### 19. Mídia em disco de contêiner é apagada a cada deploy
**Assumida em:** preparação do deploy (dívida que existia sem estar registrada)
**Estado:** o driver de armazenamento padrão grava em `MEDIA_DIR`, no disco
local. Em desenvolvimento isso é o certo. No Railway o sistema de arquivos do
contêiner é efêmero: **cada deploy apaga as fotos de evolução dos alunos**, e o
banco fica com registros apontando para arquivos que não existem mais.
**Por que só apareceu agora:** o driver foi feito com a abstração pronta para
S3 desde o começo, e em desenvolvimento nada some — o problema só existe onde o
contêiner é recriado.
**Pagar em:** antes de qualquer usuário real subir foto. Criar bucket (Cloudflare
R2 tem 10 GB grátis e não cobra egresso), implementar o driver S3 na interface
que já existe e apontar por variável — nenhum serviço muda.
**Enquanto isso:** avisar quem testar que as fotos são descartáveis.

### 20. "Receba Fácil" depende de conta em gateway de pagamento
**Assumida em:** telas restantes
**Estado:** o item continua `em-construcao` no menu. É a cobrança automática —
gerar PIX/boleto, receber confirmação, repassar. Não dá para construir de
verdade sem conta em gateway (Pagar.me, Asaas, Stripe), que exige CNPJ,
contrato e taxas negociadas.
**O que já funciona sem ele:** o Controle financeiro registra o combinado e o
recebido — quem pagou, quem deve, quanto entrou. É controle manual, e resolve
para quem cobra por PIX direto.
**Pagar em:** quando existir a conta. O trabalho é webhook de confirmação +
conciliação com a `Cobranca` que já existe — o modelo de dados não muda.

## Resolvidas

### Verificação de profissional ganhou painel — resolvida em 2026-07-30
**Era:** `verificadoEm` era **lido** (`vinculos.service.ts` barra quem não foi
verificado) mas nada no app o **escrevia** — só o seed. A primeira conta criada
em produção nascia travada, sem convidar aluno nenhum e sem saída pela
interface. O contorno era rodar `prisma/ativar-profissional.ts` no servidor a
cada cadastro novo.
**Correção:** `/admin/profissionais` com fila por status (aguardando, verificados,
recusados), busca, e link direto para a consulta pública do CONFEF/CFN/CFM. A
aprovação pede confirmação dizendo o que está em jogo — "esta pessoa passa a
acessar dados de saúde de alunos" — e grava **quem** aprovou, agora com foreign
key de verdade (`verificadoPor`), fechando também a metade do schema que estava
aberta. A recusa exige motivo de ao menos 5 caracteres e o guarda: o
profissional precisa saber o que corrigir. Aprovar depois de recusar limpa a
recusa; recusar depois de aprovar revoga a verificação.
**Verificado:** 12 testes e2e — inclusive que o personal não abre o painel, que
o profissional não se autoverifica, e o que realmente importa: **antes da
aprovação o convite a aluno é recusado, depois passa**. E operado no navegador
pelos três estados.
**Detalhe que o teste pegou:** eu esperava 403 no convite de profissional não
verificado; o código responde 409 CONFLITO — que é mais correto, porque o papel
está certo e o que falta é a verificação. O teste foi corrigido para afirmar o
comportamento real.
**Script mantido:** `ativar-profissional.ts` continua no repositório como saída
de emergência, caso não exista nenhum admin acessível.

### Refresh token saiu do localStorage — resolvida em 2026-07-30
**Era:** `apps/web` guardava access e refresh em `localStorage`. Um XSS lia o
refresh de 30 dias e mantinha a sessão indefinidamente.
**Correção:** o refresh passou a viajar em cookie `httpOnly`, `SameSite=Lax`,
`Path=/api/v1/auth`, e é **removido do corpo** da resposta — deixá-lo ali
tornaria o cookie inútil. O access token de 15 minutos vive só na memória do
`VivioClient`; ao recarregar a página o SDK troca o cookie por um par novo
sozinho. Quem pede esse modo é o cliente, pelo cabeçalho `X-Vivio-Cliente: web`;
sem ele a API responde como antes, que é o que o mobile precisa (SecureStore =
Keychain/Keystore, fora do alcance do JavaScript, e sem cookie jar).
**Efeito no ataque:** um XSS na web pega no máximo 15 minutos de access token,
em vez de 30 dias renováveis.
**Detalhe que só o teste pegou:** o `cookieParser` estava no `main.ts`, por onde
os testes não passam — teste e produção rodavam configurações diferentes.
Passou para `AppModule.configure`.
**Verificado:** 27 testes em `auth.e2e.spec.ts` (cookie httpOnly com os
atributos certos, rotação só com cookie, recusa sem cookie e sem corpo, cookie
apagado quando a rotação falha, logout revogando pelo cookie, e o mobile
continuando a receber no corpo) e, no navegador, login → `localStorage` vazio e
`document.cookie` vazio → reload mantendo a sessão → logout derrubando de vez.
**Ainda aberto:** pendência 17 — a escolha de hospedagem decide se `Lax` basta.

### Verificação de e-mail não bloqueava o login — resolvida em 2026-07-30
**Era:** a conta nascia com `emailVerifEm = null` e nada era bloqueado. Pior: o
próprio cadastro já devolvia o par de tokens, então quem usasse o e-mail de
outra pessoa entrava na hora e nunca precisava do link.
**Correção:** `TokenVerificacaoEmail` guarda só o hash (mesmo tratamento do
refresh), vale 24h e serve uma vez só; pedir outro invalida o anterior, com 60s
de intervalo mínimo entre envios. O cadastro passou a responder
`RespostaRegistro` **sem tokens** e o login recusa com `EMAIL_NAO_VERIFICADO`
(403, depois de conferir a senha — antes disso vazaria quais e-mails existem).
Confirmar o link já abre a sessão, porque abrir o link prova a posse do e-mail.
O driver de envio segue o padrão do push: `CorreioDeLog` sem `SMTP_URL`,
`CorreioSmtp` com ela.
**Migração:** contas anteriores foram marcadas como verificadas — trancá-las
retroativamente não protegeria ninguém e derrubaria todo mundo.
**Verificado:** 21 testes em `auth.e2e.spec.ts` (bloqueio, link inventado, link
usado duas vezes, expirado, reenvio invalidando o anterior, reenvio que não
revela se o e-mail existe) e o fluxo inteiro operado no navegador.
**Ainda aberto:** pendências 15 e 16 — falta a credencial de SMTP e a
retentativa de envio.

### Testes e2e mutavam os dados do seed — resolvida em C6
**Era:** os e2e usavam as contas do seed. O teste de execução ativava um plano
próprio (arquivando o da Ana) e, pior, qualquer treino feito no app virava "a
última execução" e quebrava as asserções da coluna ANTERIOR — suíte instável.
**Correção:** `execucao.e2e.spec.ts` cria o próprio aluno (registro + vínculo +
consentimento) no `beforeAll` e apaga tudo dele no `afterAll`.
**Verificado:** duas rodadas seguidas, 77 testes passando nas duas.
**Ainda aberto:** os demais e2e continuam usando o seed (ver pendência 2).
