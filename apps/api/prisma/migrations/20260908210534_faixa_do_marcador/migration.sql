-- AlterTable
ALTER TABLE "SolicitacaoDeAcesso" ALTER COLUMN "expiraEm" SET DEFAULT (now() + interval '90 days');

-- CreateTable
CREATE TABLE "FaixaMarcador" (
    "marcador" TEXT NOT NULL,
    "sexo" TEXT NOT NULL,
    "labMin" DECIMAL(10,3),
    "labMax" DECIMAL(10,3),
    "funcMin" DECIMAL(10,3),
    "funcMax" DECIMAL(10,3),

    CONSTRAINT "FaixaMarcador_pkey" PRIMARY KEY ("marcador","sexo")
);
