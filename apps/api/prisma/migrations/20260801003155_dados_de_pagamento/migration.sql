-- CreateTable
CREATE TABLE "DadosDePagamento" (
    "profissionalId" TEXT NOT NULL,
    "tipoChave" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "recebedor" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DadosDePagamento_pkey" PRIMARY KEY ("profissionalId")
);

-- AddForeignKey
ALTER TABLE "DadosDePagamento" ADD CONSTRAINT "DadosDePagamento_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
