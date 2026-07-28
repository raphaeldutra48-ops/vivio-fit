-- CreateEnum
CREATE TYPE "StatusRefeicao" AS ENUM ('FEITA', 'PARCIAL', 'PULADA');

-- CreateTable
CREATE TABLE "Alimento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "kcal" DECIMAL(7,2) NOT NULL,
    "proteinaG" DECIMAL(6,2) NOT NULL,
    "carboidratoG" DECIMAL(6,2) NOT NULL,
    "gorduraG" DECIMAL(6,2) NOT NULL,
    "fibraG" DECIMAL(6,2),
    "sodioMg" DECIMAL(7,2),
    "medidaCaseira" TEXT,
    "medidaGramas" DECIMAL(6,2),
    "fonte" TEXT NOT NULL DEFAULT 'TACO',
    "criadoPorId" TEXT,

    CONSTRAINT "Alimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanoDieta" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "nutricionistaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "observacao" TEXT,
    "kcalAlvo" INTEGER,
    "proteinaAlvoG" INTEGER,
    "carboAlvoG" INTEGER,
    "gorduraAlvoG" INTEGER,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "raizId" TEXT,
    "status" "StatusPlano" NOT NULL DEFAULT 'RASCUNHO',
    "inicioEm" TIMESTAMP(3),
    "fimEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanoDieta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refeicao" (
    "id" TEXT NOT NULL,
    "planoDietaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "horarioSugerido" TEXT,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "Refeicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemRefeicao" (
    "id" TEXT NOT NULL,
    "refeicaoId" TEXT NOT NULL,
    "alimentoId" TEXT NOT NULL,
    "quantidadeG" DECIMAL(7,2) NOT NULL,
    "observacao" TEXT,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "ItemRefeicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroRefeicao" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "refeicaoId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "status" "StatusRefeicao" NOT NULL,
    "comentario" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroRefeicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAgua" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "metaMlDia" INTEGER NOT NULL,
    "definidoPorId" TEXT,
    "horaInicio" INTEGER NOT NULL DEFAULT 7,
    "horaFim" INTEGER NOT NULL DEFAULT 22,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAgua_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroAgua" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "volumeMl" INTEGER NOT NULL,
    "registradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroAgua_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Alimento_nome_idx" ON "Alimento"("nome");

-- CreateIndex
CREATE INDEX "Alimento_grupo_idx" ON "Alimento"("grupo");

-- CreateIndex
CREATE INDEX "PlanoDieta_alunoId_status_idx" ON "PlanoDieta"("alunoId", "status");

-- CreateIndex
CREATE INDEX "PlanoDieta_raizId_idx" ON "PlanoDieta"("raizId");

-- CreateIndex
CREATE UNIQUE INDEX "Refeicao_planoDietaId_ordem_key" ON "Refeicao"("planoDietaId", "ordem");

-- CreateIndex
CREATE INDEX "ItemRefeicao_alimentoId_idx" ON "ItemRefeicao"("alimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemRefeicao_refeicaoId_ordem_key" ON "ItemRefeicao"("refeicaoId", "ordem");

-- CreateIndex
CREATE INDEX "RegistroRefeicao_alunoId_data_idx" ON "RegistroRefeicao"("alunoId", "data" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "RegistroRefeicao_alunoId_refeicaoId_data_key" ON "RegistroRefeicao"("alunoId", "refeicaoId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAgua_alunoId_key" ON "MetaAgua"("alunoId");

-- CreateIndex
CREATE INDEX "RegistroAgua_alunoId_data_idx" ON "RegistroAgua"("alunoId", "data" DESC);

-- CreateIndex
CREATE INDEX "RegistroAgua_alunoId_registradoEm_idx" ON "RegistroAgua"("alunoId", "registradoEm" DESC);

-- AddForeignKey
ALTER TABLE "PlanoDieta" ADD CONSTRAINT "PlanoDieta_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanoDieta" ADD CONSTRAINT "PlanoDieta_nutricionistaId_fkey" FOREIGN KEY ("nutricionistaId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refeicao" ADD CONSTRAINT "Refeicao_planoDietaId_fkey" FOREIGN KEY ("planoDietaId") REFERENCES "PlanoDieta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRefeicao" ADD CONSTRAINT "ItemRefeicao_refeicaoId_fkey" FOREIGN KEY ("refeicaoId") REFERENCES "Refeicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRefeicao" ADD CONSTRAINT "ItemRefeicao_alimentoId_fkey" FOREIGN KEY ("alimentoId") REFERENCES "Alimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroRefeicao" ADD CONSTRAINT "RegistroRefeicao_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroRefeicao" ADD CONSTRAINT "RegistroRefeicao_refeicaoId_fkey" FOREIGN KEY ("refeicaoId") REFERENCES "Refeicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAgua" ADD CONSTRAINT "MetaAgua_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAgua" ADD CONSTRAINT "RegistroAgua_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
