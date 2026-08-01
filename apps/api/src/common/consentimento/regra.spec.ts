import { describe, expect, it } from 'vitest';
import { consentimentoVigentePara } from './regra';

describe('consentimentoVigentePara', () => {
  const regra = consentimentoVigentePara('pro-1');

  it('ignora o que foi revogado', () => {
    expect(regra.revogadoEm).toBeNull();
  });

  /**
   * O caso que já escapou uma vez: o consentimento da equipe inteira tem
   * `profissionalId: null`, e filtrar só pelo id do profissional o deixava de
   * fora — o aluno que autorizou tudo aparecia como se não tivesse autorizado
   * nada.
   */
  it('aceita tanto o da equipe inteira quanto o dirigido ao profissional', () => {
    expect(regra.OR).toEqual([{ profissionalId: null }, { profissionalId: 'pro-1' }]);
  });

  it('não pega o consentimento dado a outro profissional', () => {
    const ors = regra.OR as { profissionalId: string | null }[];
    expect(ors.some((o) => o.profissionalId === 'pro-2')).toBe(false);
  });
});
