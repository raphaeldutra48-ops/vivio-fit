-- AlterTable
ALTER TABLE "RegraDeAlerta" ADD COLUMN     "limites" JSONB;

-- AlterTable
ALTER TABLE "SolicitacaoDeAcesso" ALTER COLUMN "expiraEm" SET DEFAULT (now() + interval '90 days');
