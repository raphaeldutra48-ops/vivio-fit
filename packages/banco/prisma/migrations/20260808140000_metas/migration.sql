-- CreateTable
CREATE TABLE "Meta" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "criadoPorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "alvo" DECIMAL(8,2),
    "exercicioId" TEXT,
    "valorInicial" DECIMAL(8,2),
    "prazo" DATE,
    "observacao" TEXT,
    "concluidaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "Meta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Meta_alunoId_deletadoEm_idx" ON "Meta"("alunoId", "deletadoEm");

-- AddForeignKey
ALTER TABLE "Meta" ADD CONSTRAINT "Meta_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meta" ADD CONSTRAINT "Meta_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meta" ADD CONSTRAINT "Meta_exercicioId_fkey" FOREIGN KEY ("exercicioId") REFERENCES "Exercicio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
