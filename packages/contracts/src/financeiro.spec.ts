import { describe, expect, it } from 'vitest';
import {
  formatarDinheiro,
  montarCobrancaResumo,
  montarResumoFinanceiro,
  paraCentavos,
  somarMeses,
  vencimentosDaSerie,
  type LinhaDeCobranca,
} from './financeiro';

describe('paraCentavos', () => {
  it('aceita o formato brasileiro', () => {
    expect(paraCentavos('149,90')).toBe(14990);
    expect(paraCentavos('1.234,56')).toBe(123456);
    expect(paraCentavos('R$ 89,90')).toBe(8990);
    expect(paraCentavos('R$ 1.500,00')).toBe(150000);
  });

  it('aceita ponto como decimal, que é como o teclado numérico digita', () => {
    expect(paraCentavos('149.90')).toBe(14990);
    expect(paraCentavos('89.9')).toBe(8990);
  });

  it('aceita inteiro sem centavos', () => {
    expect(paraCentavos('150')).toBe(15000);
    expect(paraCentavos('1.500')).toBe(150000);
  });

  /** Arredondar errado aqui vira diferença de um centavo no fechamento do mês. */
  it('arredonda em vez de truncar', () => {
    expect(paraCentavos('0,015')).toBe(2);
    expect(paraCentavos('10,999')).toBe(1100);
  });

  it('recusa o que não é dinheiro', () => {
    expect(paraCentavos('')).toBeNull();
    expect(paraCentavos('abc')).toBeNull();
    expect(paraCentavos('0')).toBeNull();
    expect(paraCentavos('-50')).toBeNull();
  });
});

describe('formatarDinheiro', () => {
  it('formata em real, com vírgula decimal', () => {
    expect(formatarDinheiro(14990).replace(/ /g, ' ')).toBe('R$ 149,90');
    expect(formatarDinheiro(0).replace(/ /g, ' ')).toBe('R$ 0,00');
    expect(formatarDinheiro(100000).replace(/ /g, ' ')).toBe('R$ 1.000,00');
  });

  /** Ida e volta precisa fechar: é o valor que o profissional confere. */
  it('formatar e converter de volta dá o mesmo valor', () => {
    for (const centavos of [1, 99, 14990, 123456, 100000000]) {
      expect(paraCentavos(formatarDinheiro(centavos))).toBe(centavos);
    }
  });
});

describe('somarMeses', () => {
  const em = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
  const dia = (d: Date): string => d.toISOString().slice(0, 10);

  it('dia 31 em fevereiro vira o último dia do mês', () => {
    /*
      O `Date` do JS levaria 31 de janeiro para 3 de março, e a parcela de
      fevereiro apareceria em março — o profissional veria dois vencimentos no
      mesmo mês e nenhum no anterior.
    */
    expect(dia(somarMeses(em('2026-01-31'), 1))).toBe('2026-02-28');
    expect(dia(somarMeses(em('2028-01-31'), 1))).toBe('2028-02-29');
    expect(dia(somarMeses(em('2026-01-31'), 3))).toBe('2026-04-30');
  });

  it('o dia volta ao original nos meses que o comportam', () => {
    // Presa em 28 para sempre, a mensalidade do dia 31 mudaria de data depois
    // do primeiro fevereiro.
    expect(dia(somarMeses(em('2026-01-31'), 2))).toBe('2026-03-31');
  });

  it('atravessa o ano', () => {
    expect(dia(somarMeses(em('2026-12-15'), 1))).toBe('2027-01-15');
  });
});

describe('vencimentosDaSerie', () => {
  it('uma parcela é uma data só', () => {
    expect(vencimentosDaSerie('2026-05-10', 1)).toEqual(['2026-05-10']);
  });

  it('doze parcelas são um ano de mensalidade', () => {
    const datas = vencimentosDaSerie('2026-01-10', 12);
    expect(datas).toHaveLength(12);
    expect(datas.at(-1)).toBe('2026-12-10');
  });
});

describe('situacaoDaCobranca', () => {
  const cobranca = (p: Partial<LinhaDeCobranca> = {}): LinhaDeCobranca => ({
    id: 'c1',
    aluno: { id: 'a1', nome: 'Ana' },
    descricao: 'Mensalidade',
    valorCentavos: 19_900,
    vencimento: '2026-03-10',
    status: 'PENDENTE',
    pagaEm: null,
    formaPagamento: null,
    observacao: null,
    ...p,
  });
  const hoje = new Date('2026-03-15T00:00:00.000Z');

  it('vencida e não paga é ATRASADA, com os dias contados', () => {
    const r = montarCobrancaResumo(cobranca(), hoje);
    expect(r.situacao).toBe('ATRASADA');
    expect(r.diasDeAtraso).toBe(5);
  });

  it('vencer hoje ainda não é atrasar', () => {
    // O dia do vencimento é o último dia para pagar, não o primeiro de atraso.
    const r = montarCobrancaResumo(cobranca({ vencimento: '2026-03-15' }), hoje);
    expect(r.situacao).toBe('PENDENTE');
    expect(r.diasDeAtraso).toBeNull();
  });

  it('paga e cancelada vencem a data', () => {
    // Uma cobrança quitada com atraso não continua atrasada.
    expect(montarCobrancaResumo(cobranca({ status: 'PAGA' }), hoje).situacao).toBe('PAGA');
    expect(montarCobrancaResumo(cobranca({ status: 'CANCELADA' }), hoje).situacao).toBe(
      'CANCELADA',
    );
  });
});

describe('montarResumoFinanceiro', () => {
  const hoje = new Date('2026-03-15T00:00:00.000Z');
  const linha = (
    id: string,
    status: string,
    vencimento: string,
    valorCentavos = 10_000,
    alunoId = 'a1',
  ): LinhaDeCobranca => ({
    id,
    aluno: { id: alunoId, nome: alunoId },
    descricao: 'Mensalidade',
    valorCentavos,
    vencimento,
    status,
    pagaEm: status === 'PAGA' ? vencimento : null,
    formaPagamento: null,
    observacao: null,
  });

  const doMes = [
    linha('paga', 'PAGA', '2026-03-05', 20_000),
    linha('atrasada', 'PENDENTE', '2026-03-01', 15_000, 'a2'),
    linha('outra-atrasada', 'PENDENTE', '2026-03-02', 5_000, 'a2'),
    linha('a-vencer', 'PENDENTE', '2026-03-30', 10_000, 'a3'),
    linha('cancelada', 'CANCELADA', '2026-03-08', 99_000),
  ];

  it('os totais são do mês inteiro, mesmo com a lista filtrada', () => {
    /*
      Filtrar por "atrasada" não pode zerar o que já foi recebido: o
      profissional olharia a tela de cobrança e concluiria que não entrou nada
      no mês.
    */
    const r = montarResumoFinanceiro({ mes: '2026-03', cobrancas: doMes, situacao: 'ATRASADA', hoje });

    expect(r.cobrancas.map((c) => c.id)).toEqual(['atrasada', 'outra-atrasada']);
    expect(r.recebidoCentavos).toBe(20_000);
    expect(r.aReceberCentavos).toBe(10_000);
    expect(r.atrasadoCentavos).toBe(20_000);
  });

  it('cancelada não entra em soma nenhuma', () => {
    // Ela é o registro de uma cobrança que deixou de valer — somá-la em "a
    // receber" faria o profissional contar com dinheiro que ninguém deve.
    const r = montarResumoFinanceiro({ mes: '2026-03', cobrancas: doMes, hoje });
    expect(r.recebidoCentavos + r.aReceberCentavos + r.atrasadoCentavos).toBe(50_000);
  });

  it('conta alunos em atraso, e não cobranças atrasadas', () => {
    // Duas parcelas do mesmo aluno são um aluno em atraso. O número é para
    // saber quantas conversas o profissional precisa ter.
    const r = montarResumoFinanceiro({ mes: '2026-03', cobrancas: doMes, hoje });
    expect(r.alunosEmAtraso).toBe(1);
  });

  it('mês sem cobrança é um painel de zeros', () => {
    const r = montarResumoFinanceiro({ mes: '2026-04', cobrancas: [], hoje });
    expect(r).toMatchObject({
      recebidoCentavos: 0,
      aReceberCentavos: 0,
      atrasadoCentavos: 0,
      alunosEmAtraso: 0,
      cobrancas: [],
    });
  });
});
