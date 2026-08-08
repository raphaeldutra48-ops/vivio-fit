import { TipoMeta } from '@vivio/contracts';
import { describe, expect, it } from 'vitest';
import { calcularProgresso, estaAtrasada } from './aferir';

const peso = (alvo: number | null, inicial: number | null, atual: number | null) =>
  calcularProgresso({ tipo: TipoMeta.PESO_CORPORAL, alvo, inicial, atual });

describe('progresso de meta', () => {
  /*
    O caso que motivou o módulo. Se a régua fosse a distância até zero, 78 kg
    com alvo de 75 daria 97% — porque 78 é quase 75 em valor absoluto. A pessoa
    percorreu 40% do caminho, e é isso que motiva ou acende alerta.
  */
  describe('meta de redução', () => {
    it('mede o caminho percorrido desde o início, não a distância até zero', () => {
      // De 80 para 75, está em 78: andou 2 de 5.
      expect(peso(75, 80, 78).progresso).toBe(40);
    });

    it('atinge ao chegar no alvo ou passar dele', () => {
      expect(peso(75, 80, 75).atingida).toBe(true);
      expect(peso(75, 80, 73).atingida).toBe(true);
      expect(peso(75, 80, 76).atingida).toBe(false);
    });

    it('passar do alvo não passa de 100%', () => {
      expect(peso(75, 80, 70).progresso).toBe(100);
    });
  });

  describe('meta de ganho', () => {
    it('a direção sai dos números, sem o profissional declarar', () => {
      // De 60 para 80 de carga, está em 70: metade.
      const r = calcularProgresso({
        tipo: TipoMeta.CARGA_EXERCICIO,
        alvo: 80,
        inicial: 60,
        atual: 70,
      });
      expect(r.progresso).toBe(50);
      expect(r.atingida).toBe(false);
    });

    it('atinge ao alcançar o alvo', () => {
      const r = calcularProgresso({
        tipo: TipoMeta.CARGA_EXERCICIO,
        alvo: 80,
        inicial: 60,
        atual: 85,
      });
      expect(r.atingida).toBe(true);
      expect(r.progresso).toBe(100);
    });
  });

  /*
    Barra negativa não desenha, e "-30%" faz o profissional pensar em erro de
    conta em vez de olhar o aluno. A regressão aparece em `valorAtual`, que é o
    dado honesto.
  */
  it('regredir mostra 0, não número negativo', () => {
    expect(peso(75, 80, 84).progresso).toBe(0);
    expect(peso(75, 80, 84).atingida).toBe(false);
  });

  /** "Continue nos 75 kg" — não há caminho a percorrer, e dividir daria infinito. */
  describe('meta de manutenção (alvo igual ao inicial)', () => {
    it('vale 100 enquanto o valor não sair de lá', () => {
      expect(peso(75, 75, 75)).toEqual({ progresso: 100, atingida: true });
    });

    it('sair do valor zera', () => {
      expect(peso(75, 75, 77)).toEqual({ progresso: 0, atingida: false });
    });
  });

  describe('sem dado suficiente', () => {
    it('sem valor atual, não há progresso nem conclusão', () => {
      expect(peso(75, 80, null)).toEqual({ progresso: null, atingida: false });
    });

    /*
      Sem valor inicial não há régua — mas atingir ainda é aferível. Melhor não
      mostrar barra do que mostrar uma barra inventada.
    */
    it('sem valor inicial, afere conclusão mas não mostra barra', () => {
      expect(peso(75, null, 75)).toEqual({ progresso: null, atingida: true });
      expect(peso(75, null, 78)).toEqual({ progresso: null, atingida: false });
    });

    it('meta LIVRE nunca é aferida sozinha', () => {
      const r = calcularProgresso({ tipo: TipoMeta.LIVRE, alvo: 10, inicial: 0, atual: 10 });
      expect(r).toEqual({ progresso: null, atingida: false });
    });
  });
});

describe('atraso', () => {
  const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000);

  it('prazo vencido sem atingir é atraso', () => {
    expect(estaAtrasada(ontem, false)).toBe(true);
  });

  /** Cumprir depois do prazo é cumprir. Marcar de vermelho puniria o sucesso. */
  it('atingida nunca está atrasada, mesmo com prazo vencido', () => {
    expect(estaAtrasada(ontem, true)).toBe(false);
  });

  it('prazo no futuro não é atraso', () => {
    expect(estaAtrasada(amanha, false)).toBe(false);
  });

  it('sem prazo nunca atrasa', () => {
    expect(estaAtrasada(null, false)).toBe(false);
  });
});
