import { describe, expect, it } from 'vitest';
import { crc16, gerarBrCode, normalizarChavePix, validarChavePix } from './pix';

describe('crc16', () => {
  /**
   * Valor de referência do padrão EMV: "123456789" com CRC16-CCITT/FALSE
   * (polinômio 0x1021, inicial 0xFFFF) dá 0x29B1. É o vetor que a própria
   * especificação usa, e o que garante que o código será aceito pelo banco.
   */
  it('bate com o vetor de referência do padrão', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('sempre devolve 4 dígitos hexadecimais', () => {
    for (const entrada of ['', 'a', 'PIX', '000201']) {
      expect(crc16(entrada)).toMatch(/^[0-9A-F]{4}$/);
    }
  });
});

describe('gerarBrCode', () => {
  const base = {
    chave: 'teste@exemplo.com',
    recebedor: 'Diego Personal',
    cidade: 'Fortaleza',
  };

  it('monta o payload na estrutura do BR Code', () => {
    const codigo = gerarBrCode({ ...base, valorCentavos: 14990 });

    expect(codigo.startsWith('000201')).toBe(true);
    expect(codigo).toContain('br.gov.bcb.pix');
    expect(codigo).toContain('teste@exemplo.com');
    // 5303986 = moeda BRL; 5406149.90 = valor com 2 casas.
    expect(codigo).toContain('5303986');
    expect(codigo).toContain('5406149.90');
    expect(codigo).toContain('5802BR');
  });

  /** O CRC final tem que fechar sobre o próprio payload. */
  it('o código gerado valida contra o próprio CRC', () => {
    const codigo = gerarBrCode({ ...base, valorCentavos: 5000 });
    const semCrc = codigo.slice(0, -4);
    const crcDoCodigo = codigo.slice(-4);
    expect(crc16(semCrc)).toBe(crcDoCodigo);
  });

  it('sem valor, o pagador digita quanto quer', () => {
    const codigo = gerarBrCode(base);
    expect(codigo).not.toContain('54');
    expect(crc16(codigo.slice(0, -4))).toBe(codigo.slice(-4));
  });

  /** Acento no nome faz parte dos bancos recusarem o código. */
  it('tira acento do recebedor e da cidade', () => {
    const codigo = gerarBrCode({
      ...base,
      recebedor: 'João Gonçalves',
      cidade: 'São Paulo',
    });
    expect(codigo).toContain('JOAO GONCALVES');
    expect(codigo).toContain('SAO PAULO');
    expect(codigo).not.toMatch(/[À-ÿ]/);
  });

  it('respeita os limites de tamanho dos campos', () => {
    const codigo = gerarBrCode({
      ...base,
      recebedor: 'Um Nome Absurdamente Longo Que Nao Cabe No Campo',
      cidade: 'Cidade Com Nome Muito Grande',
    });
    // 59 e 60 declaram o próprio tamanho; 25 e 15 são os máximos do padrão.
    const nome = /59(\d{2})/.exec(codigo)!;
    const cidade = /60(\d{2})/.exec(codigo)!;
    expect(Number(nome[1])).toBeLessThanOrEqual(25);
    expect(Number(cidade[1])).toBeLessThanOrEqual(15);
  });

  it('o identificador vai sem espaço', () => {
    const codigo = gerarBrCode({ ...base, identificador: 'MENSALIDADE MARCO' });
    expect(codigo).toContain('MENSALIDADEMARCO');
  });
});

describe('chave PIX', () => {
  it('normaliza telefone com código do país', () => {
    expect(normalizarChavePix('TELEFONE', '(85) 99999-8888')).toBe('+5585999998888');
    expect(normalizarChavePix('TELEFONE', '5585999998888')).toBe('+5585999998888');
  });

  it('tira pontuação de CPF e CNPJ', () => {
    expect(normalizarChavePix('CPF', '123.456.789-00')).toBe('12345678900');
    expect(normalizarChavePix('CNPJ', '12.345.678/0001-90')).toBe('12345678000190');
  });

  it('recusa chave malformada', () => {
    expect(validarChavePix('CPF', '123')).toContain('11 dígitos');
    expect(validarChavePix('EMAIL', 'nao-e-email')).toContain('inválido');
    expect(validarChavePix('TELEFONE', '999')).toContain('DDD');
    expect(validarChavePix('ALEATORIA', 'curta')).toContain('36');
  });

  it('aceita chave válida', () => {
    expect(validarChavePix('CPF', '123.456.789-00')).toBeNull();
    expect(validarChavePix('EMAIL', 'eu@exemplo.com')).toBeNull();
    expect(validarChavePix('TELEFONE', '85999998888')).toBeNull();
    expect(validarChavePix('ALEATORIA', '123e4567-e89b-12d3-a456-426614174000')).toBeNull();
  });
});
