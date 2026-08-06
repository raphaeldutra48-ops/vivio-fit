-- CreateTable
CREATE TABLE "TokenRedefinicaoSenha" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenRedefinicaoSenha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenRedefinicaoSenha_tokenHash_key" ON "TokenRedefinicaoSenha"("tokenHash");

-- CreateIndex
CREATE INDEX "TokenRedefinicaoSenha_userId_usadoEm_idx" ON "TokenRedefinicaoSenha"("userId", "usadoEm");

-- AddForeignKey
ALTER TABLE "TokenRedefinicaoSenha" ADD CONSTRAINT "TokenRedefinicaoSenha_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
