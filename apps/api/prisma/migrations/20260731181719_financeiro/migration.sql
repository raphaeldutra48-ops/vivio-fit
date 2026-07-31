-- CreateEnum
CREATE TYPE "StatusCobranca" AS ENUM ('PENDENTE', 'PAGA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "FormaPagamento" AS ENUM ('PIX', 'DINHEIRO', 'CARTAO', 'TRANSFERENCIA', 'OUTRO');

-- CreateTable
CREATE TABLE "Cobranca" (
    "id" TEXT NOT NULL,
    "profissionalId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "vencimento" DATE NOT NULL,
    "status" "StatusCobranca" NOT NULL DEFAULT 'PENDENTE',
    "pagaEm" TIMESTAMP(3),
    "formaPagamento" "FormaPagamento",
    "observacao" TEXT,
    "loteId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cobranca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cobranca_profissionalId_status_vencimento_idx" ON "Cobranca"("profissionalId", "status", "vencimento");

-- CreateIndex
CREATE INDEX "Cobranca_alunoId_vencimento_idx" ON "Cobranca"("alunoId", "vencimento" DESC);

-- AddForeignKey
ALTER TABLE "Cobranca" ADD CONSTRAINT "Cobranca_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobranca" ADD CONSTRAINT "Cobranca_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
