-- CreateTable
CREATE TABLE "CheckinDiario" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "treinou" BOOLEAN NOT NULL,
    "energia" INTEGER NOT NULL,
    "teveDor" BOOLEAN NOT NULL DEFAULT false,
    "localDor" TEXT,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckinDiario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CheckinDiario_alunoId_data_idx" ON "CheckinDiario"("alunoId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "CheckinDiario_alunoId_data_key" ON "CheckinDiario"("alunoId", "data");

-- AddForeignKey
ALTER TABLE "CheckinDiario" ADD CONSTRAINT "CheckinDiario_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
