-- CreateTable
CREATE TABLE "RegraDeAlerta" (
    "id" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "marcador" TEXT,
    "quando" TEXT[],
    "lado" TEXT,
    "tipoCondicao" TEXT,
    "regiao" TEXT,
    "papelDestino" TEXT NOT NULL,
    "severidade" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "orientacao" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegraDeAlerta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegraDeAlerta_origem_marcador_ativa_idx" ON "RegraDeAlerta"("origem", "marcador", "ativa");

-- CreateIndex
CREATE INDEX "RegraDeAlerta_origem_tipoCondicao_ativa_idx" ON "RegraDeAlerta"("origem", "tipoCondicao", "ativa");
