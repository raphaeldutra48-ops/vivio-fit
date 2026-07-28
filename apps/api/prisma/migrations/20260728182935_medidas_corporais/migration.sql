-- CreateEnum
CREATE TYPE "FonteMedida" AS ENUM ('MANUAL', 'BIOIMPEDANCIA', 'WEARABLE');

-- CreateTable
CREATE TABLE "Medida" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "pesoKg" DECIMAL(5,2),
    "percentualGordura" DECIMAL(4,1),
    "massaMagraKg" DECIMAL(5,2),
    "cinturaCm" DECIMAL(5,1),
    "quadrilCm" DECIMAL(5,1),
    "bracoCm" DECIMAL(5,1),
    "coxaCm" DECIMAL(5,1),
    "toraxCm" DECIMAL(5,1),
    "fonte" "FonteMedida" NOT NULL DEFAULT 'MANUAL',
    "registradoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "Medida_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Medida_alunoId_data_idx" ON "Medida"("alunoId", "data" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Medida_alunoId_data_key" ON "Medida"("alunoId", "data");

-- AddForeignKey
ALTER TABLE "Medida" ADD CONSTRAINT "Medida_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
