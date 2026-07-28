-- CreateEnum
CREATE TYPE "AnguloFoto" AS ENUM ('FRENTE', 'LADO', 'COSTAS', 'LIVRE');

-- CreateTable
CREATE TABLE "FotoEvolucao" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "chaveArquivo" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "angulo" "AnguloFoto" NOT NULL DEFAULT 'FRENTE',
    "observacao" TEXT,
    "visivelPara" "Papel"[] DEFAULT ARRAY[]::"Papel"[],
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "FotoEvolucao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FotoEvolucao_chaveArquivo_key" ON "FotoEvolucao"("chaveArquivo");

-- CreateIndex
CREATE INDEX "FotoEvolucao_alunoId_data_idx" ON "FotoEvolucao"("alunoId", "data" DESC);

-- AddForeignKey
ALTER TABLE "FotoEvolucao" ADD CONSTRAINT "FotoEvolucao_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
