-- Limpeza do que sobrou da API, e o banco passando a dizer a verdade.
--
-- Três coisas, todas achadas pela auditoria de 22/09/2026:
--
-- 1. AS TABELAS MORTAS. `SessaoRefresh` guardava 3.006 hashes de sessão da
--    autenticação antiga, e as duas de token (verificação de e-mail e
--    redefinição de senha) estavam vazias. Quem autentica é o Supabase Auth,
--    em `auth.users`. Credencial velha parada no banco só tem risco, sem uso.
--    O mesmo vale para `User.senhaHash`, que fica vazia (a coluna continua,
--    fora do alcance de todo papel, como o 13-colunas-sensiveis.sql garante).
--
-- 2. OS PREENCHIMENTOS DE `id`. O `@default(cuid())` do Prisma é do CLIENTE:
--    pelo PostgREST não havia quem preenchesse, e foi assim que gravações
--    morreram em violação de nulo. O default foi posto no banco à mão na
--    época; esta migração o declara, para que ele exista também num banco
--    criado do zero — e para que o `schema.prisma` pare de divergir do que
--    está no ar.
--
-- 3. OS ÍNDICES DE CHAVE ESTRANGEIRA. Vinte e três colunas apontavam para
--    outra tabela sem índice próprio. Com sete contas não se nota; com mil,
--    cada remoção de pai varre a tabela filha inteira.
-- DropForeignKey
ALTER TABLE "SessaoRefresh" DROP CONSTRAINT "SessaoRefresh_userId_fkey";
-- DropForeignKey
ALTER TABLE "TokenRedefinicaoSenha" DROP CONSTRAINT "TokenRedefinicaoSenha_userId_fkey";
-- DropForeignKey
ALTER TABLE "TokenVerificacaoEmail" DROP CONSTRAINT "TokenVerificacaoEmail_userId_fkey";
-- AlterTable
ALTER TABLE "Anamnese" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
-- AlterTable
ALTER TABLE "AtividadeCardio" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
-- AlterTable
ALTER TABLE "AvaliacaoFisica" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
-- AlterTable
ALTER TABLE "CalorimetriaIndireta" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
-- AlterTable
ALTER TABLE "DemonstracaoProfissional" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
-- AlterTable
ALTER TABLE "FotoEvolucao" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
-- AlterTable
ALTER TABLE "IngredienteReceita" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
-- AlterTable
ALTER TABLE "ItemModeloPrescricao" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
-- AlterTable
ALTER TABLE "ItemPrescricao" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
-- AlterTable
ALTER TABLE "ItemPrescritivel" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
-- AlterTable
ALTER TABLE "ItemRefeicaoSalva" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
-- AlterTable
ALTER TABLE "ModeloAnamnese" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
-- AlterTable
ALTER TABLE "ModeloPrescricao" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
-- AlterTable
ALTER TABLE "PerguntaAnamnese" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
-- AlterTable
ALTER TABLE "Prescricao" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
-- AlterTable
ALTER TABLE "Receita" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
-- AlterTable
ALTER TABLE "RefeicaoSalva" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
-- AlterTable
ALTER TABLE "RespostaAnamnese" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
-- DropTable
DROP TABLE "SessaoRefresh";
-- DropTable
DROP TABLE "TokenRedefinicaoSenha";
-- DropTable
DROP TABLE "TokenVerificacaoEmail";
-- CreateIndex
CREATE INDEX "AlertaClinico_condicaoId_idx" ON "AlertaClinico"("condicaoId");
-- CreateIndex
CREATE INDEX "AlertaClinico_exameId_idx" ON "AlertaClinico"("exameId");
-- CreateIndex
CREATE INDEX "AlertaClinico_reconhecidoPorId_idx" ON "AlertaClinico"("reconhecidoPorId");
-- CreateIndex
CREATE INDEX "Anamnese_modeloId_idx" ON "Anamnese"("modeloId");
-- CreateIndex
CREATE INDEX "Anamnese_profissionalId_idx" ON "Anamnese"("profissionalId");
-- CreateIndex
CREATE INDEX "AvaliacaoFisica_avaliadorId_idx" ON "AvaliacaoFisica"("avaliadorId");
-- CreateIndex
CREATE INDEX "CalorimetriaIndireta_registradoPorId_idx" ON "CalorimetriaIndireta"("registradoPorId");
-- CreateIndex
CREATE INDEX "CondicaoSaude_registradoPorId_idx" ON "CondicaoSaude"("registradoPorId");
-- CreateIndex
CREATE INDEX "CondicaoSaude_resolvidaPorId_idx" ON "CondicaoSaude"("resolvidaPorId");
-- CreateIndex
CREATE INDEX "Exame_registradoPorId_idx" ON "Exame"("registradoPorId");
-- CreateIndex
CREATE INDEX "FeedbackTreino_dorExercicioId_idx" ON "FeedbackTreino"("dorExercicioId");
-- CreateIndex
CREATE INDEX "IngredienteReceita_alimentoId_idx" ON "IngredienteReceita"("alimentoId");
-- CreateIndex
CREATE INDEX "ItemRefeicaoSalva_alimentoId_idx" ON "ItemRefeicaoSalva"("alimentoId");
-- CreateIndex
CREATE INDEX "ItemRefeicaoSalva_receitaId_idx" ON "ItemRefeicaoSalva"("receitaId");
-- CreateIndex
CREATE INDEX "Mensagem_autorId_idx" ON "Mensagem"("autorId");
-- CreateIndex
CREATE INDEX "Meta_criadoPorId_idx" ON "Meta"("criadoPorId");
-- CreateIndex
CREATE INDEX "Meta_exercicioId_idx" ON "Meta"("exercicioId");
-- CreateIndex
CREATE INDEX "PerfilProfissional_verificadoPorId_idx" ON "PerfilProfissional"("verificadoPorId");
-- CreateIndex
CREATE INDEX "PlanoDieta_nutricionistaId_idx" ON "PlanoDieta"("nutricionistaId");
-- CreateIndex
CREATE INDEX "PlanoTreino_personalId_idx" ON "PlanoTreino"("personalId");
-- CreateIndex
CREATE INDEX "Prescricao_prescritorId_idx" ON "Prescricao"("prescritorId");
-- CreateIndex
CREATE INDEX "RegistroRefeicao_refeicaoId_idx" ON "RegistroRefeicao"("refeicaoId");
-- CreateIndex
CREATE INDEX "RespostaAnamnese_perguntaId_idx" ON "RespostaAnamnese"("perguntaId");

-- Credencial da API antiga não fica guardada.
UPDATE "User" SET "senhaHash" = NULL WHERE "senhaHash" IS NOT NULL;
