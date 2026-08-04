import { criarPlanoTreinoSchema } from '@vivio/contracts';
import { describe, expect, it } from 'vitest';
import {
  corpoDoTreino,
  podeSalvarTreino,
  problemaDaCarga,
  problemaDasReps,
  problemaDasSeries,
  problemaDoDescanso,
  problemasDoTreino,
  type ItemDeTreinoDigitado,
  type SessaoDigitada,
} from './treino';

const CUID = 'cln00000000000000000001';

const item = (mudanca: Partial<ItemDeTreinoDigitado> = {}): ItemDeTreinoDigitado => ({
  exercicioId: CUID,
  nome: 'Supino reto',
  series: '3',
  repsAlvo: '10-12',
  cargaSugeridaKg: '',
  descansoSeg: '60',
  ...mudanca,
});

const sessao = (itens: ItemDeTreinoDigitado[] = [item()]): SessaoDigitada => ({
  nome: 'Treino A',
  diaSugerido: '',
  itens,
});

describe('problemaDasSeries', () => {
  it('exige inteiro de 1 a 20', () => {
    expect(problemaDasSeries('3')).toBeNull();
    expect(problemaDasSeries('')).toMatch(/preencha/);
    expect(problemaDasSeries('0')).toMatch(/entre 1 e 20/);
    expect(problemaDasSeries('25')).toMatch(/entre 1 e 20/);
    expect(problemaDasSeries('3,5')).toMatch(/inteiro/);
  });
});

describe('problemaDasReps', () => {
  /** É texto livre de propósito: "até a falha" é uma prescrição válida. */
  it('aceita texto que não é número', () => {
    expect(problemaDasReps('10-12')).toBeNull();
    expect(problemaDasReps('até a falha')).toBeNull();
    expect(problemaDasReps('30s')).toBeNull();
  });

  it('recusa vazio e texto longo demais', () => {
    expect(problemaDasReps('   ')).toBe('informe as repetições');
    expect(problemaDasReps('x'.repeat(31))).toMatch(/30 caracteres/);
  });
});

describe('problemaDaCarga', () => {
  /** Zero é carga válida: exercício de peso corporal não tem peso externo. */
  it('aceita zero e aceita ausência', () => {
    expect(problemaDaCarga('0')).toBeNull();
    expect(problemaDaCarga('')).toBeNull();
    expect(problemaDaCarga('62,5')).toBeNull();
  });

  it('recusa acima do teto e texto ilegível', () => {
    expect(problemaDaCarga('1500')).toMatch(/entre 0 e 1000/);
    expect(problemaDaCarga('pesado')).toMatch(/só números/);
  });
});

describe('problemaDoDescanso', () => {
  it('opcional, inteiro, de 0 a 900 segundos', () => {
    expect(problemaDoDescanso('')).toBeNull();
    expect(problemaDoDescanso('90')).toBeNull();
    expect(problemaDoDescanso('90,5')).toMatch(/inteiro/);
    expect(problemaDoDescanso('1200')).toMatch(/entre 0 e 900/);
  });
});

describe('problemasDoTreino', () => {
  it('plano completo não tem problema', () => {
    expect(problemasDoTreino('Full body', [sessao()])).toEqual([]);
    expect(podeSalvarTreino('Full body', [sessao()])).toBe(true);
  });

  it('cobra nome do plano e da sessão', () => {
    expect(problemasDoTreino('F', [sessao()])).toContain('Dê um nome ao plano (ao menos 2 letras).');
    expect(problemasDoTreino('Full body', [{ ...sessao(), nome: '  ' }])).toContain(
      'Sessão 1: dê um nome.',
    );
  });

  it('cobra sessão vazia, chamando-a pelo nome', () => {
    expect(problemasDoTreino('Full body', [sessao(), { ...sessao([]), nome: 'Treino B' }])).toContain(
      '"Treino B" está sem exercícios.',
    );
  });

  /** A regressão: séries apagadas viravam 0 e o servidor recusava. */
  it('nomeia o exercício com as séries apagadas', () => {
    expect(problemasDoTreino('Full body', [sessao([item({ series: '' })])])).toContain(
      'Supino reto em "Treino A": preencha este campo.',
    );
  });

  it('cobra repetições apagadas', () => {
    expect(problemasDoTreino('Full body', [sessao([item({ repsAlvo: '' })])])).toContain(
      'Supino reto em "Treino A": informe as repetições.',
    );
  });
});

describe('corpoDoTreino', () => {
  it('monta um corpo que o schema do servidor aceita', () => {
    const corpo = corpoDoTreino('  Full body  ', '', true, [sessao()]);

    expect(criarPlanoTreinoSchema.safeParse(corpo).success).toBe(true);
    expect(corpo.nome).toBe('Full body');
    expect(corpo.ativar).toBe(true);
    expect(corpo.sessoes[0]!.itens[0]!.series).toBe(3);
  });

  /** Carga em branco é ausência de sugestão; zero seria "sem peso". */
  it('carga e descanso em branco viram ausência, não zero', () => {
    const corpo = corpoDoTreino('Full body', '', false, [
      sessao([item({ cargaSugeridaKg: '', descansoSeg: '' })]),
    ]);

    expect(corpo.sessoes[0]!.itens[0]!.cargaSugeridaKg).toBeUndefined();
    expect(corpo.sessoes[0]!.itens[0]!.descansoSeg).toBeUndefined();
    expect(criarPlanoTreinoSchema.safeParse(corpo).success).toBe(true);
  });

  it('carga zero digitada de propósito chega como zero', () => {
    const corpo = corpoDoTreino('Full body', '', false, [sessao([item({ cargaSugeridaKg: '0' })])]);

    expect(corpo.sessoes[0]!.itens[0]!.cargaSugeridaKg).toBe(0);
    expect(criarPlanoTreinoSchema.safeParse(corpo).success).toBe(true);
  });

  it('vírgula decimal na carga chega como número', () => {
    const corpo = corpoDoTreino('Full body', '', false, [
      sessao([item({ cargaSugeridaKg: '62,5' })]),
    ]);

    expect(corpo.sessoes[0]!.itens[0]!.cargaSugeridaKg).toBe(62.5);
    expect(criarPlanoTreinoSchema.safeParse(corpo).success).toBe(true);
  });

  it('o que o guarda barra é o que o schema recusaria', () => {
    const invalidos: ItemDeTreinoDigitado[] = [
      item({ series: '' }),
      item({ series: '0' }),
      item({ repsAlvo: '' }),
      item({ cargaSugeridaKg: '5000' }),
      item({ descansoSeg: '9999' }),
    ];

    for (const invalido of invalidos) {
      expect(podeSalvarTreino('Full body', [sessao([invalido])])).toBe(false);
      const corpo = corpoDoTreino('Full body', '', false, [sessao([invalido])]);
      expect(criarPlanoTreinoSchema.safeParse(corpo).success).toBe(false);
    }
  });
});
