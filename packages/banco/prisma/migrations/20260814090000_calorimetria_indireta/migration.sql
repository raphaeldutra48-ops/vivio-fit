-- CreateTable
CREATE TABLE "CalorimetriaIndireta" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "registradoPorId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "tmbMedidaKcal" INTEGER NOT NULL,
    "pesoNoExameKg" DECIMAL(5,2),
    "equipamento" TEXT,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "CalorimetriaIndireta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalorimetriaIndireta_alunoId_data_idx" ON "CalorimetriaIndireta"("alunoId", "data" DESC);

-- AddForeignKey
ALTER TABLE "CalorimetriaIndireta" ADD CONSTRAINT "CalorimetriaIndireta_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalorimetriaIndireta" ADD CONSTRAINT "CalorimetriaIndireta_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

