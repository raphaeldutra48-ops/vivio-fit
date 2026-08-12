-- Detalhamento da dor no feedback pós-treino.
--
-- Só adiciona colunas anuláveis: nenhum registro existente precisa de valor, e
-- feedback antigo continua válido com os três campos vazios.
ALTER TABLE "FeedbackTreino" ADD COLUMN     "dorExercicioId" TEXT,
ADD COLUMN     "dorMomento" TEXT,
ADD COLUMN     "dorTipo" TEXT;

-- ON DELETE SET NULL: apagar um exercício do catálogo não pode apagar o relato
-- de dor de ninguém — o registro perde o vínculo e mantém o resto.
ALTER TABLE "FeedbackTreino" ADD CONSTRAINT "FeedbackTreino_dorExercicioId_fkey" FOREIGN KEY ("dorExercicioId") REFERENCES "Exercicio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
