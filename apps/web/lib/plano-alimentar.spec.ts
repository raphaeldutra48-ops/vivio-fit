import { salvarReceitaSchema, salvarRefeicaoSchema } from '@vivio/contracts';
import { describe, expect, it } from 'vitest';
import {
  corpoDaReceita,
  corpoDaRefeicao,
  podeSalvarReceita,
  podeSalvarRefeicao,
  problemaDasGramas,
  problemaDasPorcoes,
  problemaDoHorario,
  problemaDoItem,
  problemaDoRendimento,
  problemaDoTempo,
  problemasDaReceita,
  problemasDaRefeicao,
  type IngredienteDigitado,
  type ItemDigitado,
} from './plano-alimentar';

/**
 * A última variação da mesma família (pendência 14b): estas telas guardavam
 * `Number(e.target.value)` **direto no estado**. Apagar o campo para redigitar
 * estacionava um `0` visível que ninguém digitou, e o botão travava sem dizer
 * por quê.
 */

const CUID = 'cln00000000000000000001';

const ingrediente = (quantidadeG: string): IngredienteDigitado => ({
  alimentoId: CUID,
  nome: 'Aveia em flocos',
  quantidadeG,
});

describe('problemaDasGramas', () => {
  it('aceita o que o schema aceita, com vírgula', () => {
    expect(problemaDasGramas('120')).toBeNull();
    expect(problemaDasGramas('12,5')).toBeNull();
  });

  /** Vazio e ilegível dizem coisas diferentes — quem digitou algo já preencheu. */
  it('distingue campo vazio de campo ilegível', () => {
    expect(problemaDasGramas('')).toBe('informe as gramas');
    expect(problemaDasGramas('abc')).toBe('use só números');
  });

  it('recusa zero e negativo, que o positive() do schema barra', () => {
    expect(problemaDasGramas('0')).toMatch(/maior que zero/);
    expect(problemaDasGramas('-5')).toMatch(/maior que zero/);
  });
});

describe('problemaDoRendimento', () => {
  /** É o divisor dos macros por porção: zero não é só inválido, quebra a conta. */
  it('explica por que zero não serve', () => {
    expect(problemaDoRendimento('0')).toMatch(/divisor dos macros/);
  });

  it('aceita fração, porque meia porção existe', () => {
    expect(problemaDoRendimento('0,5')).toBeNull();
    expect(problemaDoRendimento('12')).toBeNull();
  });

  it('respeita o teto do schema', () => {
    expect(problemaDoRendimento('250')).toMatch(/no máximo 200/);
  });
});

describe('problemaDoTempo', () => {
  it('em branco não é problema — é opcional', () => {
    expect(problemaDoTempo('')).toBeNull();
    expect(problemaDoTempo('   ')).toBeNull();
  });

  it('exige inteiro dentro da faixa', () => {
    expect(problemaDoTempo('30')).toBeNull();
    expect(problemaDoTempo('30,5')).toMatch(/inteiro/);
    expect(problemaDoTempo('0')).toMatch(/entre 1 e 1440/);
    expect(problemaDoTempo('2000')).toMatch(/entre 1 e 1440/);
  });
});

describe('problemasDaReceita', () => {
  const ok = () => problemasDaReceita('Panqueca', '2', '', [ingrediente('120')]);

  it('receita completa não tem problema', () => {
    expect(ok()).toEqual([]);
    expect(podeSalvarReceita('Panqueca', '2', '', [ingrediente('120')])).toBe(true);
  });

  it('cobra nome, rendimento e ao menos um ingrediente', () => {
    expect(problemasDaReceita('P', '2', '', [ingrediente('120')])).toContain(
      'Dê um nome à receita (ao menos 2 letras).',
    );
    expect(problemasDaReceita('Panqueca', '', '', [ingrediente('120')])).toContain(
      'Rende quantas porções: informe o rendimento.',
    );
    expect(problemasDaReceita('Panqueca', '2', '', [])).toContain(
      'Adicione ao menos um ingrediente.',
    );
  });

  it('nomeia o ingrediente com a quantidade errada', () => {
    expect(problemasDaReceita('Panqueca', '2', '', [ingrediente('')])).toContain(
      'Aveia em flocos: informe as gramas.',
    );
  });
});

describe('corpoDaReceita', () => {
  it('monta um corpo que o schema do servidor aceita', () => {
    const corpo = corpoDaReceita('  Panqueca  ', '', '2', '', '', [ingrediente('120')]);

    expect(salvarReceitaSchema.safeParse(corpo).success).toBe(true);
    expect(corpo.nome).toBe('Panqueca');
    expect(corpo.rendePorcoes).toBe(2);
    expect(corpo.ingredientes[0]!.quantidadeG).toBe(120);
  });

  it('opcionais em branco viram ausência, não string vazia nem zero', () => {
    const corpo = corpoDaReceita('Panqueca', '   ', '2', '  ', '  ', [ingrediente('120')]);

    expect(corpo.modoPreparo).toBeUndefined();
    expect(corpo.nomeDaPorcao).toBeUndefined();
    expect(corpo.tempoMinutos).toBeUndefined();
    expect(salvarReceitaSchema.safeParse(corpo).success).toBe(true);
  });

  it('vírgula decimal chega como número', () => {
    const corpo = corpoDaReceita('Panqueca', '', '1,5', '', '', [ingrediente('12,5')]);

    expect(corpo.rendePorcoes).toBe(1.5);
    expect(corpo.ingredientes[0]!.quantidadeG).toBe(12.5);
    expect(salvarReceitaSchema.safeParse(corpo).success).toBe(true);
  });

  it('o que o guarda barra é o que o schema recusaria', () => {
    for (const invalido of ['', '0', 'abc']) {
      expect(podeSalvarReceita('Panqueca', '2', '', [ingrediente(invalido)])).toBe(false);
      const corpo = corpoDaReceita('Panqueca', '', '2', '', '', [ingrediente(invalido)]);
      expect(salvarReceitaSchema.safeParse(corpo).success).toBe(false);
    }
  });
});

// --- refeição salva ----------------------------------------------------------

const alimento = (quantidade: string): ItemDigitado => ({
  chave: 'a',
  nome: 'Arroz branco cozido',
  ehReceita: false,
  alimentoId: CUID,
  quantidade,
});

const receita = (quantidade: string): ItemDigitado => ({
  chave: 'r',
  nome: 'Panqueca de banana',
  ehReceita: true,
  receitaId: CUID,
  quantidade,
});

describe('problemaDoItem', () => {
  /** Alimento é gramas, receita é porções — a mensagem tem de falar a língua certa. */
  it('fala em gramas para alimento e em porções para receita', () => {
    expect(problemaDoItem(alimento(''))).toBe('informe as gramas');
    expect(problemaDoItem(receita(''))).toBe('informe as porções');
  });

  it('respeita o teto de cada um', () => {
    expect(problemaDasPorcoes('150')).toMatch(/no máximo 100/);
    expect(problemaDasGramas('150')).toBeNull();
  });

  it('meia porção é válida', () => {
    expect(problemaDoItem(receita('0,5'))).toBeNull();
  });
});

describe('problemaDoHorario', () => {
  it('em branco é ausência; preenchido exige HH:MM', () => {
    expect(problemaDoHorario('')).toBeNull();
    expect(problemaDoHorario('07:30')).toBeNull();
    expect(problemaDoHorario('7h30')).toBe('use o formato HH:MM');
    expect(problemaDoHorario('25:00')).toBe('use o formato HH:MM');
  });
});

describe('problemasDaRefeicao', () => {
  it('refeição completa não tem problema', () => {
    expect(problemasDaRefeicao('Café da manhã', '07:00', [alimento('100')])).toEqual([]);
    expect(podeSalvarRefeicao('Café da manhã', '07:00', [alimento('100')])).toBe(true);
  });

  it('cobra nome, horário mal formatado e item ausente', () => {
    expect(problemasDaRefeicao('C', '', [alimento('100')])).toContain(
      'Dê um nome à refeição (ao menos 2 letras).',
    );
    expect(problemasDaRefeicao('Café', '7h', [alimento('100')])).toContain(
      'Horário sugerido: use o formato HH:MM.',
    );
    expect(problemasDaRefeicao('Café', '', [])).toContain('Adicione ao menos um item.');
  });
});

describe('corpoDaRefeicao', () => {
  it('alimento sai em gramas e receita em porções, nunca os dois', () => {
    const corpo = corpoDaRefeicao('Café da manhã', '07:00', '', [
      alimento('100'),
      receita('1,5'),
    ]);

    expect(salvarRefeicaoSchema.safeParse(corpo).success).toBe(true);
    expect(corpo.itens[0]).toEqual({ alimentoId: CUID, quantidadeG: 100 });
    expect(corpo.itens[1]).toEqual({ receitaId: CUID, porcoes: 1.5 });
  });

  it('horário em branco vira ausência', () => {
    const corpo = corpoDaRefeicao('Ceia', '', '', [alimento('100')]);

    expect(corpo.horarioSugerido).toBeUndefined();
    expect(salvarRefeicaoSchema.safeParse(corpo).success).toBe(true);
  });

  it('o que o guarda barra é o que o schema recusaria', () => {
    for (const invalido of ['', '0', 'abc']) {
      expect(podeSalvarRefeicao('Café', '', [alimento(invalido)])).toBe(false);
      const corpo = corpoDaRefeicao('Café', '', '', [alimento(invalido)]);
      expect(salvarRefeicaoSchema.safeParse(corpo).success).toBe(false);
    }
  });
});
