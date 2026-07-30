-- CreateEnum
CREATE TYPE "TipoPrescritivel" AS ENUM ('SUPLEMENTO', 'FITOTERAPICO', 'MEDICAMENTO', 'ORIENTACAO');

-- CreateEnum
CREATE TYPE "EscopoPrescritivel" AS ENUM ('GLOBAL', 'PRIVADO');

-- CreateEnum
CREATE TYPE "StatusPrescricao" AS ENUM ('ATIVA', 'SUSPENSA', 'ENCERRADA', 'SUBSTITUIDA');

-- CreateTable
CREATE TABLE "ItemPrescritivel" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoPrescritivel" NOT NULL,
    "apresentacao" TEXT,
    "principioAtivo" TEXT,
    "contraindicacoes" TEXT,
    "observacao" TEXT,
    "escopo" "EscopoPrescritivel" NOT NULL DEFAULT 'PRIVADO',
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "ItemPrescritivel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModeloPrescricao" (
    "id" TEXT NOT NULL,
    "prescritorId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "orientacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "ModeloPrescricao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemModeloPrescricao" (
    "id" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "prescritivelId" TEXT NOT NULL,
    "dose" DECIMAL(8,2),
    "unidade" TEXT,
    "frequencia" TEXT,
    "horarios" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "duracaoDias" INTEGER,
    "via" TEXT,
    "observacao" TEXT,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "ItemModeloPrescricao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescricao" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "prescritorId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "validaAte" DATE,
    "orientacoes" TEXT,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "raizId" TEXT,
    "status" "StatusPrescricao" NOT NULL DEFAULT 'ATIVA',
    "encerradaEm" TIMESTAMP(3),
    "motivoEncerramento" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prescricao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemPrescricao" (
    "id" TEXT NOT NULL,
    "prescricaoId" TEXT NOT NULL,
    "prescritivelId" TEXT NOT NULL,
    "nomeNoMomento" TEXT NOT NULL,
    "dose" DECIMAL(8,2),
    "unidade" TEXT,
    "frequencia" TEXT,
    "horarios" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "duracaoDias" INTEGER,
    "via" TEXT,
    "observacao" TEXT,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "ItemPrescricao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemPrescritivel_tipo_escopo_idx" ON "ItemPrescritivel"("tipo", "escopo");

-- CreateIndex
CREATE INDEX "ItemPrescritivel_criadoPorId_idx" ON "ItemPrescritivel"("criadoPorId");

-- CreateIndex
CREATE INDEX "ModeloPrescricao_prescritorId_deletadoEm_idx" ON "ModeloPrescricao"("prescritorId", "deletadoEm");

-- CreateIndex
CREATE INDEX "ItemModeloPrescricao_prescritivelId_idx" ON "ItemModeloPrescricao"("prescritivelId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemModeloPrescricao_modeloId_ordem_key" ON "ItemModeloPrescricao"("modeloId", "ordem");

-- CreateIndex
CREATE INDEX "Prescricao_alunoId_status_idx" ON "Prescricao"("alunoId", "status");

-- CreateIndex
CREATE INDEX "Prescricao_raizId_idx" ON "Prescricao"("raizId");

-- CreateIndex
CREATE INDEX "ItemPrescricao_prescritivelId_idx" ON "ItemPrescricao"("prescritivelId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemPrescricao_prescricaoId_ordem_key" ON "ItemPrescricao"("prescricaoId", "ordem");

-- AddForeignKey
ALTER TABLE "ItemPrescritivel" ADD CONSTRAINT "ItemPrescritivel_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModeloPrescricao" ADD CONSTRAINT "ModeloPrescricao_prescritorId_fkey" FOREIGN KEY ("prescritorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemModeloPrescricao" ADD CONSTRAINT "ItemModeloPrescricao_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "ModeloPrescricao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemModeloPrescricao" ADD CONSTRAINT "ItemModeloPrescricao_prescritivelId_fkey" FOREIGN KEY ("prescritivelId") REFERENCES "ItemPrescritivel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescricao" ADD CONSTRAINT "Prescricao_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescricao" ADD CONSTRAINT "Prescricao_prescritorId_fkey" FOREIGN KEY ("prescritorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPrescricao" ADD CONSTRAINT "ItemPrescricao_prescricaoId_fkey" FOREIGN KEY ("prescricaoId") REFERENCES "Prescricao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPrescricao" ADD CONSTRAINT "ItemPrescricao_prescritivelId_fkey" FOREIGN KEY ("prescritivelId") REFERENCES "ItemPrescritivel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
