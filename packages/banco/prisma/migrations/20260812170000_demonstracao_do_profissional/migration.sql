-- CreateTable
CREATE TABLE "DemonstracaoProfissional" (
    "id" TEXT NOT NULL,
    "profissionalId" TEXT NOT NULL,
    "exercicioId" TEXT NOT NULL,
    "videoChave" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemonstracaoProfissional_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemonstracaoProfissional_exercicioId_idx" ON "DemonstracaoProfissional"("exercicioId");

-- CreateIndex
CREATE UNIQUE INDEX "DemonstracaoProfissional_profissionalId_exercicioId_key" ON "DemonstracaoProfissional"("profissionalId", "exercicioId");

-- AddForeignKey
ALTER TABLE "DemonstracaoProfissional" ADD CONSTRAINT "DemonstracaoProfissional_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemonstracaoProfissional" ADD CONSTRAINT "DemonstracaoProfissional_exercicioId_fkey" FOREIGN KEY ("exercicioId") REFERENCES "Exercicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

