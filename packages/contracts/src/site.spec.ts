import { describe, expect, it } from 'vitest';
import { linkDoWhatsapp, slugSchema, sugerirSlug } from './site';

describe('sugerirSlug', () => {
  it('tira acento e junta com hífen', () => {
    expect(sugerirSlug('Ana Paula Costa')).toBe('ana-paula-costa');
    expect(sugerirSlug('João Gonçalves')).toBe('joao-goncalves');
    expect(sugerirSlug('Térèsa Ünïcode')).toBe('teresa-unicode');
  });

  it('não deixa hífen sobrando nas pontas', () => {
    expect(sugerirSlug('  Bruno  ')).toBe('bruno');
    expect(sugerirSlug('Dr. Carlos!')).toBe('dr-carlos');
    expect(sugerirSlug('---')).toBe('');
  });

  /** Cortar em 40 pode deixar hífen na ponta — que o schema recusaria. */
  it('o corte não produz slug inválido', () => {
    const longo = sugerirSlug('Maria das Graças Fernandes de Albuquerque Silva Santos');
    expect(longo.length).toBeLessThanOrEqual(40);
    expect(longo.endsWith('-')).toBe(false);
    expect(slugSchema.safeParse(longo).success).toBe(true);
  });

  it('o que ele sugere passa na validação', () => {
    for (const nome of ['Eduarda Nutri', 'José da Silva Jr', 'Ana', 'Beatriz Öhman']) {
      const slug = sugerirSlug(nome);
      expect(slugSchema.safeParse(slug).success).toBe(true);
    }
  });
});

describe('slugSchema', () => {
  it('aceita o que vira URL limpa', () => {
    expect(slugSchema.safeParse('ana-costa').success).toBe(true);
    expect(slugSchema.safeParse('personal123').success).toBe(true);
  });

  it('recusa o que quebraria a URL', () => {
    expect(slugSchema.safeParse('Ana Costa').success).toBe(false);
    expect(slugSchema.safeParse('ana_costa').success).toBe(false);
    expect(slugSchema.safeParse('-ana').success).toBe(false);
    expect(slugSchema.safeParse('ana-').success).toBe(false);
    expect(slugSchema.safeParse('ana--costa').success).toBe(false);
    expect(slugSchema.safeParse('ançosta').success).toBe(false);
  });
});

describe('linkDoWhatsapp', () => {
  it('acrescenta o código do país quando falta', () => {
    expect(linkDoWhatsapp('85999998888')).toBe('https://wa.me/5585999998888');
    expect(linkDoWhatsapp('(85) 99999-8888')).toBe('https://wa.me/5585999998888');
  });

  it('não duplica o 55 de quem já digitou completo', () => {
    expect(linkDoWhatsapp('5585999998888')).toBe('https://wa.me/5585999998888');
  });

  it('sem número, sem link', () => {
    expect(linkDoWhatsapp(null)).toBeNull();
  });
});
