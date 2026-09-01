-- CreateEnum
CREATE TYPE "StatusSolicitacao" AS ENUM ('PENDENTE', 'APROVADA', 'RECUSADA', 'REVOGADA');

-- CreateTable
CREATE TABLE "SolicitacaoDeAcesso" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "solicitanteId" TEXT NOT NULL,
    "detentorId" TEXT NOT NULL,
    "escopo" "EscopoDado" NOT NULL,
    "justificativa" TEXT NOT NULL,
    "status" "StatusSolicitacao" NOT NULL DEFAULT 'PENDENTE',
    "motivoResposta" TEXT,
    "expiraEm" TIMESTAMP(3) DEFAULT (now() + interval '90 days'),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondidaEm" TIMESTAMP(3),
    "revogadoEm" TIMESTAMP(3),

    CONSTRAINT "SolicitacaoDeAcesso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SolicitacaoDeAcesso_detentorId_status_idx" ON "SolicitacaoDeAcesso"("detentorId", "status");

-- CreateIndex
CREATE INDEX "SolicitacaoDeAcesso_solicitanteId_alunoId_escopo_status_idx" ON "SolicitacaoDeAcesso"("solicitanteId", "alunoId", "escopo", "status");

-- CreateIndex
CREATE INDEX "SolicitacaoDeAcesso_alunoId_status_idx" ON "SolicitacaoDeAcesso"("alunoId", "status");

-- AddForeignKey
ALTER TABLE "SolicitacaoDeAcesso" ADD CONSTRAINT "SolicitacaoDeAcesso_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoDeAcesso" ADD CONSTRAINT "SolicitacaoDeAcesso_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoDeAcesso" ADD CONSTRAINT "SolicitacaoDeAcesso_detentorId_fkey" FOREIGN KEY ("detentorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
