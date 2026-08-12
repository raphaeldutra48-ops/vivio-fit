-- CreateTable
CREATE TABLE "AtividadeCardio" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "execucaoId" TEXT,
    "tipo" TEXT NOT NULL,
    "intensidade" TEXT NOT NULL,
    "duracaoMin" INTEGER NOT NULL,
    "distanciaKm" DECIMAL(6,2),
    "data" DATE NOT NULL,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "AtividadeCardio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AtividadeCardio_alunoId_data_idx" ON "AtividadeCardio"("alunoId", "data" DESC);

-- CreateIndex
CREATE INDEX "AtividadeCardio_execucaoId_idx" ON "AtividadeCardio"("execucaoId");

-- AddForeignKey
ALTER TABLE "AtividadeCardio" ADD CONSTRAINT "AtividadeCardio_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtividadeCardio" ADD CONSTRAINT "AtividadeCardio_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "ExecucaoTreino"("id") ON DELETE CASCADE ON UPDATE CASCADE;

