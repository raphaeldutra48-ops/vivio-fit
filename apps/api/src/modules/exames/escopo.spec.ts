import { EscopoMarcador, MARCADORES, Papel, referenciaDe } from '@vivio/contracts';
import { describe, expect, it } from 'vitest';
import { escopoDoPapel, marcadoresVisiveis, podeVerArquivo, podeVerMarcador } from './escopo';

/**
 * Teste de exposição de dado de saúde. Sem banco, sem HTTP — a regra tem de
 * ser conferível sozinha, porque é ela que decide o que cada profissional lê
 * do exame de um paciente.
 */
describe('escopoDoPapel', () => {
  it('médico e aluno veem o exame inteiro', () => {
    expect(escopoDoPapel(Papel.MEDICO)).toBe('TODOS');
    expect(escopoDoPapel(Papel.ALUNO)).toBe('TODOS');
  });

  it('nutricionista vê o escopo nutricional', () => {
    expect(escopoDoPapel(Papel.NUTRICIONISTA)).toBe(EscopoMarcador.NUTRICIONAL);
  });

  /** A regra dura da especificação. */
  it('personal não vê marcador nenhum', () => {
    expect(escopoDoPapel(Papel.PERSONAL)).toBe('NENHUM');
    expect(marcadoresVisiveis(Papel.PERSONAL)).toEqual([]);
  });

  /**
   * Administrar a plataforma não dá direito a ler prontuário. O CareLinkGuard
   * já barra o ADMIN antes daqui; esta é a segunda tranca.
   */
  it('admin não herda visão de ninguém', () => {
    expect(escopoDoPapel(Papel.ADMIN)).toBe('NENHUM');
    expect(marcadoresVisiveis(Papel.ADMIN)).toEqual([]);
  });
});

describe('podeVerMarcador', () => {
  it('o nutricionista lê o que a avaliação nutricional usa', () => {
    expect(podeVerMarcador(Papel.NUTRICIONISTA, 'FERRITINA')).toBe(true);
    expect(podeVerMarcador(Papel.NUTRICIONISTA, 'VITAMINA_D')).toBe(true);
    // Função renal decide carga proteica — é trabalho de nutricionista.
    expect(podeVerMarcador(Papel.NUTRICIONISTA, 'TFG_ESTIMADA')).toBe(true);
  });

  it('o nutricionista não lê o que exige interpretação médica', () => {
    expect(podeVerMarcador(Papel.NUTRICIONISTA, 'TSH')).toBe(false);
    expect(podeVerMarcador(Papel.NUTRICIONISTA, 'PROLACTINA')).toBe(false);
    expect(podeVerMarcador(Papel.NUTRICIONISTA, 'DHEA_S')).toBe(false);
  });

  it('o médico lê todos', () => {
    for (const m of MARCADORES) expect(podeVerMarcador(Papel.MEDICO, m), m).toBe(true);
  });

  it('o personal não lê nenhum', () => {
    for (const m of MARCADORES) expect(podeVerMarcador(Papel.PERSONAL, m), m).toBe(false);
  });

  /** O que o nutricionista vê tem de bater com a etiqueta da tabela. */
  it('o filtro do nutricionista é exatamente o escopo NUTRICIONAL da tabela', () => {
    const visiveis = marcadoresVisiveis(Papel.NUTRICIONISTA);
    const naTabela = MARCADORES.filter(
      (m) => referenciaDe(m).escopo === EscopoMarcador.NUTRICIONAL,
    );

    expect(visiveis.sort()).toEqual(naTabela.sort());
    expect(visiveis.length).toBeGreaterThan(0);
    expect(visiveis.length).toBeLessThan(MARCADORES.length);
  });
});

describe('podeVerArquivo', () => {
  /** O PDF do laboratório é privativo do médico e do titular do dado. */
  it('só médico e aluno', () => {
    expect(podeVerArquivo(Papel.MEDICO)).toBe(true);
    expect(podeVerArquivo(Papel.ALUNO)).toBe(true);
    expect(podeVerArquivo(Papel.NUTRICIONISTA)).toBe(false);
    expect(podeVerArquivo(Papel.PERSONAL)).toBe(false);
    expect(podeVerArquivo(Papel.ADMIN)).toBe(false);
  });

  /**
   * Ver marcador e ver arquivo são permissões diferentes. O nutricionista lê
   * ferritina e continua sem poder abrir o PDF — se um dia alguém alargar o
   * escopo dele, isto continua valendo.
   */
  it('ler marcador não implica poder abrir o arquivo', () => {
    expect(podeVerMarcador(Papel.NUTRICIONISTA, 'FERRITINA')).toBe(true);
    expect(podeVerArquivo(Papel.NUTRICIONISTA)).toBe(false);
  });
});
