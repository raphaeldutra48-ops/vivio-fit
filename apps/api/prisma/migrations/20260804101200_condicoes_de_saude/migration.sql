-- AlterTable
ALTER TABLE "AlertaClinico" ADD COLUMN     "condicaoId" TEXT;

-- CreateTable
CREATE TABLE "CondicaoSaude" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "registradoPorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "regiao" TEXT,
    "gravidade" TEXT NOT NULL,
    "inicioEm" DATE,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvidaEm" TIMESTAMP(3),
    "resolvidaPorId" TEXT,

    CONSTRAINT "CondicaoSaude_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CondicaoSaude_alunoId_resolvidaEm_idx" ON "CondicaoSaude"("alunoId", "resolvidaEm");

-- CreateIndex
CREATE UNIQUE INDEX "AlertaClinico_alunoId_papelDestino_regra_condicaoId_key" ON "AlertaClinico"("alunoId", "papelDestino", "regra", "condicaoId");

-- AddForeignKey
ALTER TABLE "CondicaoSaude" ADD CONSTRAINT "CondicaoSaude_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondicaoSaude" ADD CONSTRAINT "CondicaoSaude_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondicaoSaude" ADD CONSTRAINT "CondicaoSaude_resolvidaPorId_fkey" FOREIGN KEY ("resolvidaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertaClinico" ADD CONSTRAINT "AlertaClinico_condicaoId_fkey" FOREIGN KEY ("condicaoId") REFERENCES "CondicaoSaude"("id") ON DELETE CASCADE ON UPDATE CASCADE;

