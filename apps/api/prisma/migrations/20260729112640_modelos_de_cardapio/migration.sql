-- CreateTable
CREATE TABLE "ModeloCardapio" (
    "id" TEXT NOT NULL,
    "nutricionistaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "kcalAlvo" INTEGER,
    "proteinaAlvoG" INTEGER,
    "carboAlvoG" INTEGER,
    "gorduraAlvoG" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "ModeloCardapio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefeicaoModelo" (
    "id" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "horarioSugerido" TEXT,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "RefeicaoModelo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemModelo" (
    "id" TEXT NOT NULL,
    "refeicaoId" TEXT NOT NULL,
    "alimentoId" TEXT NOT NULL,
    "quantidadeG" DECIMAL(7,2) NOT NULL,
    "observacao" TEXT,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "ItemModelo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModeloCardapio_nutricionistaId_deletadoEm_idx" ON "ModeloCardapio"("nutricionistaId", "deletadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "RefeicaoModelo_modeloId_ordem_key" ON "RefeicaoModelo"("modeloId", "ordem");

-- CreateIndex
CREATE INDEX "ItemModelo_alimentoId_idx" ON "ItemModelo"("alimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemModelo_refeicaoId_ordem_key" ON "ItemModelo"("refeicaoId", "ordem");

-- AddForeignKey
ALTER TABLE "ModeloCardapio" ADD CONSTRAINT "ModeloCardapio_nutricionistaId_fkey" FOREIGN KEY ("nutricionistaId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefeicaoModelo" ADD CONSTRAINT "RefeicaoModelo_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "ModeloCardapio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemModelo" ADD CONSTRAINT "ItemModelo_refeicaoId_fkey" FOREIGN KEY ("refeicaoId") REFERENCES "RefeicaoModelo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemModelo" ADD CONSTRAINT "ItemModelo_alimentoId_fkey" FOREIGN KEY ("alimentoId") REFERENCES "Alimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
