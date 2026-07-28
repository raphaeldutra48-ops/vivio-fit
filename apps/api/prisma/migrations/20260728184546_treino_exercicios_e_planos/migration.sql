-- CreateEnum
CREATE TYPE "EscopoExercicio" AS ENUM ('GLOBAL', 'PRIVADO');

-- CreateEnum
CREATE TYPE "StatusPlano" AS ENUM ('RASCUNHO', 'ATIVO', 'ARQUIVADO');

-- CreateTable
CREATE TABLE "Exercicio" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "grupoMuscular" TEXT NOT NULL,
    "equipamento" TEXT,
    "videoChave" TEXT,
    "thumbChave" TEXT,
    "instrucoes" TEXT,
    "escopo" "EscopoExercicio" NOT NULL DEFAULT 'PRIVADO',
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "Exercicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanoTreino" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "personalId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "objetivo" TEXT,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "raizId" TEXT,
    "status" "StatusPlano" NOT NULL DEFAULT 'RASCUNHO',
    "inicioEm" TIMESTAMP(3),
    "fimEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanoTreino_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessaoTreino" (
    "id" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "diaSugerido" INTEGER,

    CONSTRAINT "SessaoTreino_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemTreino" (
    "id" TEXT NOT NULL,
    "sessaoId" TEXT NOT NULL,
    "exercicioId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "series" INTEGER NOT NULL,
    "repsAlvo" TEXT NOT NULL,
    "cargaSugeridaKg" DECIMAL(6,2),
    "descansoSeg" INTEGER,
    "tecnica" TEXT,
    "observacao" TEXT,
    "supersetGrupo" TEXT,

    CONSTRAINT "ItemTreino_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Exercicio_grupoMuscular_idx" ON "Exercicio"("grupoMuscular");

-- CreateIndex
CREATE INDEX "Exercicio_criadoPorId_escopo_idx" ON "Exercicio"("criadoPorId", "escopo");

-- CreateIndex
CREATE INDEX "PlanoTreino_alunoId_status_idx" ON "PlanoTreino"("alunoId", "status");

-- CreateIndex
CREATE INDEX "PlanoTreino_raizId_idx" ON "PlanoTreino"("raizId");

-- CreateIndex
CREATE UNIQUE INDEX "SessaoTreino_planoId_ordem_key" ON "SessaoTreino"("planoId", "ordem");

-- CreateIndex
CREATE INDEX "ItemTreino_exercicioId_idx" ON "ItemTreino"("exercicioId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemTreino_sessaoId_ordem_key" ON "ItemTreino"("sessaoId", "ordem");

-- AddForeignKey
ALTER TABLE "Exercicio" ADD CONSTRAINT "Exercicio_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanoTreino" ADD CONSTRAINT "PlanoTreino_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanoTreino" ADD CONSTRAINT "PlanoTreino_personalId_fkey" FOREIGN KEY ("personalId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessaoTreino" ADD CONSTRAINT "SessaoTreino_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "PlanoTreino"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTreino" ADD CONSTRAINT "ItemTreino_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "SessaoTreino"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTreino" ADD CONSTRAINT "ItemTreino_exercicioId_fkey" FOREIGN KEY ("exercicioId") REFERENCES "Exercicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
