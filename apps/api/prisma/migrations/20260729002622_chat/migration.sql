-- CreateEnum
CREATE TYPE "TipoConversa" AS ENUM ('ALUNO_PROFISSIONAL', 'EQUIPE_CLINICA');

-- CreateEnum
CREATE TYPE "TipoMensagem" AS ENUM ('TEXTO', 'ARQUIVO', 'SISTEMA');

-- CreateTable
CREATE TABLE "Conversa" (
    "id" TEXT NOT NULL,
    "tipo" "TipoConversa" NOT NULL,
    "alunoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipanteConversa" (
    "conversaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entrouEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saiuEm" TIMESTAMP(3),
    "vistoEm" TIMESTAMP(3),

    CONSTRAINT "ParticipanteConversa_pkey" PRIMARY KEY ("conversaId","userId")
);

-- CreateTable
CREATE TABLE "Mensagem" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "tipo" "TipoMensagem" NOT NULL DEFAULT 'TEXTO',
    "corpo" TEXT,
    "chaveArquivo" TEXT,
    "clienteUuid" TEXT NOT NULL,
    "enviadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadaEm" TIMESTAMP(3),
    "removidaEm" TIMESTAMP(3),

    CONSTRAINT "Mensagem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conversa_alunoId_tipo_idx" ON "Conversa"("alunoId", "tipo");

-- CreateIndex
CREATE INDEX "ParticipanteConversa_userId_saiuEm_idx" ON "ParticipanteConversa"("userId", "saiuEm");

-- CreateIndex
CREATE UNIQUE INDEX "Mensagem_clienteUuid_key" ON "Mensagem"("clienteUuid");

-- CreateIndex
CREATE INDEX "Mensagem_conversaId_enviadaEm_idx" ON "Mensagem"("conversaId", "enviadaEm" DESC);

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipanteConversa" ADD CONSTRAINT "ParticipanteConversa_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "Conversa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipanteConversa" ADD CONSTRAINT "ParticipanteConversa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensagem" ADD CONSTRAINT "Mensagem_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "Conversa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensagem" ADD CONSTRAINT "Mensagem_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
