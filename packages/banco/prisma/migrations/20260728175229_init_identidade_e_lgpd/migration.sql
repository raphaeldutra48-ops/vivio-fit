-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('ALUNO', 'PERSONAL', 'NUTRICIONISTA', 'MEDICO', 'ADMIN', 'ACADEMIA');

-- CreateEnum
CREATE TYPE "StatusConta" AS ENUM ('PENDENTE_VERIFICACAO', 'ATIVA', 'SUSPENSA', 'DESATIVADA');

-- CreateEnum
CREATE TYPE "StatusVinculo" AS ENUM ('PENDENTE', 'ATIVO', 'ENCERRADO', 'RECUSADO');

-- CreateEnum
CREATE TYPE "EscopoDado" AS ENUM ('TREINO', 'NUTRICAO', 'CLINICO', 'EVOLUCAO', 'MENSAGENS');

-- CreateEnum
CREATE TYPE "AcaoAuditoria" AS ENUM ('LER', 'CRIAR', 'ATUALIZAR', 'REMOVER', 'EXPORTAR', 'NEGADO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "avatarUrl" TEXT,
    "papel" "Papel" NOT NULL,
    "status" "StatusConta" NOT NULL DEFAULT 'PENDENTE_VERIFICACAO',
    "emailVerifEm" TIMESTAMP(3),
    "ultimoLoginEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerfilAluno" (
    "userId" TEXT NOT NULL,
    "dataNascimento" TIMESTAMP(3) NOT NULL,
    "sexoBiologico" TEXT,
    "alturaCm" INTEGER,
    "objetivo" TEXT,
    "nivelAtividade" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerfilAluno_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "PerfilProfissional" (
    "userId" TEXT NOT NULL,
    "tipo" "Papel" NOT NULL,
    "registroConselho" TEXT NOT NULL,
    "ufRegistro" TEXT NOT NULL,
    "especialidades" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bio" TEXT,
    "verificadoEm" TIMESTAMP(3),
    "verificadoPorId" TEXT,
    "notaMedia" DECIMAL(3,2),
    "totalAvaliacoes" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerfilProfissional_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Vinculo" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "profissionalId" TEXT NOT NULL,
    "tipo" "Papel" NOT NULL,
    "status" "StatusVinculo" NOT NULL DEFAULT 'PENDENTE',
    "convidadoPorId" TEXT NOT NULL,
    "iniciadoEm" TIMESTAMP(3),
    "encerradoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vinculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consentimento" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "escopo" "EscopoDado" NOT NULL,
    "profissionalId" TEXT,
    "finalidade" TEXT NOT NULL,
    "versaoTermo" TEXT NOT NULL,
    "concedidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revogadoEm" TIMESTAMP(3),
    "ipOrigem" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Consentimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAuditoria" (
    "id" TEXT NOT NULL,
    "atorId" TEXT NOT NULL,
    "acao" "AcaoAuditoria" NOT NULL,
    "recursoTipo" TEXT NOT NULL,
    "recursoId" TEXT,
    "alunoId" TEXT,
    "escopo" "EscopoDado",
    "ip" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessaoRefresh" (
    "id" TEXT NOT NULL,
    "familiaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "revogadoEm" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessaoRefresh_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_papel_status_idx" ON "User"("papel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PerfilProfissional_tipo_registroConselho_ufRegistro_key" ON "PerfilProfissional"("tipo", "registroConselho", "ufRegistro");

-- CreateIndex
CREATE INDEX "Vinculo_profissionalId_status_idx" ON "Vinculo"("profissionalId", "status");

-- CreateIndex
CREATE INDEX "Vinculo_alunoId_tipo_status_idx" ON "Vinculo"("alunoId", "tipo", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Vinculo_alunoId_profissionalId_key" ON "Vinculo"("alunoId", "profissionalId");

-- CreateIndex
CREATE INDEX "Consentimento_alunoId_escopo_revogadoEm_idx" ON "Consentimento"("alunoId", "escopo", "revogadoEm");

-- CreateIndex
CREATE INDEX "Consentimento_profissionalId_revogadoEm_idx" ON "Consentimento"("profissionalId", "revogadoEm");

-- CreateIndex
CREATE INDEX "LogAuditoria_alunoId_criadoEm_idx" ON "LogAuditoria"("alunoId", "criadoEm");

-- CreateIndex
CREATE INDEX "LogAuditoria_atorId_criadoEm_idx" ON "LogAuditoria"("atorId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "SessaoRefresh_tokenHash_key" ON "SessaoRefresh"("tokenHash");

-- CreateIndex
CREATE INDEX "SessaoRefresh_userId_revogadoEm_idx" ON "SessaoRefresh"("userId", "revogadoEm");

-- CreateIndex
CREATE INDEX "SessaoRefresh_familiaId_idx" ON "SessaoRefresh"("familiaId");

-- AddForeignKey
ALTER TABLE "PerfilAluno" ADD CONSTRAINT "PerfilAluno_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerfilProfissional" ADD CONSTRAINT "PerfilProfissional_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vinculo" ADD CONSTRAINT "Vinculo_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vinculo" ADD CONSTRAINT "Vinculo_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consentimento" ADD CONSTRAINT "Consentimento_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consentimento" ADD CONSTRAINT "Consentimento_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAuditoria" ADD CONSTRAINT "LogAuditoria_atorId_fkey" FOREIGN KEY ("atorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAuditoria" ADD CONSTRAINT "LogAuditoria_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessaoRefresh" ADD CONSTRAINT "SessaoRefresh_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
