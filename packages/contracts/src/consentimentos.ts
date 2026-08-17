import { z } from 'zod';
import { EscopoDado } from './enums';
import type { ResumoPessoa } from './vinculos';

/**
 * Versão vigente do termo. Mudou o texto, muda a versão — e o aceite anterior
 * deixa de valer para as finalidades novas.
 */
export const VERSAO_TERMO_ATUAL = '2026-07-v1';

export const concederConsentimentoSchema = z.object({
  escopo: z.nativeEnum(EscopoDado),
  /** null/ausente = vale para toda a equipe de cuidado do aluno. */
  profissionalId: z.string().cuid().nullish(),
});
export type ConcederConsentimentoInput = z.infer<typeof concederConsentimentoSchema>;

export interface ConsentimentoResumo {
  id: string;
  escopo: EscopoDado;
  finalidade: string;
  versaoTermo: string;
  concedidoEm: string;
  revogadoEm: string | null;
  /** null = vale para toda a equipe. */
  profissional: ResumoPessoa | null;
}

/** Texto exibido ao aluno no momento do aceite. É a prova de finalidade específica. */
export const FINALIDADE_POR_ESCOPO: Record<EscopoDado, string> = {
  TREINO:
    'Compartilhar meu plano de treino, cargas e histórico de execução com os profissionais que me acompanham.',
  NUTRICAO:
    'Compartilhar meu plano alimentar, registro de refeições e consumo de água com os profissionais que me acompanham.',
  CLINICO:
    'Compartilhar informações de saúde (condições, lesões e restrições) com os profissionais que me acompanham, para que treino e dieta sejam seguros para mim.',
  EVOLUCAO:
    'Compartilhar meu peso, medidas corporais e fotos de evolução com os profissionais que me acompanham.',
  MENSAGENS:
    'Permitir que os profissionais que me acompanham troquem mensagens entre si sobre o meu acompanhamento.',
  /*
    Diz o que acontece de fato, e não "usar inteligência artificial": o que o
    aluno precisa entender para decidir é que um arquivo dele sai do app e vai
    para outra empresa, fora do país. É esse o fato que muda a decisão.
  */
  LEITURA_AUTOMATICA:
    'Permitir que o plano alimentar que eu ou meu profissional enviarmos em PDF ou foto seja enviado a um serviço de leitura automática fora do Brasil, para ser transcrito. O documento é usado apenas para essa transcrição, o resultado é conferido pelo profissional antes de virar prescrição, e posso revogar esta autorização quando quiser.',
};
