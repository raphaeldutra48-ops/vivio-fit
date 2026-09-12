import { describe, expect, it } from 'vitest';
import {
  MAXIMO_DE_CANDIDATOS,
  PONTUACAO_MINIMA_PARA_SUGERIR,
  deveSugerir,
  montarLeituraDeDieta,
  normalizarParaBusca,
  palavrasSignificativas,
  pontuarCandidato,
  type AlimentoCandidato,
  type DietaExtraida,
} from './importacao-dieta';

/**
 * O casamento entre o que a dieta diz e o que o catálogo tem.
 *
 * É aqui que a importação acerta ou erra. A leitura do documento é feita pelo
 * modelo; a decisão de qual alimento é qual acontece neste arquivo, sobre dado
 * que o servidor conhece — e é a parte que dá para provar sem depender de rede.
 */

describe('normalizarParaBusca', () => {
  it('tira acento, caixa e pontuação', () => {
    expect(normalizarParaBusca('Arroz Branco, Cozido')).toBe('arroz branco cozido');
    expect(normalizarParaBusca('Feijão-Preto')).toBe('feijao preto');
    expect(normalizarParaBusca('  Açúcar   mascavo ')).toBe('acucar mascavo');
  });

  /* O documento é escrito por gente: espaço duplo e maiúscula solta são a regra. */
  it('duas escritas do mesmo alimento chegam ao mesmo texto', () => {
    expect(normalizarParaBusca('PÃO integral')).toBe(normalizarParaBusca('pao Integral'));
  });
});

describe('palavrasSignificativas', () => {
  it('descarta preposição e palavra curta', () => {
    expect(palavrasSignificativas('peito de frango grelhado')).toEqual([
      'peito',
      'frango',
      'grelhado',
    ]);
  });
});

describe('pontuarCandidato', () => {
  it('nome idêntico vale 1', () => {
    expect(pontuarCandidato('Arroz branco cozido', 'arroz branco, cozido')).toBe(1);
  });

  /*
    O caso comum da vida real: a nutri escreve curto, o catálogo é específico.
    Tem de casar forte, senão a importação exige escolha manual em toda linha.
  */
  it('o que foi lido cabendo inteiro no catálogo pontua alto', () => {
    const p = pontuarCandidato('arroz', 'Arroz branco cozido');
    expect(p).toBeGreaterThanOrEqual(PONTUACAO_MINIMA_PARA_SUGERIR);
    // Mas não 1: "arroz" também caberia em "arroz integral".
    expect(p).toBeLessThan(1);
  });

  /*
    O denominador é o texto LIDO. Se fosse o do catálogo, um alimento de nome
    longo e específico seria punido justamente por ser preciso.
  */
  it('nome longo no catálogo não é punido por ser específico', () => {
    const curto = pontuarCandidato('frango', 'Frango');
    const longo = pontuarCandidato('frango', 'Peito de frango grelhado sem pele');
    expect(longo).toBeGreaterThanOrEqual(PONTUACAO_MINIMA_PARA_SUGERIR);
    expect(curto).toBeGreaterThanOrEqual(longo);
  });

  it('alimento diferente pontua abaixo do corte', () => {
    expect(pontuarCandidato('arroz branco', 'Feijão preto')).toBeLessThan(
      PONTUACAO_MINIMA_PARA_SUGERIR,
    );
  });

  /*
    O par que mais aparece junto numa dieta brasileira. Confundir os dois troca
    o macro inteiro da refeição, então tem de ficar longe do corte.
  */
  it('arroz não casa com feijão', () => {
    expect(pontuarCandidato('arroz', 'Feijão carioca cozido')).toBe(0);
  });

  /*
    A dieta escreve no plural, a tabela cataloga no singular. Com o catálogo
    completo isto apontava "ovos inteiros mexidos" para "Macarrão com ovos" —
    o único item que por acaso escrevia no plural.
  */
  it('plural da dieta casa com singular do catálogo', () => {
    expect(pontuarCandidato('ovos inteiros', 'Ovo de galinha inteiro cozido')).toBeGreaterThanOrEqual(
      PONTUACAO_MINIMA_PARA_SUGERIR,
    );
    expect(pontuarCandidato('folhas', 'Alface crespa folha crua')).toBeGreaterThan(0);
  });

  it('texto sem palavra significativa não pontua', () => {
    expect(pontuarCandidato('de', 'Arroz branco')).toBe(0);
    expect(pontuarCandidato('', 'Arroz branco')).toBe(0);
  });

  /* Integral e branco são o mesmo alimento com macro diferente. */
  it('distingue variações que mudam o macro', () => {
    const integral = pontuarCandidato('arroz integral', 'Arroz integral cozido');
    const branco = pontuarCandidato('arroz integral', 'Arroz branco cozido');
    expect(integral).toBeGreaterThan(branco);
  });
});

/**
 * Quando NÃO sugerir.
 *
 * As duas razões vêm de erros diferentes: sugerir algo fraco e sugerir um
 * entre iguais. A segunda só apareceu com o catálogo completo — e é a pior das
 * duas, porque a sugestão chega com pontuação alta e cara de conferida.
 */
describe('deveSugerir', () => {
  it('sugere o campeão isolado acima do corte', () => {
    expect(deveSugerir([0.95, 0.5])).toBe(true);
    expect(deveSugerir([1])).toBe(true);
  });

  it('não sugere abaixo do corte', () => {
    expect(deveSugerir([0.5, 0.33])).toBe(false);
  });

  /*
    "azeite" casa igual com "Azeite de oliva" e "Azeite de dendê" — gorduras
    completamente diferentes. O desempate era alfabético, então o dendê vinha
    pré-selecionado. Quem sabe qual era é quem escreveu o documento.
  */
  it('não sugere quando o topo empata', () => {
    expect(deveSugerir([0.95, 0.95])).toBe(false);
    expect(deveSugerir([1, 1, 0.5])).toBe(false);
  });

  it('sem candidato não sugere', () => {
    expect(deveSugerir([])).toBe(false);
  });
});

describe('montarLeituraDeDieta', () => {
  const alimento = (id: string, nome: string): AlimentoCandidato => ({
    id,
    nome,
    medidaCaseira: null,
    medidaGramas: null,
    kcalPor100g: 100,
  });

  const CATALOGO: AlimentoCandidato[] = [
    alimento('a1', 'Arroz, branco, cozido'),
    alimento('a2', 'Arroz, integral, cozido'),
    alimento('a3', 'Feijão, carioca, cozido'),
    alimento('a4', 'Frango, peito, grelhado'),
  ];

  const dieta = (nomeLido: string, extras: Partial<DietaExtraida> = {}): DietaExtraida => ({
    nome: 'Plano da prova',
    observacao: null,
    kcalAlvo: null,
    proteinaAlvoG: null,
    carboAlvoG: null,
    gorduraAlvoG: null,
    avisos: [],
    refeicoes: [
      {
        nome: 'Almoço',
        horarioSugerido: '12:00',
        itens: [
          {
            textoOriginal: `150g de ${nomeLido}`,
            nomeLido,
            quantidadeG: 150,
            medidaCaseiraLida: null,
            observacao: null,
          },
        ],
      },
    ],
    ...extras,
  });

  it('sugere quando um candidato se destaca', () => {
    const r = montarLeituraDeDieta(dieta('frango grelhado'), CATALOGO);
    const item = r.refeicoes[0]!.itens[0]!;

    expect(item.alimentoIdSugerido).toBe('a4');
    expect(item.candidatos[0]!.nome).toContain('Frango');
    // O texto do papel viaja intacto: é o que a pessoa confere contra o
    // documento, e ele não pode ser reescrito pela nossa interpretação.
    expect(item.textoOriginal).toBe('150g de frango grelhado');
    expect(item.quantidadeG).toBe(150);
  });

  it('não sugere quando dois candidatos empatam', () => {
    /*
      "arroz cozido" casa igualmente com o branco e o integral. Sugerir um dos
      dois faria o profissional aceitar com um toque um alimento que o papel não
      diz — e é justamente o toque rápido que a tela incentiva.
    */
    const r = montarLeituraDeDieta(dieta('arroz cozido'), CATALOGO);
    const item = r.refeicoes[0]!.itens[0]!;

    expect(item.candidatos.length).toBeGreaterThan(1);
    expect(item.alimentoIdSugerido).toBeNull();
  });

  it('conta quantos itens ficaram sem candidato', () => {
    const r = montarLeituraDeDieta(dieta('quiabo refogado'), CATALOGO);
    const item = r.refeicoes[0]!.itens[0]!;

    expect(item.candidatos).toEqual([]);
    expect(item.alimentoIdSugerido).toBeNull();
    // O tamanho do trabalho manual, dito de uma vez em vez de a pessoa
    // descobrir item a item.
    expect(r.itensSemCandidato).toBe(1);
  });

  it('mostra no máximo cinco candidatos', () => {
    const muitos = Array.from({ length: 12 }, (_, i) => alimento(`x${i}`, `Arroz tipo ${i}`));
    const r = montarLeituraDeDieta(dieta('arroz'), muitos);
    // Mais que isso vira lista para rolar, não escolha.
    expect(r.refeicoes[0]!.itens[0]!.candidatos.length).toBeLessThanOrEqual(MAXIMO_DE_CANDIDATOS);
  });

  it('os avisos e as metas do documento passam intactos', () => {
    const r = montarLeituraDeDieta(
      dieta('frango grelhado', {
        avisos: ['A quantidade do jantar está rasurada.'],
        kcalAlvo: 2200,
        proteinaAlvoG: 160,
      }),
      CATALOGO,
    );

    // O aviso é o que faz a pessoa olhar duas vezes naquele ponto; perdê-lo
    // seria entregar a leitura como se fosse certa.
    expect(r.avisos).toEqual(['A quantidade do jantar está rasurada.']);
    expect(r.kcalAlvo).toBe(2200);
    expect(r.proteinaAlvoG).toBe(160);
    expect(r.refeicoes[0]!.horarioSugerido).toBe('12:00');
  });

  it('dieta sem refeição nenhuma não quebra a montagem', () => {
    // É o caso do documento que não era um plano alimentar: o modelo devolve
    // vazio e explica em `avisos`.
    const r = montarLeituraDeDieta(
      { ...dieta('x'), refeicoes: [], avisos: ['Isto não parece um plano alimentar.'] },
      CATALOGO,
    );
    expect(r.refeicoes).toEqual([]);
    expect(r.itensSemCandidato).toBe(0);
    expect(r.avisos).toHaveLength(1);
  });
});
