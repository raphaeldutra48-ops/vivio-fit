/*
  Warnings:

  - You are about to drop the column `falhou` on the `SerieExecutada` table. All the data in the column will be lost.
  - Added the required column `exercicioId` to the `SerieExecutada` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TipoSerie" AS ENUM ('NORMAL', 'AQUECIMENTO', 'DROP', 'FALHA');

-- AlterTable
ALTER TABLE "SerieExecutada" DROP COLUMN "falhou",
ADD COLUMN     "exercicioId" TEXT NOT NULL,
ADD COLUMN     "tipo" "TipoSerie" NOT NULL DEFAULT 'NORMAL';

-- CreateIndex
CREATE INDEX "SerieExecutada_exercicioId_idx" ON "SerieExecutada"("exercicioId");

-- AddForeignKey
ALTER TABLE "SerieExecutada" ADD CONSTRAINT "SerieExecutada_exercicioId_fkey" FOREIGN KEY ("exercicioId") REFERENCES "Exercicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
