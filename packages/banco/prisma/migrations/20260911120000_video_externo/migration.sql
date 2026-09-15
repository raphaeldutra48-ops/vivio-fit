-- Player de vídeo externo (iframe/WebView) por exercício. Coluna nova e
-- anulável: o código que ainda não a conhece continua funcionando igual.
ALTER TABLE "Exercicio" ADD COLUMN "videoExternoUrl" TEXT;
