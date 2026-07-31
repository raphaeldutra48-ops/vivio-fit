-- CreateEnum
CREATE TYPE "TipoMaterial" AS ENUM ('ARQUIVO', 'LINK');

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo" "TipoMaterial" NOT NULL,
    "chave" TEXT,
    "nomeArquivo" TEXT,
    "mimeType" TEXT,
    "tamanhoBytes" INTEGER,
    "url" TEXT,
    "etiquetas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deletadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialCompartilhado" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "compartilhadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vistoEm" TIMESTAMP(3),

    CONSTRAINT "MaterialCompartilhado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Material_autorId_deletadoEm_idx" ON "Material"("autorId", "deletadoEm");

-- CreateIndex
CREATE INDEX "MaterialCompartilhado_alunoId_compartilhadoEm_idx" ON "MaterialCompartilhado"("alunoId", "compartilhadoEm" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MaterialCompartilhado_materialId_alunoId_key" ON "MaterialCompartilhado"("materialId", "alunoId");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialCompartilhado" ADD CONSTRAINT "MaterialCompartilhado_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialCompartilhado" ADD CONSTRAINT "MaterialCompartilhado_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
