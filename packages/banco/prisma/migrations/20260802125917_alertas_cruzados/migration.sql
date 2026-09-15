-- CreateTable
CREATE TABLE "AlertaClinico" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "papelDestino" TEXT NOT NULL,
    "severidade" TEXT NOT NULL,
    "regra" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "orientacao" TEXT NOT NULL,
    "marcadorOrigem" TEXT,
    "exameId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconhecidoEm" TIMESTAMP(3),
    "reconhecidoPorId" TEXT,
    "anotacao" TEXT,

    CONSTRAINT "AlertaClinico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlertaClinico_alunoId_papelDestino_reconhecidoEm_idx" ON "AlertaClinico"("alunoId", "papelDestino", "reconhecidoEm");

-- CreateIndex
CREATE UNIQUE INDEX "AlertaClinico_alunoId_papelDestino_regra_exameId_key" ON "AlertaClinico"("alunoId", "papelDestino", "regra", "exameId");

-- AddForeignKey
ALTER TABLE "AlertaClinico" ADD CONSTRAINT "AlertaClinico_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertaClinico" ADD CONSTRAINT "AlertaClinico_exameId_fkey" FOREIGN KEY ("exameId") REFERENCES "Exame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertaClinico" ADD CONSTRAINT "AlertaClinico_reconhecidoPorId_fkey" FOREIGN KEY ("reconhecidoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
