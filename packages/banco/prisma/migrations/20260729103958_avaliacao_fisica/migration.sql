-- CreateEnum
CREATE TYPE "MetodoAvaliacao" AS ENUM ('ADIPOMETRIA', 'BIOIMPEDANCIA', 'MANUAL');

-- CreateEnum
CREATE TYPE "ProtocoloDobras" AS ENUM ('POLLOCK_3', 'POLLOCK_7');

-- CreateTable
CREATE TABLE "AvaliacaoFisica" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "avaliadorId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "metodo" "MetodoAvaliacao" NOT NULL,
    "protocolo" "ProtocoloDobras",
    "sexo" TEXT,
    "idade" INTEGER,
    "pesoKg" DECIMAL(5,2) NOT NULL,
    "alturaCm" INTEGER,
    "dobras" JSONB,
    "bioimpedancia" JSONB,
    "percentualGordura" DECIMAL(4,1) NOT NULL,
    "massaGordaKg" DECIMAL(5,2) NOT NULL,
    "massaMagraKg" DECIMAL(5,2) NOT NULL,
    "densidadeCorporal" DECIMAL(6,4),
    "somaDobrasMm" DECIMAL(5,1),
    "imc" DECIMAL(4,1),
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "AvaliacaoFisica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvaliacaoFisica_alunoId_data_idx" ON "AvaliacaoFisica"("alunoId", "data" DESC);

-- AddForeignKey
ALTER TABLE "AvaliacaoFisica" ADD CONSTRAINT "AvaliacaoFisica_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvaliacaoFisica" ADD CONSTRAINT "AvaliacaoFisica_avaliadorId_fkey" FOREIGN KEY ("avaliadorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
