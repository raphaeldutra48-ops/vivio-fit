-- CreateTable
CREATE TABLE "TokenVerificacaoEmail" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenVerificacaoEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenVerificacaoEmail_tokenHash_key" ON "TokenVerificacaoEmail"("tokenHash");

-- CreateIndex
CREATE INDEX "TokenVerificacaoEmail_userId_usadoEm_idx" ON "TokenVerificacaoEmail"("userId", "usadoEm");

-- AddForeignKey
ALTER TABLE "TokenVerificacaoEmail" ADD CONSTRAINT "TokenVerificacaoEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A partir desta migração o login exige e-mail confirmado. Contas criadas antes
-- da regra existir são consideradas verificadas: trancá-las retroativamente não
-- protegeria ninguém (o cadastro já aconteceu) e derrubaria todo mundo.
UPDATE "User" SET "emailVerifEm" = "criadoEm" WHERE "emailVerifEm" IS NULL;
