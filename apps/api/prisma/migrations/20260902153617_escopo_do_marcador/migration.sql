-- AlterTable
ALTER TABLE "SolicitacaoDeAcesso" ALTER COLUMN "expiraEm" SET DEFAULT (now() + interval '90 days');

-- CreateTable
CREATE TABLE "MarcadorEscopo" (
    "marcador" TEXT NOT NULL,
    "escopo" TEXT NOT NULL,

    CONSTRAINT "MarcadorEscopo_pkey" PRIMARY KEY ("marcador")
);
