/**
 * Contratos compartilhados entre api, web e mobile.
 *
 * Regra: se um tipo é usado pelo backend E por um cliente, ele mora aqui.
 * Nada de duplicar definição em apps/*.
 */
export * from './enums';
export * from './erros';
export * from './auth';
export * from './vinculos';
export * from './consentimentos';
export * from './auditoria';
export * from './medidas';
export * from './treino';
export * from './execucoes';
export * from './checkin';
export * from './progresso';
export * from './metas';
export * from './comparativo';
export * from './feedback';
export * from './recordes';
export * from './cardio';
export * from './cobranca-dieta';
export * from './metabolismo';
export * from './midia';
export * from './notificacoes';
export * from './nutricao';
export * from './evolucao';
export * from './chat';
export * from './agenda';
export * from './avaliacao';
export * from './exames';
export * from './alertas';
export * from './condicoes';
export * from './cardapios';
export * from './compras';
export * from './prescricoes';
export * from './admin';
export * from './anamnese';
export * from './receitas';
export * from './relatorios';
export * from './materiais';
export * from './financeiro';
export * from './site';
export * from './perfil';
export * from './pix';
export * from './importacao-dieta';
export * from './resumo';
export * from './rascunho-treino';
