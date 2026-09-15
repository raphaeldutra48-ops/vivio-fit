-- Consentimento específico para mandar documento de saúde a um serviço de
-- leitura automática fora do país. Separado de NUTRICAO porque autorizar o
-- profissional a VER a dieta não autoriza um terceiro a PROCESSAR o documento.
ALTER TYPE "EscopoDado" ADD VALUE 'LEITURA_AUTOMATICA';
