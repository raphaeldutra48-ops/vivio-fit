import {
  PERGUNTAS_SUGERIDAS,
  salvarModeloAnamneseSchema,
  type PerguntaInput,
} from '@vivio/contracts';
import { describe, expect, it } from 'vitest';
import { corpoDoModelo, podeSalvarModelo, problemasDasPerguntas } from './anamnese';

const pergunta = (parcial: Partial<PerguntaInput> = {}): PerguntaInput => ({
  texto: 'Como está seu sono?',
  tipo: 'TEXTO_LONGO',
  opcoes: [],
  obrigatoria: false,
  ...parcial,
});

describe('problemasDasPerguntas', () => {
  it('aceita um questionário bem formado', () => {
    expect(problemasDasPerguntas([pergunta()])).toEqual([]);
  });

  it('cobra o texto da pergunta e diz qual é', () => {
    const problemas = problemasDasPerguntas([pergunta(), pergunta({ texto: '  ' })]);
    expect(problemas).toEqual(['Pergunta 2: escreva o texto']);
  });

  it('escolha com uma opção só não passa — não é escolha', () => {
    const problemas = problemasDasPerguntas([
      pergunta({ tipo: 'ESCOLHA_UNICA', opcoes: ['Sim'] }),
    ]);
    expect(problemas).toHaveLength(1);
  });

  /** Linha em branco no campo "uma opção por linha" não vale como opção. */
  it('opção vazia não conta para o mínimo de duas', () => {
    const problemas = problemasDasPerguntas([
      pergunta({ tipo: 'ESCOLHA_MULTIPLA', opcoes: ['Sim', ''] }),
    ]);
    expect(problemas).toHaveLength(1);
  });

  it('opções sobrando num tipo que não as usa não atrapalham', () => {
    expect(problemasDasPerguntas([pergunta({ tipo: 'SIM_NAO', opcoes: ['a'] })])).toEqual([]);
  });
});

describe('podeSalvarModelo', () => {
  it('exige nome com pelo menos dois caracteres', () => {
    expect(podeSalvarModelo('A', [pergunta()])).toBe(false);
    expect(podeSalvarModelo('Av', [pergunta()])).toBe(true);
  });

  it('nome só de espaço não vale', () => {
    expect(podeSalvarModelo('   ', [pergunta()])).toBe(false);
  });

  it('modelo sem nenhuma pergunta não salva', () => {
    expect(podeSalvarModelo('Avaliação inicial', [])).toBe(false);
  });
});

describe('corpoDoModelo', () => {
  /**
   * O ponto: o que a tela considera salvável tem de ser exatamente o que o
   * schema do servidor aceita. Divergir aqui é erro que só aparece no envio.
   */
  it('o que passa na tela passa no schema do servidor', () => {
    const perguntas = [
      pergunta(),
      pergunta({ texto: 'Bebe álcool?', tipo: 'ESCOLHA_UNICA', opcoes: ['Não', 'Socialmente'] }),
    ];
    expect(podeSalvarModelo('Avaliação inicial', perguntas)).toBe(true);

    const corpo = corpoDoModelo('  Avaliação inicial  ', ' ', perguntas);
    expect(salvarModeloAnamneseSchema.safeParse(corpo).success).toBe(true);
    expect(corpo.nome).toBe('Avaliação inicial');
    expect(corpo.descricao).toBeUndefined();
  });

  it('descarta opção vazia e espaço em volta antes de enviar', () => {
    const corpo = corpoDoModelo('Modelo', '', [
      pergunta({ tipo: 'ESCOLHA_UNICA', opcoes: ['  Não  ', '', '  ', 'Socialmente'] }),
    ]);
    expect(corpo.perguntas[0]!.opcoes).toEqual(['Não', 'Socialmente']);
    expect(salvarModeloAnamneseSchema.safeParse(corpo).success).toBe(true);
  });

  /** Trocar o tipo depois de digitar opções deixava as antigas penduradas. */
  it('opções somem quando o tipo não as usa', () => {
    const corpo = corpoDoModelo('Modelo', '', [
      pergunta({ tipo: 'TEXTO', opcoes: ['Sobrou', 'Do tipo anterior'] }),
    ]);
    expect(corpo.perguntas[0]!.opcoes).toEqual([]);
  });

  it('ajuda em branco vira ausência, não string vazia', () => {
    const corpo = corpoDoModelo('Modelo', '', [pergunta({ ajuda: '   ' })]);
    expect(corpo.perguntas[0]!.ajuda).toBeUndefined();
    expect(salvarModeloAnamneseSchema.safeParse(corpo).success).toBe(true);
  });

  it('as perguntas sugeridas do produto passam no schema sem retoque', () => {
    const corpo = corpoDoModelo('Sugerido', '', PERGUNTAS_SUGERIDAS.map((p) => ({ ...p })));
    expect(salvarModeloAnamneseSchema.safeParse(corpo).success).toBe(true);
  });
});
