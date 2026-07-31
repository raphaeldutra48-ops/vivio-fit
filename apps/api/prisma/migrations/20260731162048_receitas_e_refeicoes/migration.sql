-- CreateTable
CREATE TABLE "Receita" (
    "id" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "modoPreparo" TEXT,
    "rendePorcoes" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "nomeDaPorcao" TEXT,
    "tempoMinutos" INTEGER,
    "deletadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngredienteReceita" (
    "id" TEXT NOT NULL,
    "receitaId" TEXT NOT NULL,
    "alimentoId" TEXT NOT NULL,
    "quantidadeG" DECIMAL(7,2) NOT NULL,
    "observacao" TEXT,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "IngredienteReceita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefeicaoSalva" (
    "id" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "horarioSugerido" TEXT,
    "observacao" TEXT,
    "deletadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefeicaoSalva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemRefeicaoSalva" (
    "id" TEXT NOT NULL,
    "refeicaoId" TEXT NOT NULL,
    "alimentoId" TEXT,
    "receitaId" TEXT,
    "quantidadeG" DECIMAL(7,2),
    "porcoes" DECIMAL(6,2),
    "observacao" TEXT,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "ItemRefeicaoSalva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Receita_autorId_deletadoEm_idx" ON "Receita"("autorId", "deletadoEm");

-- CreateIndex
CREATE INDEX "IngredienteReceita_receitaId_ordem_idx" ON "IngredienteReceita"("receitaId", "ordem");

-- CreateIndex
CREATE INDEX "RefeicaoSalva_autorId_deletadoEm_idx" ON "RefeicaoSalva"("autorId", "deletadoEm");

-- CreateIndex
CREATE INDEX "ItemRefeicaoSalva_refeicaoId_ordem_idx" ON "ItemRefeicaoSalva"("refeicaoId", "ordem");

-- AddForeignKey
ALTER TABLE "Receita" ADD CONSTRAINT "Receita_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredienteReceita" ADD CONSTRAINT "IngredienteReceita_receitaId_fkey" FOREIGN KEY ("receitaId") REFERENCES "Receita"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredienteReceita" ADD CONSTRAINT "IngredienteReceita_alimentoId_fkey" FOREIGN KEY ("alimentoId") REFERENCES "Alimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefeicaoSalva" ADD CONSTRAINT "RefeicaoSalva_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRefeicaoSalva" ADD CONSTRAINT "ItemRefeicaoSalva_refeicaoId_fkey" FOREIGN KEY ("refeicaoId") REFERENCES "RefeicaoSalva"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRefeicaoSalva" ADD CONSTRAINT "ItemRefeicaoSalva_alimentoId_fkey" FOREIGN KEY ("alimentoId") REFERENCES "Alimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRefeicaoSalva" ADD CONSTRAINT "ItemRefeicaoSalva_receitaId_fkey" FOREIGN KEY ("receitaId") REFERENCES "Receita"("id") ON DELETE SET NULL ON UPDATE CASCADE;
