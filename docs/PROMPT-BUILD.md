# PROMPT DE CONSTRUÇÃO — VÍVIO FIT

> Documento de engenharia derivado da Especificação Completa do Vívio Fit.
> Serve como **prompt-mestre** para o Claude Code: cole a seção relevante no início de
> cada sessão de trabalho, junto com a Fase que está sendo implementada.

---

## 0. Como usar este documento

1. **Sessão de setup (uma vez):** cole as seções 1 → 7 e peça o scaffold.
2. **Cada fase:** cole as seções 1, 3, 5, 8 + a subseção da fase em 10.
3. **Cada tarefa isolada:** cole a seção 9 (regras) + o trecho do modelo de dados envolvido.

Regra de ouro: **nunca peça "implemente o app"**. Peça um vertical slice por vez
(migração → serviço → endpoint → tela → teste), nessa ordem.

---

## 1. Contexto do produto (resumo executivo para o agente)

Vívio Fit é um super-app de saúde e performance que conecta **aluno**, **personal
trainer**, **nutricionista** e **médico** no mesmo ambiente, com histórico auditável e
evolução visual. O diferencial competitivo é que **os três profissionais do mesmo aluno se
comunicam entre si dentro do app** — nenhuma decisão de arquitetura pode quebrar isso.

Consequências técnicas diretas desse diferencial:

- O aluno é a **raiz de agregação**. Quase toda entidade clínica pende de `alunoId`.
- Existe uma **equipe de cuidado** (care team) por aluno, não relações 1-1 isoladas.
- Compartilhamento de dado entre profissionais é **opt-in por escopo**, com registro de
  consentimento e trilha de auditoria (LGPD, dado sensível de saúde — art. 11).

Público e plataforma:

| Persona | Plataforma principal | Padrão de uso |
|---|---|---|
| Aluno | Mobile | Diário, curto, muitas vezes offline (dentro da academia) |
| Personal / Nutri / Médico | Web | Sessões longas, muitos alunos, telas densas |
| Admin | Web | Curadoria, credenciamento, financeiro |

---

## 2. Stack técnica (decidida — não reabrir sem motivo)

| Camada | Escolha | Motivo |
|---|---|---|
| Monorepo | **pnpm workspaces + Turborepo** | Compartilhar tipos entre api/web/mobile sem publicar pacote |
| Backend | **NestJS (TypeScript)** + REST + OpenAPI | Modularidade por domínio, DI, guards de RBAC nativos |
| ORM / DB | **Prisma + PostgreSQL 16** | Migrações versionadas, tipos gerados, RLS possível depois |
| Web | **Next.js 15 (App Router) + React 19 + TailwindCSS + shadcn/ui** | SSR para painel profissional, ecossistema maduro |
| Mobile | **Expo (React Native) + expo-router** | Um código iOS/Android, OTA update, boa história offline |
| Offline mobile | **WatermelonDB** (ou SQLite + fila de sync) | Tela de treino precisa funcionar sem rede |
| Estado/dados | **TanStack Query** (web e mobile) | Cache, retry, invalidação — cai bem no modelo offline-first |
| Validação | **Zod** em `packages/contracts` | Mesmo schema valida no backend e no client |
| Auth | **JWT (access 15min + refresh 30d rotativo)** + OAuth Google/Apple | Refresh rotativo com detecção de reuso |
| Storage de mídia | **S3-compatible** (AWS S3 ou Cloudflare R2) + CloudFront/CDN | Vídeo de exercício e foto de evolução; **URLs sempre pré-assinadas e de curta duração** |
| Fila / jobs | **BullMQ + Redis** | Lembretes, envio de push, transcodificação de vídeo, cobrança |
| Push | **Firebase Cloud Messaging** | iOS + Android com um SDK |
| Chat | **Socket.io** sobre o próprio backend (Fase 2) | Evita custo de terceiro; mensagens persistem no Postgres |
| Vídeo | **Daily.co** (fallback: Twilio Video) — Fase 4 | Não construir WebRTC do zero |
| Pagamentos | **Pagar.me** (split nativo BR) — Fase 4 | Split app/profissional já resolvido no gateway |
| Observabilidade | **Pino** (log estruturado) + **Sentry** + OpenTelemetry | Rastrear erro sem vazar dado clínico |
| Testes | **Vitest** (unit) + **Supertest** (e2e API) + **Playwright** (web) | |
| Infra local | **Docker Compose** (postgres, redis, minio, mailhog) | Dev sem depender de cloud |

### Versões-alvo

Node 20+ (ambiente atual: v24), pnpm 9+, PostgreSQL 16, Redis 7.

---

## 3. Estrutura de pastas (criar exatamente assim)

```
vivio-fit/
├─ apps/
│  ├─ api/                          # NestJS
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma
│  │  │  ├─ migrations/
│  │  │  └─ seed.ts
│  │  ├─ src/
│  │  │  ├─ main.ts
│  │  │  ├─ app.module.ts
│  │  │  ├─ common/
│  │  │  │  ├─ guards/              # JwtAuthGuard, RolesGuard, CareLinkGuard, ConsentGuard
│  │  │  │  ├─ decorators/          # @Roles, @CurrentUser, @RequiresConsent
│  │  │  │  ├─ interceptors/        # AuditInterceptor, PhiRedactionInterceptor
│  │  │  │  ├─ filters/             # HttpExceptionFilter
│  │  │  │  └─ pipes/               # ZodValidationPipe
│  │  │  ├─ modules/
│  │  │  │  ├─ auth/
│  │  │  │  ├─ users/
│  │  │  │  ├─ care-links/          # vínculo aluno ↔ profissional
│  │  │  │  ├─ consents/            # LGPD
│  │  │  │  ├─ audit/
│  │  │  │  ├─ exercises/
│  │  │  │  ├─ workouts/            # planos, sessões, logs, feedback
│  │  │  │  ├─ nutrition/           # dieta, refeições, água, alimentos
│  │  │  │  ├─ measurements/        # peso, medidas, fotos de evolução
│  │  │  │  ├─ clinical/            # anamnese, condições, exames, alertas cruzados
│  │  │  │  ├─ messaging/           # chat aluno↔prof e equipe clínica
│  │  │  │  ├─ library/             # artigos
│  │  │  │  ├─ notifications/       # push, lembretes, agendamento
│  │  │  │  ├─ gamification/        # streaks, conquistas, desafios
│  │  │  │  ├─ wearables/
│  │  │  │  ├─ marketplace/         # ofertas, agenda, bookings, videochamada, reviews
│  │  │  │  ├─ billing/             # planos, assinaturas, pagamentos, split
│  │  │  │  ├─ gyms/                # academias parceiras, check-in
│  │  │  │  └─ media/               # upload pré-assinado S3
│  │  │  └─ infra/                  # prisma.service, redis, s3, fcm, queue
│  │  └─ test/
│  ├─ web/                          # Next.js — profissionais + admin
│  │  ├─ app/
│  │  │  ├─ (auth)/login/
│  │  │  ├─ (pro)/
│  │  │  │  ├─ alunos/[alunoId]/    # treino | dieta | clinico | evolucao | chat
│  │  │  │  ├─ agenda/
│  │  │  │  ├─ consultorias/
│  │  │  │  └─ metricas/
│  │  │  └─ (admin)/
│  │  │     ├─ profissionais/       # verificação de CREF/CRN/CRM
│  │  │     ├─ academias/           # credenciamento
│  │  │     ├─ biblioteca/
│  │  │     └─ financeiro/
│  │  ├─ components/
│  │  └─ lib/
│  └─ mobile/                       # Expo — aluno
│     ├─ app/
│     │  ├─ (tabs)/                 # inicio | treino | nutricao | evolucao | mais
│     │  ├─ treino/[sessionId]/     # execução, funciona offline
│     │  ├─ chat/
│     │  └─ consultoria/
│     ├─ src/db/                    # WatermelonDB schema + sync
│     └─ src/components/
├─ packages/
│  ├─ contracts/                    # Zod schemas + tipos + enums compartilhados
│  ├─ ui/                           # design system web (tokens + componentes)
│  ├─ ui-native/                    # design system mobile
│  ├─ sdk/                          # client HTTP tipado (gerado do OpenAPI)
│  └─ config/                       # eslint, tsconfig, tailwind preset
├─ infra/
│  ├─ docker/docker-compose.yml
│  └─ terraform/                    # Fase 4
├─ docs/
│  ├─ ESPECIFICACAO.md              # o documento original de produto
│  ├─ PROMPT-BUILD.md               # este arquivo
│  ├─ ADR/                          # decisões de arquitetura
│  └─ LGPD.md                       # mapa de dado sensível e base legal
├─ turbo.json
├─ pnpm-workspace.yaml
└─ .env.example
```

---

## 4. Modelo de dados

Prisma. Todos os IDs são `String @id @default(cuid())`. Todas as tabelas têm `criadoEm`
e `atualizadoEm`. Entidades clínicas nunca são deletadas fisicamente — usar
`deletadoEm DateTime?` (soft delete) para preservar histórico auditável.

### 4.1 Identidade e vínculo

```prisma
enum Papel { ALUNO PERSONAL NUTRICIONISTA MEDICO ADMIN ACADEMIA }
enum StatusConta { PENDENTE_VERIFICACAO ATIVA SUSPENSA DESATIVADA }

model User {
  id            String       @id @default(cuid())
  email         String       @unique
  senhaHash     String?      // null quando login é só social
  nome          String
  telefone      String?
  avatarUrl     String?
  papel         Papel
  status        StatusConta  @default(PENDENTE_VERIFICACAO)
  emailVerifEm  DateTime?
  ultimoLoginEm DateTime?
  // relações...
}

model PerfilAluno {
  userId          String   @id
  dataNascimento  DateTime
  sexoBiologico   String?          // relevante para cálculo metabólico
  alturaCm        Int?
  objetivo        String?          // HIPERTROFIA | EMAGRECIMENTO | SAUDE | PERFORMANCE
  nivelAtividade  String?
  timezone        String   @default("America/Sao_Paulo")
}

model PerfilProfissional {
  userId           String   @id
  tipo             Papel            // PERSONAL | NUTRICIONISTA | MEDICO
  registroConselho String           // CREF / CRN / CRM
  ufRegistro       String
  especialidades   String[]
  bio              String?
  verificadoEm     DateTime?        // admin valida o registro antes de liberar
  notaMedia        Decimal? @db.Decimal(3,2)
  totalAvaliacoes  Int      @default(0)
}

enum StatusVinculo { PENDENTE ATIVO ENCERRADO RECUSADO }

/// Vínculo de cuidado: quem atende quem. É a base de TODA autorização de acesso.
model Vinculo {
  id             String        @id @default(cuid())
  alunoId        String
  profissionalId String
  tipo           Papel         // redundante com o perfil, mas facilita índice/consulta
  status         StatusVinculo @default(PENDENTE)
  iniciadoEm     DateTime?
  encerradoEm    DateTime?
  @@unique([alunoId, profissionalId])
  @@index([profissionalId, status])
}
```

**Regra de negócio:** um aluno pode ter no máximo **1 vínculo ATIVO por tipo** de
profissional (1 personal + 1 nutri + 1 médico). Trocar de profissional encerra o vínculo
anterior mas **não apaga** o histórico gerado por ele.

### 4.2 LGPD — consentimento e auditoria

```prisma
enum EscopoDado { TREINO NUTRICAO CLINICO EVOLUCAO MENSAGENS }

/// Consentimento explícito do aluno para compartilhar um escopo de dado.
/// Sem registro ATIVO aqui, o backend NEGA a leitura, mesmo com vínculo ativo.
model Consentimento {
  id             String     @id @default(cuid())
  alunoId        String
  escopo         EscopoDado
  profissionalId String?    // null = vale para toda a equipe de cuidado
  finalidade     String     // texto exibido ao aluno no momento do aceite
  versaoTermo    String
  concedidoEm    DateTime   @default(now())
  revogadoEm     DateTime?
  ipOrigem       String?
  @@index([alunoId, escopo, revogadoEm])
}

/// Trilha de auditoria. Toda leitura/escrita de dado clínico gera uma linha.
model LogAuditoria {
  id           String   @id @default(cuid())
  atorId       String
  acao         String   // LER | CRIAR | ATUALIZAR | REMOVER | EXPORTAR
  recursoTipo  String
  recursoId    String?
  alunoId      String?  // titular do dado — permite relatório "quem viu meus dados"
  ip           String?
  userAgent    String?
  metadata     Json?    // NUNCA conteúdo clínico; só identificadores
  criadoEm     DateTime @default(now())
  @@index([alunoId, criadoEm])
  @@index([atorId, criadoEm])
}
```

### 4.3 Treino

```prisma
enum EscopoExercicio { GLOBAL PRIVADO }

model Exercicio {
  id            String          @id @default(cuid())
  nome          String
  grupoMuscular String
  equipamento   String?
  videoUrl      String?         // chave S3; URL pré-assinada só na entrega
  thumbUrl      String?
  instrucoes    String?
  escopo        EscopoExercicio @default(PRIVADO)
  criadoPorId   String?
  @@index([grupoMuscular])
}

enum StatusPlano { RASCUNHO ATIVO ARQUIVADO }

model PlanoTreino {
  id         String      @id @default(cuid())
  alunoId    String
  personalId String
  nome       String
  objetivo   String?
  versao     Int         @default(1)   // ajustar plano cria versão nova, não sobrescreve
  status     StatusPlano @default(RASCUNHO)
  inicioEm   DateTime?
  fimEm      DateTime?
}

model SessaoTreino {          // "Treino A", "Treino B"...
  id          String @id @default(cuid())
  planoId     String
  nome        String
  ordem       Int
  diaSugerido Int?            // 1=segunda ... 7=domingo
}

model ItemTreino {
  id               String  @id @default(cuid())
  sessaoId         String
  exercicioId      String
  ordem            Int
  series           Int
  repsAlvo         String  // "8-12", "até a falha", "30s"
  cargaSugeridaKg  Decimal? @db.Decimal(6,2)
  descansoSeg      Int?
  tecnica          String? // drop-set, bi-set, rest-pause...
  observacao       String?
  supersetGrupo    String? // itens com o mesmo valor são executados em série
}

model ExecucaoTreino {        // um treino realizado
  id            String    @id @default(cuid())
  alunoId       String
  sessaoId      String
  iniciadoEm    DateTime
  finalizadoEm  DateTime?
  duracaoSeg    Int?
  origem        String    @default("APP")  // APP | OFFLINE_SYNC
  clienteUuid   String    @unique          // idempotência do sync offline
  sincronizadoEm DateTime?
}

model SerieExecutada {
  id            String   @id @default(cuid())
  execucaoId    String
  itemTreinoId  String
  serieNum      Int
  repsFeitas    Int
  cargaKg       Decimal  @db.Decimal(6,2)
  rpe           Int?     // 1-10
  falhou        Boolean  @default(false)
}

model FeedbackTreino {
  id          String  @id @default(cuid())
  execucaoId  String  @unique
  dificuldade Int     // 1-5
  teveDor     Boolean @default(false)
  localDor    String?
  sensacao    String?
  comentario  String?
}
```

### 4.4 Nutrição

```prisma
model Alimento {
  id             String  @id @default(cuid())
  nome           String
  porcaoPadraoG  Int     @default(100)
  kcal           Decimal @db.Decimal(7,2)
  proteinaG      Decimal @db.Decimal(6,2)
  carboidratoG   Decimal @db.Decimal(6,2)
  gorduraG       Decimal @db.Decimal(6,2)
  fibraG         Decimal? @db.Decimal(6,2)
  sodioMg        Decimal? @db.Decimal(7,2)
  fonte          String   @default("TACO")  // TACO | TBCA | CUSTOM
  @@index([nome])
}

model PlanoDieta {
  id              String      @id @default(cuid())
  alunoId         String
  nutricionistaId String
  nome            String
  kcalAlvo        Int?
  proteinaAlvoG   Int?
  carboAlvoG      Int?
  gorduraAlvoG    Int?
  versao          Int         @default(1)
  status          StatusPlano @default(RASCUNHO)
  inicioEm        DateTime?
  fimEm           DateTime?
}

model Refeicao {
  id              String @id @default(cuid())
  planoDietaId    String
  nome            String   // Café da manhã, Pré-treino...
  horarioSugerido String   // "07:30"
  ordem           Int
}

model ItemRefeicao {
  id           String  @id @default(cuid())
  refeicaoId   String
  alimentoId   String
  quantidadeG  Decimal @db.Decimal(7,2)
  observacao   String?
}

model SubstituicaoAlimento {
  id                  String  @id @default(cuid())
  itemRefeicaoId      String
  alimentoAlternativoId String
  quantidadeG         Decimal @db.Decimal(7,2)
  motivo              String?  // "sem lactose", "equivalência proteica"
}

enum StatusRefeicao { FEITA PARCIAL PULADA }

model RegistroRefeicao {
  id         String         @id @default(cuid())
  alunoId    String
  refeicaoId String
  data       DateTime       @db.Date
  status     StatusRefeicao
  fotoUrl    String?
  comentario String?
  @@unique([alunoId, refeicaoId, data])
}

model MetaAgua {
  id            String   @id @default(cuid())
  alunoId       String
  metaMlDia     Int
  definidoPorId String?
  vigenteDe     DateTime @default(now())
}

model RegistroAgua {
  id           String   @id @default(cuid())
  alunoId      String
  data         DateTime @db.Date
  volumeMl     Int
  registradoEm DateTime @default(now())
  @@index([alunoId, data])
}
```

### 4.5 Evolução

```prisma
enum FonteMedida { MANUAL BIOIMPEDANCIA WEARABLE }
enum AnguloFoto  { FRENTE LADO COSTAS }

model Medida {
  id                String      @id @default(cuid())
  alunoId           String
  data              DateTime    @db.Date
  pesoKg            Decimal?    @db.Decimal(5,2)
  percentualGordura Decimal?    @db.Decimal(4,1)
  massaMagraKg      Decimal?    @db.Decimal(5,2)
  cinturaCm         Decimal?    @db.Decimal(5,1)
  quadrilCm         Decimal?    @db.Decimal(5,1)
  bracoCm           Decimal?    @db.Decimal(5,1)
  coxaCm            Decimal?    @db.Decimal(5,1)
  toraxCm           Decimal?    @db.Decimal(5,1)
  fonte             FonteMedida @default(MANUAL)
  @@unique([alunoId, data])
}

model FotoEvolucao {
  id           String     @id @default(cuid())
  alunoId      String
  data         DateTime   @db.Date
  chaveArquivo String     // chave S3 privada; NUNCA URL pública
  angulo       AnguloFoto
  visivelPara  Papel[]    @default([])  // aluno controla quem vê
}
```

### 4.6 Módulo médico

```prisma
enum TipoCondicao  { LESAO DOENCA ALERGIA MEDICAMENTO CIRURGIA }
enum Severidade    { BAIXA MEDIA ALTA CRITICA }

model Anamnese {
  id        String   @id @default(cuid())
  alunoId   String
  medicoId  String?  // pode ser auto-preenchida pelo aluno no onboarding
  versao    Int      @default(1)
  dados     Json     // questionário estruturado versionado
  criadoEm  DateTime @default(now())
}

model CondicaoSaude {
  id            String       @id @default(cuid())
  alunoId       String
  tipo          TipoCondicao
  descricao     String
  cid10         String?
  regiaoCorpo   String?      // alimenta o alerta cruzado para o personal
  severidade    Severidade   @default(MEDIA)
  ativa         Boolean      @default(true)
  registradoPorId String
  @@index([alunoId, ativa])
}

model Exame {
  id            String   @id @default(cuid())
  alunoId       String
  enviadoPorId  String
  tipoExame     String
  dataExame     DateTime @db.Date
  chaveArquivo  String   // S3 privado, criptografado em repouso
  mimeType      String
  tamanhoBytes  Int
  observacao    String?
}

/// Alerta cruzado: o coração do diferencial do produto.
/// Ex.: colesterol alto → alerta para o NUTRICIONISTA.
///      lesão de joelho → alerta para o PERSONAL.
model AlertaClinico {
  id           String     @id @default(cuid())
  alunoId      String
  origemTipo   String     // CONDICAO_SAUDE | EXAME | FEEDBACK_TREINO
  origemId     String
  destinoPapel Papel
  severidade   Severidade
  titulo       String
  descricao    String
  criadoPorId  String?    // null = gerado por regra automática
  reconhecidoEm DateTime?
  reconhecidoPorId String?
  @@index([alunoId, destinoPapel, reconhecidoEm])
}
```

### 4.7 Comunicação

```prisma
enum TipoConversa  { ALUNO_PROFISSIONAL EQUIPE_CLINICA }
enum TipoMensagem  { TEXTO ARQUIVO SISTEMA }

model Conversa {
  id      String        @id @default(cuid())
  tipo    TipoConversa
  alunoId String        // toda conversa orbita um aluno
}

model ParticipanteConversa {
  conversaId String
  userId     String
  entrouEm   DateTime @default(now())
  saiuEm     DateTime?
  @@id([conversaId, userId])
}

model Mensagem {
  id           String       @id @default(cuid())
  conversaId   String
  autorId      String
  tipo         TipoMensagem @default(TEXTO)
  corpo        String?
  chaveArquivo String?
  enviadaEm    DateTime     @default(now())
  @@index([conversaId, enviadaEm])
}

model LeituraMensagem {
  mensagemId String
  userId     String
  lidaEm     DateTime @default(now())
  @@id([mensagemId, userId])
}
```

> **Atenção LGPD:** na conversa `EQUIPE_CLINICA` o aluno **não é participante**, mas
> precisa ter concedido consentimento de escopo `MENSAGENS` para que ela exista. O app
> deve deixar isso explícito para o aluno no aceite ("seus profissionais poderão trocar
> mensagens sobre seu acompanhamento").

### 4.8 Biblioteca, gamificação, notificação, wearables

```prisma
model Artigo {
  id          String   @id @default(cuid())
  titulo      String
  slug        String   @unique
  resumo      String
  corpoMd     String
  categoria   String
  tags        String[]
  fonteUrl    String?
  autor       String?
  premium     Boolean  @default(false)
  publicadoEm DateTime?
}
model ArtigoFavorito { userId String; artigoId String; @@id([userId, artigoId]) }

enum TipoStreak { TREINO AGUA REFEICAO }
model Streak {
  alunoId          String
  tipo             TipoStreak
  atual            Int      @default(0)
  recorde          Int      @default(0)
  ultimaAtualizacao DateTime?
  @@id([alunoId, tipo])
}
model Conquista        { id String @id @default(cuid()); codigo String @unique; nome String; descricao String; iconeUrl String?; regra Json }
model ConquistaUsuario { userId String; conquistaId String; desbloqueadaEm DateTime @default(now()); @@id([userId, conquistaId]) }

model TokenDispositivo { id String @id @default(cuid()); userId String; token String @unique; plataforma String; ativo Boolean @default(true) }

enum TipoLembrete { TREINO REFEICAO AGUA CONSULTA MENSAGEM }
model ConfiguracaoLembrete {
  id       String       @id @default(cuid())
  alunoId  String
  tipo     TipoLembrete
  horarios String[]     // ["07:30","12:00"]
  canais   String[]     @default(["PUSH"])  // PUSH | SMS | WHATSAPP
  ativo    Boolean      @default(true)
  @@unique([alunoId, tipo])
}

model Notificacao {
  id            String       @id @default(cuid())
  userId        String
  tipo          TipoLembrete
  titulo        String
  corpo         String
  deeplink      String?
  agendadaPara  DateTime?
  enviadaEm     DateTime?
  lidaEm        DateTime?
  @@index([userId, enviadaEm])
}

model ConexaoWearable {
  id            String   @id @default(cuid())
  alunoId       String
  provedor      String   // APPLE_HEALTH | GOOGLE_FIT | GARMIN | WHOOP
  tokenCifrado  String   // AES-256-GCM, chave em KMS/secret manager
  refreshCifrado String?
  escopos       String[]
  ultimaSyncEm  DateTime?
  @@unique([alunoId, provedor])
}

model MetricaSaude {
  id      String   @id @default(cuid())
  alunoId String
  tipo    String   // PASSOS | FC_REPOUSO | SONO_MIN | CALORIAS | VO2MAX
  valor   Decimal  @db.Decimal(10,2)
  data    DateTime @db.Date
  fonte   String
  @@unique([alunoId, tipo, data, fonte])
}
```

### 4.9 Marketplace de consultoria e billing

```prisma
enum ModalidadeServico { AVULSA PACOTE }
enum StatusAgendamento { PENDENTE_PAGAMENTO CONFIRMADO REALIZADO CANCELADO NO_SHOW }

model OfertaServico {
  id             String            @id @default(cuid())
  profissionalId String
  titulo         String
  descricao      String
  modalidade     ModalidadeServico
  sessoes        Int               @default(1)
  duracaoMin     Int               @default(50)
  precoCentavos  Int
  ativo          Boolean           @default(true)
}

model DisponibilidadeSlot {
  id             String @id @default(cuid())
  profissionalId String
  diaSemana      Int    // 0=domingo
  horaInicio     String // "09:00"
  horaFim        String // "18:00"
  timezone       String @default("America/Sao_Paulo")
}
model BloqueioAgenda { id String @id @default(cuid()); profissionalId String; inicioEm DateTime; fimEm DateTime; motivo String? }

model Agendamento {
  id             String            @id @default(cuid())
  ofertaId       String
  alunoId        String
  profissionalId String
  inicioEm       DateTime
  fimEm          DateTime
  status         StatusAgendamento @default(PENDENTE_PAGAMENTO)
  salaVideoId    String?           // id da sala no provedor (Daily.co)
  @@index([profissionalId, inicioEm])
}

model NotaConsulta {
  id              String  @id @default(cuid())
  agendamentoId   String
  autorId         String
  corpo           String
  visivelParaAluno Boolean @default(false)
}

model Avaliacao {
  id            String   @id @default(cuid())
  agendamentoId String   @unique
  alunoId       String
  nota          Int      // 1-5
  comentario    String?
}

model Plano {
  id            String @id @default(cuid())
  codigo        String @unique   // BASICO | INTERMEDIARIO | PREMIUM
  nome          String
  precoCentavos Int
  intervalo     String @default("MENSAL")
  limites       Json   // { maxProfissionais, redeAcademias, bibliotecaPremium, graficosAvancados }
}

model Assinatura {
  id        String   @id @default(cuid())
  alunoId   String
  planoId   String
  status    String   // ATIVA | INADIMPLENTE | CANCELADA | TRIAL
  gatewayId String?
  inicioEm  DateTime
  renovaEm  DateTime?
  canceladoEm DateTime?
}

model Pagamento {
  id                    String   @id @default(cuid())
  tipo                  String   // ASSINATURA | CONSULTORIA | CHECKIN
  referenciaId          String
  pagadorId             String
  valorCentavos         Int
  taxaAppCentavos       Int
  valorRecebedorCentavos Int
  status                String   // PENDENTE | PAGO | ESTORNADO | FALHOU
  gatewayId             String?  @unique
  metodo                String?
  @@index([pagadorId, status])
}

model ContaRecebimento { profissionalId String @id; gatewayRecipientId String; status String }
```

### 4.10 Academias parceiras (Fase 4)

```prisma
enum StatusAcademia { PENDENTE APROVADA SUSPENSA RECUSADA }
enum MetodoCheckIn  { TOKEN QR }

model Academia {
  id                String         @id @default(cuid())
  nome              String
  cnpj              String         @unique
  endereco          Json
  latitude          Decimal        @db.Decimal(10,7)
  longitude         Decimal        @db.Decimal(10,7)
  modalidades       String[]
  planoMinimo       String         // código do Plano exigido
  repasseCentavos   Int            // valor repassado por check-in
  status            StatusAcademia @default(PENDENTE)
  @@index([latitude, longitude])
}

model CheckIn {
  id          String        @id @default(cuid())
  alunoId     String
  academiaId  String
  metodo      MetodoCheckIn
  codigo      String        @unique
  expiraEm    DateTime
  validadoEm  DateTime?
  @@index([alunoId, validadoEm])
}
```

> **Diferencial a implementar:** ao validar um `CheckIn`, disparar job que registra
> frequência no histórico do aluno e a torna visível no painel de adesão do personal e do
> nutricionista. Isso é o que TotalPass/Wellhub não fazem.

---

## 5. Autorização — matriz de acesso (implementar como guards)

O acesso a qualquer recurso de um aluno exige **as três condições simultâneas**:

1. **Autenticação** válida (`JwtAuthGuard`).
2. **Vínculo** `ATIVO` entre o profissional e o aluno (`CareLinkGuard`) — ou o próprio
   aluno acessando seus dados.
3. **Consentimento** vigente do aluno para o escopo do recurso (`ConsentGuard`).

| Recurso | Aluno | Personal | Nutricionista | Médico | Admin |
|---|---|---|---|---|---|
| Plano de treino | ler | **CRUD** | ler | ler | — |
| Execução / carga | criar, ler | ler | ler | ler | — |
| Feedback de treino | criar, ler | ler | ler | ler | — |
| Plano de dieta | ler | ler | **CRUD** | ler | — |
| Água / refeições | CRUD | ler | ler | ler | — |
| Medidas e peso | criar, ler | ler | ler | ler | — |
| Fotos de evolução | **CRUD + controla visibilidade** | ver se autorizado | ver se autorizado | ver se autorizado | — |
| Anamnese | ler, preencher inicial | ler (resumo de restrições) | ler (resumo) | **CRUD** | — |
| Exames (arquivo) | ler, enviar | **negado** | **negado** | **CRUD** | — |
| Condições de saúde | ler | ler | ler | **CRUD** | — |
| Alerta clínico | — | ler os do seu papel | ler os do seu papel | criar, ler | — |
| Chat equipe clínica | **não participa** | participa | participa | participa | — |
| Verificação de conselho | — | — | — | — | **CRUD** |
| Academias / financeiro | — | — | — | — | **CRUD** |

Pontos que o agente **não pode** afrouxar:

- Personal e nutricionista **nunca** acessam o PDF/imagem do exame. Recebem apenas o
  `AlertaClinico` derivado, escrito pelo médico ou por regra automática.
- Foto de evolução é servida por **URL pré-assinada com validade ≤ 5 minutos**, jamais por
  bucket público.
- Revogação de consentimento tem efeito **imediato**: invalidar cache e recusar na próxima
  requisição. Dado já visualizado permanece no log de auditoria.
- Todo acesso a recurso clínico passa pelo `AuditInterceptor`. Sem exceção.

---

## 6. Design system (tokens — usar em `packages/ui` e `packages/ui-native`)

```ts
export const cores = {
  primaria:      { 900:'#0B7A56', 700:'#0F9D6D', 500:'#22B981', 100:'#D7F2E7' },
  secundaria:    { 900:'#12293A', 700:'#173B5E', 500:'#1B3A4B', 100:'#DCE6EE' },
  acao:          { 700:'#E56A33', 500:'#FF7A45', 300:'#FF8C42', 100:'#FFE5D9' },
  neutro:        { 900:'#2B2E33', 600:'#6B7280', 300:'#D1D5DB', 50:'#FAFAFA' },
  feedback:      { sucesso:'#0F9D6D', alerta:'#F5A524', erro:'#E5484D', info:'#173B5E' },
} as const;

/// Cor por área — ajuda o usuário a se localizar dentro do app
export const areaTema = {
  treino:      cores.primaria[700],   // verde
  nutricao:    '#3AA8C1',             // azul-claro
  clinico:     cores.secundaria[700], // azul profundo
  consultoria: cores.acao[500],       // laranja
} as const;
```

Regras visuais:

- Botão de ação primária (**treinar, agendar, comprar consultoria**) sempre em **laranja**.
- Tela clínica sempre em **azul profundo** — sinaliza contexto médico e reduz o risco de o
  usuário confundir área.
- Contraste mínimo **AA (4.5:1)** para texto; validar `acao/500` sobre branco (usar
  `acao/700` para texto pequeno).
- Mobile: alvo de toque ≥ 44×44 pt. A tela de execução de treino é usada **com a mão suada,
  em pé, entre séries** — botões grandes, fonte grande, mínimo de digitação.
- Suportar tema claro e escuro desde o começo (definir tokens semânticos, não cores cruas
  nos componentes).

---

## 7. Convenções de API

- Base: `/api/v1`. Respostas em JSON, `camelCase`.
- Paginação por cursor: `?cursor=&limit=` → `{ dados: [], proximoCursor: string|null }`.
- Erros: `{ erro: { codigo: 'CONSENTIMENTO_AUSENTE', mensagem: '...', detalhes?: {} } }`.
- Datas: **ISO 8601 com timezone**. Datas puras (`@db.Date`) como `YYYY-MM-DD`.
- Toda escrita vinda do mobile aceita `clienteUuid` para **idempotência** (crítico no sync
  offline: reenviar não pode duplicar treino).
- OpenAPI gerado automaticamente pelo Nest → `packages/sdk` gerado a partir dele.
- Rate limit: 100 req/min por usuário; 10/min em auth e upload.

### Endpoints principais por módulo (esqueleto)

```
POST   /auth/registrar | /auth/login | /auth/refresh | /auth/logout
POST   /auth/oauth/:provedor

GET    /me
PATCH  /me

POST   /vinculos/convidar          # profissional convida aluno (ou vice-versa)
PATCH  /vinculos/:id/aceitar | /recusar | /encerrar
GET    /vinculos/meus-alunos       # carteira do profissional

GET    /consentimentos             # o aluno vê o que compartilha e com quem
POST   /consentimentos             # conceder
DELETE /consentimentos/:id         # revogar (efeito imediato)
GET    /auditoria/meus-acessos     # "quem viu meus dados" — direito LGPD

GET    /exercicios?grupo=&q=
POST   /exercicios                 # personal cria exercício privado
POST   /media/upload-url           # URL pré-assinada de upload (vídeo/foto)

GET    /alunos/:alunoId/planos-treino
POST   /alunos/:alunoId/planos-treino
PATCH  /planos-treino/:id          # gera nova versão
GET    /sessoes/:id                # payload completo p/ cache offline
POST   /execucoes                  # idempotente por clienteUuid
POST   /execucoes/:id/series
POST   /execucoes/:id/feedback
GET    /alunos/:alunoId/exercicios/:exercicioId/historico-carga

GET    /alunos/:alunoId/planos-dieta
POST   /alunos/:alunoId/planos-dieta
GET    /alimentos?q=
POST   /registros-refeicao
POST   /agua                       # registro por toque
GET    /agua?de=&ate=
PUT    /agua/meta

POST   /alunos/:alunoId/medidas
GET    /alunos/:alunoId/medidas?de=&ate=
POST   /alunos/:alunoId/fotos      # aluno controla visibilidade
GET    /alunos/:alunoId/fotos

GET    /alunos/:alunoId/anamnese
POST   /alunos/:alunoId/anamnese
POST   /alunos/:alunoId/condicoes
POST   /alunos/:alunoId/exames     # somente médico e o próprio aluno
GET    /alertas?naoLidos=true      # filtrado pelo papel do requisitante
PATCH  /alertas/:id/reconhecer

GET    /conversas
GET    /conversas/:id/mensagens
POST   /conversas/:id/mensagens
WS     /ws  (eventos: mensagem:nova, mensagem:lida, alerta:novo)

GET    /artigos?categoria=&q=
POST   /artigos/:id/favoritar

GET    /profissionais/:id/ofertas
POST   /ofertas
GET    /profissionais/:id/disponibilidade?de=&ate=
POST   /agendamentos
GET    /agendamentos/:id/sala      # token de entrada na videochamada
POST   /agendamentos/:id/nota
POST   /agendamentos/:id/avaliacao

GET    /planos
POST   /assinaturas
POST   /webhooks/pagamento         # verificar assinatura HMAC do gateway

GET    /academias?lat=&lng=&raio=&modalidade=
POST   /academias/:id/checkin      # gera token/QR
POST   /checkins/:codigo/validar   # recepção da academia valida
```

---

## 8. Requisitos transversais obrigatórios

**Segurança e LGPD**
- Senha com **argon2id**. Refresh token rotativo com detecção de reuso (revoga a família).
- Dado clínico criptografado em repouso (Postgres com disco cifrado + campos sensíveis de
  token de wearable com AES-256-GCM em nível de aplicação).
- **Nenhum dado clínico em log, em mensagem de erro, ou em Sentry.** O
  `PhiRedactionInterceptor` remove campos de uma denylist antes de qualquer serialização
  de log.
- Exportação de dados do titular (`GET /me/exportar`, JSON + mídias) e exclusão de conta
  com anonimização (preserva agregados estatísticos sem identificação).
- Termo de consentimento **versionado**: mudar o termo exige novo aceite.

**Offline-first (mobile, tela de treino)**
- Ao abrir o app com rede: baixar plano ativo + vídeos das próximas sessões para cache local.
- Execução, séries e feedback gravam **primeiro no SQLite local**, com fila de sync.
- Sync ao voltar a rede, com idempotência por `clienteUuid` e resolução de conflito
  **last-write-wins por campo**, exceto séries executadas (sempre append-only).
- Indicador visível de "não sincronizado" na UI.

**Performance**
- p95 < 300 ms nos endpoints de leitura de treino/dieta.
- Histórico de carga por exercício é consulta quente → índice composto
  `(alunoId, exercicioId, data)` e cache Redis de 5 min.
- Vídeo entregue por CDN, transcodificado para 720p H.264 + thumbnail no upload (job BullMQ).

**Qualidade**
- Cobertura mínima: **90% nos guards de autorização e nas regras de consentimento**
  (é o ponto de maior risco jurídico), 70% no restante.
- Teste e2e obrigatório por fase: "profissional sem vínculo/consentimento recebe 403".
- CI: lint + typecheck + testes + `prisma migrate diff` em cada PR.

---

## 9. Regras para o agente durante a implementação

1. **Um vertical slice por vez.** Ordem fixa: migração Prisma → serviço → controller →
   teste e2e → tela. Não escreva UI antes do endpoint existir e passar no teste.
2. **Nunca desabilite um guard para "fazer funcionar".** Se um teste falha por
   autorização, o teste provavelmente está certo.
3. **Sem dado clínico em fixture de exemplo com nome real.** Use seeds anonimizados.
4. Toda alteração de schema entra por `prisma migrate dev --name <descricao>`. Nunca editar
   migração já aplicada.
5. Tipos compartilhados vivem em `packages/contracts`. Se um tipo é usado por api **e**
   web/mobile, ele não pode estar duplicado.
6. Comentários em português, código (identificadores) em português para termos de domínio
   (`planoTreino`, `alunoId`) e inglês para termos técnicos (`repository`, `guard`).
7. Ao terminar uma fase, atualizar `docs/ADR/` com as decisões tomadas e rodar a suíte
   completa antes de declarar a fase concluída.
8. Se uma decisão de produto estiver ambígua, **implemente a opção mais restritiva em
   privacidade** e registre a dúvida em `docs/PENDENCIAS.md`.

---

## 10. Ordem de implementação

### Fase 0 — Fundação (pré-requisito de tudo)

Entregar:
- Monorepo pnpm + Turborepo com os 3 apps e 5 packages criados e buildando.
- `docker-compose` com postgres, redis, minio, mailhog subindo.
- Prisma com os modelos de **4.1 e 4.2** migrados.
- Auth completa: registro, login, refresh rotativo, verificação de e-mail.
- `JwtAuthGuard`, `RolesGuard`, `CareLinkGuard`, `ConsentGuard`, `AuditInterceptor`.
- Design tokens em `packages/ui` e `packages/ui-native`.
- Seed: 1 admin, 1 personal verificado, 1 nutri, 1 médico, 3 alunos com vínculos.

**Critério de aceite:** existe um teste e2e provando que um profissional **com** vínculo mas
**sem** consentimento recebe `403 CONSENTIMENTO_AUSENTE` ao ler um recurso clínico, e que a
tentativa gerou linha em `LogAuditoria`.

---

### Fase 1 — MVP (treino)

Corresponde à Fase 1 da especificação de produto.

Escopo:
- Cadastro de aluno e personal + fluxo de convite/aceite de vínculo.
- Biblioteca de exercícios + upload de vídeo (URL pré-assinada + job de transcodificação).
- Montagem de plano de treino na **web** (personal): plano → sessões → itens, com
  reordenação por drag-and-drop.
- Execução de treino no **mobile** (aluno), **funcionando offline**.
- Histórico de carga por exercício: gráfico "atual vs anteriores".
- Feedback pós-treino (dificuldade, dor, sensação) chegando ao painel do personal.
- Lembrete de treino por push (FCM + BullMQ agendando pelo `ConfiguracaoLembrete`).
- Fotos de antes/depois com linha do tempo e controle de visibilidade pelo aluno.

**Critérios de aceite:**
1. Aluno completa um treino em modo avião; ao reconectar, os dados aparecem no painel do
   personal sem duplicação (reenviar o mesmo `clienteUuid` não cria segunda execução).
2. Gráfico de carga do supino mostra as 8 últimas execuções com progressão.
3. Personal ajusta o plano; o mobile do aluno recebe a versão nova no próximo sync, e a
   versão anterior continua consultável no histórico.
4. Push de lembrete chega no horário configurado, respeitando o timezone do aluno.

---

### Fase 2 — Nutrição e comunicação

Escopo:
- Modelos de **4.4** + base de alimentos (importar TACO como seed).
- Montagem de dieta na web pelo nutricionista, com cálculo automático de kcal/macros
  somando os itens.
- Substituições de alimento com equivalência nutricional (sugerir automaticamente
  alternativas dentro de ±10% de kcal e proteína).
- Contador de água com registro por toque, meta diária e **lembrete inteligente**
  ("sem registro há 3h dentro da janela ativa do aluno").
- Registro de peso e medidas + gráficos de evolução (peso, medidas, % gordura).
- Chat aluno ↔ profissional (Socket.io + persistência + push quando offline).
- Painel do profissional: carteira de alunos + métricas de adesão (quem não treinou nos
  últimos N dias, quem está abaixo da meta de água).

**Critérios de aceite:**
1. Nutricionista monta dieta de 2.200 kcal; o total exibido bate com a soma dos itens
   (tolerância de arredondamento ≤ 1 kcal).
2. Aluno recebe lembrete de água apenas se realmente ficou 3h sem registrar — teste com
   relógio simulado.
3. Mensagem enviada com o destinatário offline gera push e aparece como lida quando ele abre.
4. Personal **não** consegue editar a dieta (403), mas consegue lê-la se houver consentimento.

---

### Fase 3 — Módulo médico e biblioteca

Escopo:
- Modelos de **4.6** + fluxo de anamnese no onboarding do aluno.
- Upload de exames com storage privado e acesso restrito a médico + aluno.
- **Alertas cruzados** — o coração do diferencial. Implementar como motor de regras:
  - condição ativa do tipo `LESAO` com `regiaoCorpo` → alerta para `PERSONAL`;
  - condição/exame com marcador metabólico alterado → alerta para `NUTRICIONISTA`;
  - `FeedbackTreino` com `teveDor = true` em 2 execuções seguidas → alerta para
    `PERSONAL` e `MEDICO`.
- Chat de **equipe clínica** (os 3 profissionais, sem o aluno) — exige consentimento de
  escopo `MENSAGENS`.
- Biblioteca de conteúdo: CRUD admin, busca, categorias, favoritos.
- Tela "quem viu meus dados" para o aluno, lendo `LogAuditoria`.

**Critérios de aceite:**
1. Médico registra lesão no joelho; o personal vê o alerta no topo do painel daquele aluno
   **sem** ter acesso ao exame que originou a informação.
2. Aluno revoga consentimento `CLINICO`; na requisição seguinte o personal recebe 403 e o
   alerta some do painel.
3. A tela "quem viu meus dados" lista corretamente cada acesso, com ator, data e recurso.

---

### Fase 4 — Escala e monetização

Ordem interna sugerida (cada bloco é entregável independente):

**4a. Billing + consultoria online** (prioridade de receita, conforme seção 9 da
especificação)
- Planos, assinatura, gateway Pagar.me com webhook assinado.
- Marketplace: oferta de serviço, agenda, agendamento, pagamento com split.
- Videochamada via Daily.co com sala efêmera por agendamento e token de entrada.
- Nota pós-consulta + avaliação do profissional.

**4b. Gamificação**
- Streaks de treino e água, conquistas, desafios entre amigos com privacidade configurável.

**4c. Wearables**
- Apple Health, Google Fit, Garmin, Whoop → `MetricaSaude`.

**4d. Academias parceiras**
- Cadastro e aprovação de academia, mapa por geolocalização, check-in por token e QR,
  repasse por check-in, plano corporativo.
- **Amarrar ao diferencial:** check-in validado alimenta o histórico de frequência e
  aparece no painel de adesão do personal e do nutricionista.

**Critérios de aceite da fase:**
1. Compra de consultoria gera `Pagamento` com split correto (valor do profissional + taxa
   do app somam o valor pago) e o webhook é idempotente.
2. Reenvio do mesmo webhook do gateway não duplica o pagamento nem o agendamento.
3. Check-in validado em academia parceira aparece no painel do personal em < 1 min.

---

## 11. Pendências a resolver antes/durante a construção

1. **Disponibilidade do nome** — verificar `viviofit.com.br` e as lojas Apple/Google antes
   de investir em marca (a própria especificação recomenda isso).
2. **Registro de profissional de saúde** — definir se a verificação de CREF/CRN/CRM é
   manual (admin) no MVP. Recomendo manual: automatizar consulta a conselho é frágil.
3. **Responsabilidade clínica** — termos de uso precisam de revisão jurídica antes do
   lançamento do módulo médico. O app **não** pode prescrever nem diagnosticar; ele
   registra e comunica o que o profissional habilitado decidiu.
4. **Base legal LGPD** — dado de saúde é sensível (art. 11). O consentimento precisa ser
   destacado, específico por finalidade e revogável; isso já está modelado, mas o texto do
   termo é decisão jurídica, não técnica.
5. **Base de alimentos** — confirmar licença de uso da TACO/TBCA para fins comerciais.
6. **Prova de conceito de custo** — storage e CDN de vídeo é o maior custo variável do
   projeto. Estimar antes de abrir upload ilimitado para o personal.
