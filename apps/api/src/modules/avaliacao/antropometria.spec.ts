import { ProtocoloDobras } from '@vivio/contracts';
import { describe, expect, it } from 'vitest';
import {
  ErroDeCalculo,
  calcularPorBioimpedancia,
  calcularPorDobras,
  densidadeCorporal,
  siri,
} from './antropometria';

/**
 * Teste unitário puro — sem banco, sem HTTP.
 *
 * Os valores esperados vêm do cálculo manual das equações publicadas
 * (Jackson & Pollock para densidade, Siri para percentual). Se alguém mexer num
 * coeficiente, isto quebra antes de virar número errado na tela do paciente.
 */
describe('antropometria', () => {
  describe('Siri', () => {
    it('converte densidade em percentual de gordura', () => {
      // 495/1.05 - 450 = 21.42857...
      expect(siri(1.05)).toBeCloseTo(21.4286, 3);
      // Densidade maior = menos gordura
      expect(siri(1.08)).toBeLessThan(siri(1.05));
    });

    it('recusa densidade inválida', () => {
      expect(() => siri(0)).toThrow(ErroDeCalculo);
    });
  });

  describe('densidade corporal — Jackson & Pollock', () => {
    it('3 dobras masculino confere com a equação publicada', () => {
      // 1.10938 - 0.0008267(60) + 0.0000016(3600) - 0.0002574(30)
      const esperado = 1.10938 - 0.0008267 * 60 + 0.0000016 * 3600 - 0.0002574 * 30;
      expect(densidadeCorporal(ProtocoloDobras.POLLOCK_3, 'M', 60, 30)).toBeCloseTo(esperado, 6);
    });

    it('3 dobras feminino usa coeficientes próprios', () => {
      const esperado = 1.0994921 - 0.0009929 * 60 + 0.0000023 * 3600 - 0.0001392 * 30;
      expect(densidadeCorporal(ProtocoloDobras.POLLOCK_3, 'F', 60, 30)).toBeCloseTo(esperado, 6);
    });

    it('7 dobras difere de 3 dobras para a mesma soma', () => {
      const tres = densidadeCorporal(ProtocoloDobras.POLLOCK_3, 'M', 100, 30);
      const sete = densidadeCorporal(ProtocoloDobras.POLLOCK_7, 'M', 100, 30);
      expect(tres).not.toBeCloseTo(sete, 3);
    });

    /** Envelhecer reduz a densidade estimada — logo, aumenta o percentual. */
    it('idade maior resulta em mais gordura estimada', () => {
      const jovem = siri(densidadeCorporal(ProtocoloDobras.POLLOCK_3, 'M', 60, 20));
      const maduro = siri(densidadeCorporal(ProtocoloDobras.POLLOCK_3, 'M', 60, 50));
      expect(maduro).toBeGreaterThan(jovem);
    });

    it('dobras maiores resultam em mais gordura', () => {
      const magro = siri(densidadeCorporal(ProtocoloDobras.POLLOCK_3, 'M', 30, 30));
      const gordo = siri(densidadeCorporal(ProtocoloDobras.POLLOCK_3, 'M', 90, 30));
      expect(gordo).toBeGreaterThan(magro);
    });
  });

  describe('cálculo completo por dobras', () => {
    it('homem, Pollock 3, valores típicos', () => {
      const r = calcularPorDobras({
        protocolo: ProtocoloDobras.POLLOCK_3,
        sexo: 'M',
        idade: 30,
        pesoKg: 80,
        alturaCm: 178,
        dobras: { PEITORAL: 10, ABDOMINAL: 20, COXA: 15 },
      });

      expect(r.somaDobrasMm).toBe(45);
      // Faixa plausível para essas dobras nesta idade
      expect(r.percentualGordura).toBeGreaterThan(8);
      expect(r.percentualGordura).toBeLessThan(18);
      // As três partes têm que fechar: gorda + magra = peso
      expect(r.massaGordaKg + r.massaMagraKg).toBeCloseTo(80, 1);
      expect(r.imc).toBeCloseTo(25.2, 1);
    });

    it('mulher, Pollock 3, usa as dobras dela', () => {
      const r = calcularPorDobras({
        protocolo: ProtocoloDobras.POLLOCK_3,
        sexo: 'F',
        idade: 28,
        pesoKg: 62,
        dobras: { TRICEPS: 18, SUPRAILIACA: 14, COXA: 25 },
      });

      expect(r.somaDobrasMm).toBe(57);
      expect(r.percentualGordura).toBeGreaterThan(15);
      expect(r.percentualGordura).toBeLessThan(32);
      expect(r.massaGordaKg + r.massaMagraKg).toBeCloseTo(62, 1);
    });

    it('Pollock 7 soma as sete dobras', () => {
      const r = calcularPorDobras({
        protocolo: ProtocoloDobras.POLLOCK_7,
        sexo: 'M',
        idade: 35,
        pesoKg: 85,
        dobras: {
          PEITORAL: 12,
          AXILAR_MEDIA: 14,
          TRICEPS: 10,
          SUBESCAPULAR: 16,
          ABDOMINAL: 22,
          SUPRAILIACA: 18,
          COXA: 15,
        },
      });
      expect(r.somaDobrasMm).toBe(107);
    });

    /** Dobra faltando daria soma menor e resultado baixo demais — tem que recusar. */
    it('recusa quando falta uma dobra do protocolo', () => {
      expect(() =>
        calcularPorDobras({
          protocolo: ProtocoloDobras.POLLOCK_3,
          sexo: 'M',
          idade: 30,
          pesoKg: 80,
          dobras: { PEITORAL: 10, ABDOMINAL: 20 }, // falta COXA
        }),
      ).toThrow(/COXA/);
    });

    /** Erro clássico: digitar centímetros no lugar de milímetros. */
    it('recusa resultado fora da faixa fisiológica', () => {
      expect(() =>
        calcularPorDobras({
          protocolo: ProtocoloDobras.POLLOCK_3,
          sexo: 'M',
          idade: 30,
          pesoKg: 80,
          dobras: { PEITORAL: 1, ABDOMINAL: 1, COXA: 1 },
        }),
      ).toThrow(ErroDeCalculo);
    });

    it('o protocolo feminino ignora dobras que não são dele', () => {
      const r = calcularPorDobras({
        protocolo: ProtocoloDobras.POLLOCK_3,
        sexo: 'F',
        idade: 28,
        pesoKg: 62,
        dobras: { TRICEPS: 18, SUPRAILIACA: 14, COXA: 25, ABDOMINAL: 99 },
      });
      // ABDOMINAL não entra no protocolo feminino de 3 dobras
      expect(r.somaDobrasMm).toBe(57);
    });
  });

  describe('bioimpedância', () => {
    it('deriva massa gorda e magra do percentual informado', () => {
      const r = calcularPorBioimpedancia({ pesoKg: 70, percentualGordura: 25, alturaCm: 165 });

      expect(r.massaGordaKg).toBe(17.5);
      expect(r.massaMagraKg).toBe(52.5);
      expect(r.imc).toBeCloseTo(25.7, 1);
    });

    /** Se a balança informa a massa magra, ela vale mais que a derivada. */
    it('respeita a massa magra informada pela balança', () => {
      const r = calcularPorBioimpedancia({
        pesoKg: 70,
        percentualGordura: 25,
        massaMagraKg: 51.2,
      });
      expect(r.massaMagraKg).toBe(51.2);
    });
  });
});
