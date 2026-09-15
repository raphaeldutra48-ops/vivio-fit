-- CreateTable
CREATE TABLE "Exame" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "registradoPorId" TEXT NOT NULL,
    "laboratorio" TEXT NOT NULL,
    "dataColeta" DATE NOT NULL,
    "sexo" TEXT NOT NULL,
    "observacao" TEXT,
    "chaveArquivo" TEXT,
    "mimeType" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "Exame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultadoMarcador" (
    "id" TEXT NOT NULL,
    "exameId" TEXT NOT NULL,
    "marcador" TEXT NOT NULL,
    "valor" DECIMAL(10,3) NOT NULL,
    "classificacao" TEXT NOT NULL,

    CONSTRAINT "ResultadoMarcador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Exame_alunoId_dataColeta_idx" ON "Exame"("alunoId", "dataColeta" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ResultadoMarcador_exameId_marcador_key" ON "ResultadoMarcador"("exameId", "marcador");

-- AddForeignKey
ALTER TABLE "Exame" ADD CONSTRAINT "Exame_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exame" ADD CONSTRAINT "Exame_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultadoMarcador" ADD CONSTRAINT "ResultadoMarcador_exameId_fkey" FOREIGN KEY ("exameId") REFERENCES "Exame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
