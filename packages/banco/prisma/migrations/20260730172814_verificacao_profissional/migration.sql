-- AlterTable
ALTER TABLE "PerfilProfissional" ADD COLUMN     "motivoRecusa" TEXT,
ADD COLUMN     "recusadoEm" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PerfilProfissional_verificadoEm_recusadoEm_idx" ON "PerfilProfissional"("verificadoEm", "recusadoEm");

-- AddForeignKey
ALTER TABLE "PerfilProfissional" ADD CONSTRAINT "PerfilProfissional_verificadoPorId_fkey" FOREIGN KEY ("verificadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
