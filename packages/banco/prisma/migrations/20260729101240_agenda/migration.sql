-- CreateEnum
CREATE TYPE "TipoCompromisso" AS ENUM ('AVALIACAO_FISICA', 'CONSULTA', 'RETORNO', 'TREINO_ACOMPANHADO', 'CONSULTORIA_ONLINE', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusCompromisso" AS ENUM ('AGENDADO', 'CONFIRMADO', 'REALIZADO', 'CANCELADO', 'NAO_COMPARECEU');

-- CreateTable
CREATE TABLE "Compromisso" (
    "id" TEXT NOT NULL,
    "profissionalId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "tipo" "TipoCompromisso" NOT NULL,
    "titulo" TEXT,
    "inicioEm" TIMESTAMP(3) NOT NULL,
    "fimEm" TIMESTAMP(3) NOT NULL,
    "local" TEXT,
    "observacao" TEXT,
    "status" "StatusCompromisso" NOT NULL DEFAULT 'AGENDADO',
    "criadoPorId" TEXT NOT NULL,
    "canceladoEm" TIMESTAMP(3),
    "motivoCancelamento" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Compromisso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisponibilidadeSlot" (
    "id" TEXT NOT NULL,
    "profissionalId" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFim" TEXT NOT NULL,
    "duracaoMin" INTEGER NOT NULL DEFAULT 60,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisponibilidadeSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BloqueioAgenda" (
    "id" TEXT NOT NULL,
    "profissionalId" TEXT NOT NULL,
    "inicioEm" TIMESTAMP(3) NOT NULL,
    "fimEm" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BloqueioAgenda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Compromisso_profissionalId_inicioEm_idx" ON "Compromisso"("profissionalId", "inicioEm");

-- CreateIndex
CREATE INDEX "Compromisso_alunoId_inicioEm_idx" ON "Compromisso"("alunoId", "inicioEm");

-- CreateIndex
CREATE INDEX "Compromisso_status_idx" ON "Compromisso"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DisponibilidadeSlot_profissionalId_diaSemana_horaInicio_key" ON "DisponibilidadeSlot"("profissionalId", "diaSemana", "horaInicio");

-- CreateIndex
CREATE INDEX "BloqueioAgenda_profissionalId_inicioEm_idx" ON "BloqueioAgenda"("profissionalId", "inicioEm");

-- AddForeignKey
ALTER TABLE "Compromisso" ADD CONSTRAINT "Compromisso_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compromisso" ADD CONSTRAINT "Compromisso_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisponibilidadeSlot" ADD CONSTRAINT "DisponibilidadeSlot_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueioAgenda" ADD CONSTRAINT "BloqueioAgenda_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sobreposição de horário é o erro que uma agenda não pode cometer. Checar só
-- na aplicação deixa brecha em requisições concorrentes: duas marcações
-- simultâneas passariam as duas na verificação e gravariam as duas.
--
-- Usa tsrange (nao tstzrange) porque o Prisma mapeia DateTime para
-- timestamp SEM fuso; a versao com fuso dependeria da timezone da sessao e o
-- Postgres recusa por nao ser IMMUTABLE. Todos os horarios sao gravados em UTC.
-- A restrição EXCLUDE resolve no banco: o Postgres recusa qualquer INSERT/UPDATE
-- que crie interseção de intervalo para o mesmo profissional. Só vale para
-- compromissos vivos — cancelado e realizado liberam o horário.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Compromisso"
  ADD CONSTRAINT "compromisso_sem_sobreposicao"
  EXCLUDE USING gist (
    "profissionalId" WITH =,
    tsrange("inicioEm", "fimEm", '[)') WITH &&
  )
  WHERE ("status" IN ('AGENDADO', 'CONFIRMADO'));
