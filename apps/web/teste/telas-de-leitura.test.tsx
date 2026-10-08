import type {
  ComparativoDeEvolucao,
  ExercicioResumo,
  ItemTreinoResumo,
  ListaDeCompras,
  PlanoTreinoCompleto,
  ResumoAluno,
} from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import type { ReactElement, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * As cinco telas que só LEEM: comparativo, lista de compras, metodologia, ajuda
 * e a folha de impressão do treino.
 *
 * Elas fecham a pendência 32, e é honesto dizer por que vêm juntas e por último:
 * nenhuma escreve nada. O risco delas não é corromper dado — é **mentir ou não
 * abrir**. Então a prova pergunta sempre as mesmas três coisas:
 *
 * - a tela ABRE, com o conteúdo que ela promete;
 * - falha de leitura **não** se disfarça de ausência;
 * - o que ela afirma sobre o período, a fonte ou o aluno é o que veio do
 *   servidor, não um padrão inventado na tela.
 *
 * Duas têm algo próprio que vale travar. O **comparativo** é um documento que
 * sai impresso e vai para a mão do aluno: falta de autorização ali não é erro, é
 * decisão dele, e a tela precisa distinguir as duas. A **metodologia** é gerada
 * da mesma tabela de faixas que classifica exame — se ela divergir da tabela, o
 * documento que explica o método passa a descrever outro método.
 */
const montarComparativo = vi.fn();
const obterTreino = vi.fn();
const resumoDoAluno = vi.fn();
const listaDeCompras = vi.fn();
const meusAlunos = vi.fn();

vi.mock('../lib/sdk', () => ({
  sdk: {
    comparativo: { montar: (...a: unknown[]) => montarComparativo(...a) },
    listaDeCompras: { gerar: (...a: unknown[]) => listaDeCompras(...a) },
    vinculos: { meusAlunos: (...a: unknown[]) => meusAlunos(...a) },
    treinos: { obter: (...a: unknown[]) => obterTreino(...a) },
    alunos: { resumo: (...a: unknown[]) => resumoDoAluno(...a) },
  },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ alunoId: 'aluna-1', planoId: 'plano-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('../lib/sessao', () => ({
  useSessao: () => ({
    usuario: { id: 'prof-1', nome: 'Dra. Helena', email: 'h@exemplo.com', papel: 'MEDICO' },
    carregando: false,
  }),
}));

const textoDaTela = () => document.body.textContent ?? '';

const lado = (extras: Record<string, unknown> = {}) => ({
  data: '2026-08-01',
  pesoKg: 82,
  percentualGordura: 28,
  massaMagraKg: 59,
  cinturaCm: 92,
  quadrilCm: null,
  bracoCm: null,
  coxaCm: null,
  toraxCm: null,
  fotos: [],
  ...extras,
});

const comparativo = (extras: Partial<ComparativoDeEvolucao> = {}): ComparativoDeEvolucao =>
  ({
    dias: 60,
    aluno: { id: 'aluna-1', nome: 'Ana Souza' },
    antes: lado(),
    agora: lado({ data: '2026-09-30', pesoKg: 78, percentualGordura: 25, cinturaCm: 86 }),
    diferenca: {
      pesoKg: -4,
      percentualGordura: -3,
      massaMagraKg: 0,
      cinturaCm: -6,
      quadrilCm: null,
      bracoCm: null,
      coxaCm: null,
      toraxCm: null,
    },
    treino: { sessoes: 24, volumeKg: 48000, minutos: 1200 },
    geradoEm: '2026-10-02T12:00:00.000Z',
    ...extras,
  }) as ComparativoDeEvolucao;

/*
  A lista de compras só consulta DEPOIS de ter um aluno: ela sai do plano
  alimentar de alguém. Com a carteira vazia, a tela nem chama o servidor — e a
  primeira versão desta prova esperava um erro que não tinha como acontecer.
*/
/*
  A lista real. A minha primeira fixture era `{ itens, porGrupo, dias }`, que não
  existe em lugar nenhum: o teste do caminho feliz "passava" e a tela estourava
  em `lista.secoes.map` depois de o teste terminar, como exceção solta. Daí a
  regra que vale para toda esta suíte: fixture sai do contrato, e o caminho
  feliz é afirmado na tela — se nada é afirmado, nada foi verificado.
*/
const listaReal = (extras: Partial<ListaDeCompras> = {}): ListaDeCompras =>
  ({
    planoNome: 'Cutting — 1800 kcal',
    dias: 7,
    totalItens: 2,
    geradaEm: '2026-10-02T12:00:00.000Z',
    secoes: [
      {
        secao: 'Açougue, peixaria e ovos',
        itens: [
          {
            alimentoId: 'a1',
            nome: 'Peito de frango',
            quantidadeTotalG: 1050,
            quantidadeFormatada: '1,05 kg',
            equivalencia: null,
            aparecEm: ['Almoço', 'Jantar'],
          },
        ],
      },
      {
        secao: 'Hortifruti',
        itens: [
          {
            alimentoId: 'a2',
            nome: 'Banana',
            quantidadeTotalG: 840,
            quantidadeFormatada: '840 g',
            equivalencia: '≈ 7 unidades',
            aparecEm: ['Café da manhã'],
          },
        ],
      },
    ],
    ...extras,
  }) as ListaDeCompras;

const aluna = {
  id: 'vinculo-1',
  status: 'ATIVO',
  aguardandoMinhaResposta: false,
  tipo: 'NUTRICIONISTA',
  contraparte: { id: 'aluna-1', nome: 'Ana Souza', papel: 'ALUNO', avatarUrl: null },
};

/*
  A folha de treino. A forma vem de `PlanoTreinoCompleto` + `ResumoAluno`, e não
  do que eu supus: minha primeira fixture inventou `profissional` e
  `itens[].repeticoesAlvo`, e a tela quebrou em `plano.personal.nome`. O tipo é
  a fonte, não a lembranca.
*/
const exercicio = (extras: Partial<ExercicioResumo> = {}): ExercicioResumo =>
  ({
    id: 'e1',
    nome: 'Supino reto',
    grupoMuscular: 'PEITO',
    equipamento: 'Barra',
    instrucoes: null,
    escopo: 'GLOBAL',
    temVideo: false,
    temDemonstracao: null,
    criadoPorId: null,
    passos: [],
    imagemUrl: null,
    ...extras,
  }) as ExercicioResumo;

const item = (extras: Partial<ItemTreinoResumo> = {}): ItemTreinoResumo =>
  ({
    id: 'i1',
    ordem: 0,
    series: 3,
    repsAlvo: '8-10',
    cargaSugeridaKg: 40,
    descansoSeg: 90,
    tecnica: null,
    observacao: null,
    supersetGrupo: null,
    exercicio: exercicio(),
    ...extras,
  }) as ItemTreinoResumo;

const plano = (extras: Partial<PlanoTreinoCompleto> = {}): PlanoTreinoCompleto =>
  ({
    id: 'plano-1',
    nome: 'Hipertrofia — bloco 1',
    objetivo: 'Ganho de massa',
    versao: 2,
    status: 'ATIVO',
    criadoEm: '2026-08-20T12:00:00.000Z',
    inicioEm: '2026-09-01T12:00:00.000Z',
    fimEm: null,
    totalSessoes: 1,
    personal: { id: 'prof-1', nome: 'Diego Ramos' },
    sessoes: [
      { id: 's1', nome: 'Treino A — Superiores', ordem: 0, diaSugerido: 1, itens: [item()] },
    ],
    ...extras,
  }) as PlanoTreinoCompleto;

const alunoDoPlano = (extras: Partial<ResumoAluno> = {}): ResumoAluno =>
  ({
    id: 'aluna-1',
    nome: 'Ana Souza',
    email: 'ana@exemplo.com',
    avatarUrl: null,
    idade: 34,
    alturaCm: 165,
    objetivo: 'Ganho de massa',
    equipe: [],
    ...extras,
  }) as ResumoAluno;

beforeEach(() => {
  montarComparativo.mockResolvedValue(comparativo());
  listaDeCompras.mockResolvedValue(listaReal());
  meusAlunos.mockResolvedValue([aluna]);
  obterTreino.mockResolvedValue(plano());
  resumoDoAluno.mockResolvedValue(alunoDoPlano());
});

async function abrir(caminho: string) {
  const modulo = (await import(/* @vite-ignore */ caminho)) as { default: () => ReactElement };
  const Pagina = modulo.default;
  return render(<Pagina />);
}

describe('comparativo: o documento que vai para a mão do aluno', () => {
  it('abre com o nome, o período e os dois lados', async () => {
    await abrir('../app/(pro)/alunos/[alunoId]/comparativo/page');

    await waitFor(() => expect(textoDaTela()).toMatch(/comparativo de evolução/i));
    expect(textoDaTela()).toMatch(/ana souza/i);
    expect(textoDaTela()).toMatch(/60 dias/);
    // Os dois lados e a diferença: é o que o documento existe para mostrar.
    expect(textoDaTela()).toMatch(/82/);
    expect(textoDaTela()).toMatch(/78/);
  });

  it('falta de autorização NÃO é erro — é decisão do aluno, e a tela diz de quem', async () => {
    /*
      A distinção importa porque muda o que o profissional faz: diante de um erro
      ele tenta de novo ou chama o suporte; diante da ausência de autorização,
      ele conversa com o aluno. E a frase diz que a autorização é dada por ele
      mesmo, no aplicativo — senão o profissional pede ao suporte o que só o
      aluno pode dar.
    */
    montarComparativo.mockRejectedValue(
      new ErroApi('CONSENTIMENTO_AUSENTE', 'sem autorização', 403),
    );
    await abrir('../app/(pro)/alunos/[alunoId]/comparativo/page');

    await waitFor(() => expect(textoDaTela()).toMatch(/ainda não autorizou/i));
    expect(textoDaTela()).toMatch(/dada por ele mesmo, no aplicativo/i);
    expect(textoDaTela()).not.toMatch(/não foi possível montar/i);
  });

  it('falha de rede É erro, e não se disfarça de falta de autorização', async () => {
    montarComparativo.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'fetch failed', 0));
    await abrir('../app/(pro)/alunos/[alunoId]/comparativo/page');

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível montar o comparativo/i));
    expect(textoDaTela()).not.toMatch(/ainda não autorizou/i);
    expect(textoDaTela()).not.toMatch(/fetch failed/i);
  });

  it('sem medida no período, diz isso — e não um documento com zeros', async () => {
    montarComparativo.mockResolvedValue(
      comparativo({
        antes: lado({ data: null, pesoKg: null, percentualGordura: null, massaMagraKg: null, cinturaCm: null }),
        agora: lado({ data: null, pesoKg: null, percentualGordura: null, massaMagraKg: null, cinturaCm: null }),
        diferenca: {
          pesoKg: null,
          percentualGordura: null,
          massaMagraKg: null,
          cinturaCm: null,
          quadrilCm: null,
          bracoCm: null,
          coxaCm: null,
          toraxCm: null,
        } as ComparativoDeEvolucao['diferenca'],
      }),
    );
    await abrir('../app/(pro)/alunos/[alunoId]/comparativo/page');

    await waitFor(() => expect(textoDaTela()).toMatch(/nenhuma medida registrada neste período/i));
  });

  it('trocar o período refaz a montagem com o número novo', async () => {
    await abrir('../app/(pro)/alunos/[alunoId]/comparativo/page');
    await waitFor(() => expect(montarComparativo).toHaveBeenCalledWith('aluna-1', 60));

    fireEvent.click(screen.getByText('90 dias'));

    await waitFor(() => expect(montarComparativo).toHaveBeenCalledWith('aluna-1', 90));
  });

  it('o botão de imprimir só existe com documento montado', async () => {
    // "PDF" sai pela impressão do navegador. Imprimir uma tela em branco
    // entregaria ao aluno uma folha com o cabeçalho e nada embaixo.
    montarComparativo.mockReturnValue(new Promise(() => undefined));
    await abrir('../app/(pro)/alunos/[alunoId]/comparativo/page');

    expect(screen.getByText(/imprimir/i).closest('button')).toBeDisabled();
  });
});

describe('lista de compras: derivada do plano', () => {
  it('falha de rede NÃO vira lista vazia', async () => {
    listaDeCompras.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'fetch failed', 0));
    await abrir('../app/(pro)/lista-de-compras/page');

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível gerar a lista/i));
    expect(textoDaTela()).not.toMatch(/fetch failed/i);
  });

  it('aluno SEM plano ativo é dito assim, e não como falha', async () => {
    /*
      As duas situações davam a mesma tela vazia e pedem reações opostas: sem
      plano, o nutricionista monta um; com falha de rede, ele tenta de novo. A
      frase também explica de onde a lista sai, que é o que evita a pergunta
      seguinte.
    */
    listaDeCompras.mockRejectedValue(new ErroApi('RECURSO_NAO_ENCONTRADO', 'sem plano', 404));
    await abrir('../app/(pro)/lista-de-compras/page');

    await waitFor(() => expect(textoDaTela()).toMatch(/não tem plano alimentar ativo/i));
    expect(textoDaTela()).toMatch(/sai do plano em uso/i);
    expect(textoDaTela()).not.toMatch(/não foi possível gerar/i);
  });

  it('escolhe o primeiro aluno sozinha, porque a lista precisa de um', async () => {
    await abrir('../app/(pro)/lista-de-compras/page');

    await waitFor(() => expect(listaDeCompras).toHaveBeenCalledWith('aluna-1', 7));
  });

  it('abre agrupada por seção do mercado, com a quantidade que o servidor somou', async () => {
    /*
      As seções são a razão de a tela existir em vez de uma lista corrida: no
      mercado, a pessoa anda por setor. E a quantidade sai formatada no
      servidor — a tela não recalcula. Se ela reformatasse, a vírgula viraria
      ponto no caminho, e "1,05 kg" é o que a pessoa lê na gôndola.
    */
    await abrir('../app/(pro)/lista-de-compras/page');

    await waitFor(() => expect(textoDaTela()).toMatch(/cutting — 1800 kcal/i));
    expect(textoDaTela()).toMatch(/açougue, peixaria e ovos/i);
    expect(textoDaTela()).toMatch(/hortifruti/i);
    expect(textoDaTela()).toContain('1,05 kg');
    expect(textoDaTela()).not.toContain('1.05 kg');
    // A equivalência caseira é o que torna "840 g de banana" comprável.
    expect(textoDaTela()).toContain('≈ 7 unidades');
    // E diz em que refeições o item entra, que é como se confere o que é.
    expect(textoDaTela()).toMatch(/almoço, jantar/i);
  });

  it('marcar como comprado risca o item, sem apagá-lo da lista', async () => {
    // Riscar é diferente de remover: no meio do mercado, o item riscado ainda
    // precisa estar visível para a pessoa conferir o que já pegou.
    await abrir('../app/(pro)/lista-de-compras/page');
    const marcar = await screen.findByLabelText(/marcar peito de frango como comprado/i);

    fireEvent.click(marcar);

    expect(marcar).toBeChecked();
    expect(textoDaTela()).toMatch(/peito de frango/i);
    expect(textoDaTela()).toMatch(/1 marcados?/i);
  });
});

describe('metodologia: gerada da tabela, não escrita à mão', () => {
  it('cita a fonte de cada faixa que mostra', async () => {
    /*
      O documento explica COMO o app classifica exame, e é gerado da mesma tabela
      que classifica. Se ele fosse escrito à mão, divergiria no dia em que uma
      faixa mudasse — e passaria a descrever um método que o app não usa.
      A fonte citada é o que torna a afirmação auditável por quem entende.
    */
    await abrir('../app/(pro)/metodologia/page');

    await waitFor(() => expect(textoDaTela()).toMatch(/metodologia/i));
    // Toda referência da tabela declara as duas fontes; o documento as mostra.
    expect(textoDaTela()).toMatch(/fonte|diretriz|consenso/i);
  });

  it('afirma a invariante que o código garante: nada é crítico pela funcional', async () => {
    /*
      É a distinção central do módulo — a laboratorial sinaliza doença, a
      funcional sinaliza afastamento do ideal — e é mais que redação: o
      classificador garante isso, e há prova disso em
      `packages/contracts/src/exames.spec.ts` ("normal para o laboratório e fora
      do ideal é Atenção, não Crítico").

      Esta prova amarra o documento à regra. Se o classificador mudar e o texto
      ficar, o documento passa a descrever um método que o app não usa — e é
      justamente este documento que um profissional leria para decidir se confia
      na classificação.
    */
    await abrir('../app/(pro)/metodologia/page');

    await waitFor(() => expect(textoDaTela()).toMatch(/funcional/i));
    expect(textoDaTela()).toMatch(/nada é classificado como crítico por causa da faixa funcional/i);
    expect(textoDaTela()).toMatch(/só sair da faixa do laboratório produz esse selo/i);
  });
});

describe('folha de impressão do treino: o papel que vai para a academia', () => {
  it('abre com o plano, o nome do aluno e os exercícios', async () => {
    /*
      O "PDF" sai pela impressão do navegador, não de um gerador no servidor. O
      que a tela desenha é literalmente o que vai sair no papel — e o papel vai
      para a mão de alguém na academia, onde ninguém tem o app aberto.
    */
    await abrir('../app/(pro)/alunos/[alunoId]/treino/[planoId]/imprimir/page');

    await waitFor(() => expect(textoDaTela()).toMatch(/hipertrofia — bloco 1/i));
    expect(textoDaTela()).toMatch(/ana souza/i);
    expect(textoDaTela()).toMatch(/treino a — superiores/i);
    expect(textoDaTela()).toMatch(/supino reto/i);
    expect(textoDaTela()).toMatch(/8-10/);
  });

  it('falha ao carregar NÃO imprime uma folha em branco', async () => {
    // Imprimir o cabeçalho sem os exercícios entregaria ao aluno um papel que
    // parece um plano e não é.
    obterTreino.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'fetch failed', 0));
    await abrir('../app/(pro)/alunos/[alunoId]/treino/[planoId]/imprimir/page');

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível carregar este plano/i));
    expect(screen.queryByText(/salvar em pdf/i)).not.toBeInTheDocument();
    expect(textoDaTela()).not.toMatch(/fetch failed/i);
  });

  it('diz que a prescrição é individual, e não para ser repassada', async () => {
    // O papel circula: sai da academia, vai para o grupo da família. A frase é o
    // que diz a quem receber que aquilo foi feito para outra pessoa.
    await abrir('../app/(pro)/alunos/[alunoId]/treino/[planoId]/imprimir/page');

    await waitFor(() => expect(textoDaTela()).toMatch(/prescrição de treino individual/i));
  });

  it('o que é controle de tela não vai para o papel', async () => {
    /*
      O botão de imprimir e a explicação de como salvar em PDF são marcados com
      `data-nao-imprime`. Sem isso, o papel sai com um botão desenhado nele.

      Contar `[data-nao-imprime]` não serviria: com dois elementos marcados,
      perder um ainda deixaria a contagem acima de zero. A pergunta é se CADA
      controle está dentro de algo que não imprime.
    */
    await abrir('../app/(pro)/alunos/[alunoId]/treino/[planoId]/imprimir/page');

    const botao = await screen.findByText(/salvar em pdf/i);
    expect(botao.closest('[data-nao-imprime]')).not.toBeNull();
    expect(screen.getByText(/voltar para a ficha/i).closest('[data-nao-imprime]')).not.toBeNull();
    expect(screen.getByText(/escolha/i).closest('[data-nao-imprime]')).not.toBeNull();
    // E o documento em si NÃO é marcado — senão o papel sai em branco.
    expect(screen.getByText('Hipertrofia — bloco 1').closest('[data-nao-imprime]')).toBeNull();
  });

  it('cada série tem uma linha em branco para anotar a carga', async () => {
    /*
      É o ponto da folha, e está escrito na própria tela: ficha impressa serve
      para **escrever em cima** — quem treina anota o que conseguiu e leva de
      volta ao professor. Sem a coluna, o papel é um cartaz.
    */
    await abrir('../app/(pro)/alunos/[alunoId]/treino/[planoId]/imprimir/page');

    await waitFor(() => expect(screen.getByText('Feito')).toBeInTheDocument());
    const linha = screen.getByText(/supino reto/i).closest('tr')!;
    const celulas = linha.querySelectorAll('td');
    // Três séries → três espaços, não um só: a anotação é por série.
    expect(celulas[celulas.length - 1]!.textContent).toMatch(/___ ___ ___/);
  });
});

describe('ajuda: a tela que explica as outras', () => {
  it('abre com as seções, e não vazia', async () => {
    await abrir('../app/(pro)/ajuda/page');

    await waitFor(() => expect(textoDaTela()).toMatch(/ajuda/i));
    expect(textoDaTela()).not.toMatch(/nada por aqui/i);
  });
});
