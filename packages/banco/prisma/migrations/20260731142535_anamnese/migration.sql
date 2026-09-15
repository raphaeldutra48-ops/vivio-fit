-- CreateEnum
CREATE TYPE "TipoPergunta" AS ENUM ('TEXTO', 'TEXTO_LONGO', 'SIM_NAO', 'ESCOLHA_UNICA', 'ESCOLHA_MULTIPLA', 'NUMERO', 'DATA');

-- CreateTable
CREATE TABLE "ModeloAnamnese" (
    "id" TEXT NOT NULL,
    "profissionalId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "deletadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModeloAnamnese_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerguntaAnamnese" (
    "id" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "tipo" "TipoPergunta" NOT NULL,
    "opcoes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "obrigatoria" BOOLEAN NOT NULL DEFAULT false,
    "ajuda" TEXT,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "PerguntaAnamnese_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Anamnese" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "profissionalId" TEXT NOT NULL,
    "modeloId" TEXT,
    "nomeNoMomento" TEXT NOT NULL,
    "observacao" TEXT,
    "respondidaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Anamnese_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RespostaAnamnese" (
    "id" TEXT NOT NULL,
    "anamneseId" TEXT NOT NULL,
    "perguntaId" TEXT,
    "perguntaNoMomento" TEXT NOT NULL,
    "tipoNoMomento" "TipoPergunta" NOT NULL,
    "valor" TEXT,
    "valores" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "RespostaAnamnese_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModeloAnamnese_profissionalId_deletadoEm_idx" ON "ModeloAnamnese"("profissionalId", "deletadoEm");

-- CreateIndex
CREATE INDEX "PerguntaAnamnese_modeloId_ordem_idx" ON "PerguntaAnamnese"("modeloId", "ordem");

-- CreateIndex
CREATE INDEX "Anamnese_alunoId_respondidaEm_idx" ON "Anamnese"("alunoId", "respondidaEm");

-- CreateIndex
CREATE INDEX "RespostaAnamnese_anamneseId_ordem_idx" ON "RespostaAnamnese"("anamneseId", "ordem");

-- AddForeignKey
ALTER TABLE "ModeloAnamnese" ADD CONSTRAINT "ModeloAnamnese_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerguntaAnamnese" ADD CONSTRAINT "PerguntaAnamnese_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "ModeloAnamnese"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anamnese" ADD CONSTRAINT "Anamnese_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anamnese" ADD CONSTRAINT "Anamnese_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anamnese" ADD CONSTRAINT "Anamnese_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "ModeloAnamnese"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespostaAnamnese" ADD CONSTRAINT "RespostaAnamnese_anamneseId_fkey" FOREIGN KEY ("anamneseId") REFERENCES "Anamnese"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespostaAnamnese" ADD CONSTRAINT "RespostaAnamnese_perguntaId_fkey" FOREIGN KEY ("perguntaId") REFERENCES "PerguntaAnamnese"("id") ON DELETE SET NULL ON UPDATE CASCADE;
