-- CreateTable
CREATE TABLE "ExecucaoTreino" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "sessaoId" TEXT NOT NULL,
    "clienteUuid" TEXT NOT NULL,
    "iniciadoEm" TIMESTAMP(3) NOT NULL,
    "finalizadoEm" TIMESTAMP(3),
    "duracaoSeg" INTEGER,
    "origem" TEXT NOT NULL DEFAULT 'APP',
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecucaoTreino_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerieExecutada" (
    "id" TEXT NOT NULL,
    "execucaoId" TEXT NOT NULL,
    "itemTreinoId" TEXT NOT NULL,
    "serieNum" INTEGER NOT NULL,
    "repsFeitas" INTEGER NOT NULL,
    "cargaKg" DECIMAL(6,2) NOT NULL,
    "rpe" INTEGER,
    "falhou" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SerieExecutada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackTreino" (
    "id" TEXT NOT NULL,
    "execucaoId" TEXT NOT NULL,
    "dificuldade" INTEGER NOT NULL,
    "teveDor" BOOLEAN NOT NULL DEFAULT false,
    "localDor" TEXT,
    "sensacao" TEXT,
    "comentario" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackTreino_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExecucaoTreino_clienteUuid_key" ON "ExecucaoTreino"("clienteUuid");

-- CreateIndex
CREATE INDEX "ExecucaoTreino_alunoId_iniciadoEm_idx" ON "ExecucaoTreino"("alunoId", "iniciadoEm" DESC);

-- CreateIndex
CREATE INDEX "ExecucaoTreino_sessaoId_idx" ON "ExecucaoTreino"("sessaoId");

-- CreateIndex
CREATE INDEX "SerieExecutada_itemTreinoId_idx" ON "SerieExecutada"("itemTreinoId");

-- CreateIndex
CREATE UNIQUE INDEX "SerieExecutada_execucaoId_itemTreinoId_serieNum_key" ON "SerieExecutada"("execucaoId", "itemTreinoId", "serieNum");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackTreino_execucaoId_key" ON "FeedbackTreino"("execucaoId");

-- AddForeignKey
ALTER TABLE "ExecucaoTreino" ADD CONSTRAINT "ExecucaoTreino_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecucaoTreino" ADD CONSTRAINT "ExecucaoTreino_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "SessaoTreino"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerieExecutada" ADD CONSTRAINT "SerieExecutada_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "ExecucaoTreino"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerieExecutada" ADD CONSTRAINT "SerieExecutada_itemTreinoId_fkey" FOREIGN KEY ("itemTreinoId") REFERENCES "ItemTreino"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackTreino" ADD CONSTRAINT "FeedbackTreino_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "ExecucaoTreino"("id") ON DELETE CASCADE ON UPDATE CASCADE;
