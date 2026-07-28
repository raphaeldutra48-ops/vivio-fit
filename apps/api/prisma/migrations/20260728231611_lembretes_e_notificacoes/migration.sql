-- CreateEnum
CREATE TYPE "TipoLembrete" AS ENUM ('TREINO', 'REFEICAO', 'AGUA', 'CONSULTA', 'MENSAGEM');

-- CreateTable
CREATE TABLE "TokenDispositivo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "plataforma" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenDispositivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracaoLembrete" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "tipo" "TipoLembrete" NOT NULL,
    "horarios" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "diasDaSemana" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "canais" TEXT[] DEFAULT ARRAY['PUSH']::TEXT[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracaoLembrete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacao" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" "TipoLembrete" NOT NULL,
    "titulo" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "deeplink" TEXT,
    "referenteA" DATE NOT NULL,
    "agendadaPara" TIMESTAMP(3) NOT NULL,
    "enviadaEm" TIMESTAMP(3),
    "falhaEm" TIMESTAMP(3),
    "erro" TEXT,
    "lidaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenDispositivo_token_key" ON "TokenDispositivo"("token");

-- CreateIndex
CREATE INDEX "TokenDispositivo_userId_ativo_idx" ON "TokenDispositivo"("userId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracaoLembrete_alunoId_tipo_key" ON "ConfiguracaoLembrete"("alunoId", "tipo");

-- CreateIndex
CREATE INDEX "Notificacao_userId_criadoEm_idx" ON "Notificacao"("userId", "criadoEm" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Notificacao_userId_tipo_referenteA_key" ON "Notificacao"("userId", "tipo", "referenteA");

-- AddForeignKey
ALTER TABLE "TokenDispositivo" ADD CONSTRAINT "TokenDispositivo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfiguracaoLembrete" ADD CONSTRAINT "ConfiguracaoLembrete_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacao" ADD CONSTRAINT "Notificacao_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
