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
export * from './midia';
export * from './notificacoes';
