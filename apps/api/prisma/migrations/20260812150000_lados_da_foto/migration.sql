-- Separa o ângulo LADO em direito e esquerdo.
--
-- Só ADD VALUE: o valor antigo `LADO` continua no enum de propósito. As fotos
-- tiradas antes disto não têm como dizer de que lado eram, e foto de evolução
-- é justamente o registro que não se refaz.
ALTER TYPE "AnguloFoto" ADD VALUE IF NOT EXISTS 'LADO_DIREITO';
ALTER TYPE "AnguloFoto" ADD VALUE IF NOT EXISTS 'LADO_ESQUERDO';
