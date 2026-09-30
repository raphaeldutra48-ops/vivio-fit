import { ErroApi } from '@vivio/sdk';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * As quatro últimas falhas caladas do painel.
 *
 * A varredura de 30/09 deixou estas quatro julgadas como "aceitáveis" — e
 * revendo com o objetivo de começar teste real, nenhuma é. Todas escondem
 * informação de quem está prescrevendo ou acompanhando, e o padrão é o mesmo de
 * sempre: a tela degrada em silêncio e o silêncio se lê como resposta.
 *
 * - **A carteira de alunos:** sem o relatório, NENHUM aluno aparece marcado como
 *   precisando de atenção. Quem parou de treinar ou de fazer check-in é
 *   exatamente quem desaparece nesse silêncio — e a tela dizia "Ativo" para
 *   todos.
 * - **Os cardápios:** o plano que serviria de molde não aparecia na lista, e o
 *   seletor de alunos escrevia "Nenhum aluno ativo" para quem tem trinta.
 * - **As prescrições:** o atalho "partir de um modelo" desaparecia, e sem ele a
 *   posologia é redigitada à mão — é redigitando que se troca "1 comprimido" por
 *   "1 mL".
 * - **O catálogo de alimentos:** o filtro por grupo ficava vazio na tabela de
 *   onde sai o cálculo de todo cardápio.
 */
const meusAlunos = vi.fn();
const carteira = vi.fn();
const listarCardapios = vi.fn();
const listarDietas = vi.fn();
const listarPrescricoes = vi.fn();
const listarModelosPrescricao = vi.fn();
const gruposDeAlimentos = vi.fn();
const listarAlimentos = vi.fn();

vi.mock('../lib/sdk', () => ({
  sdk: {
    vinculos: { meusAlunos: (...a: unknown[]) => meusAlunos(...a), convidar: vi.fn() },
    relatorios: { carteira: (...a: unknown[]) => carteira(...a) },
    cardapios: {
      listar: (...a: unknown[]) => listarCardapios(...a),
      salvarDoPlano: vi.fn(),
      aplicar: vi.fn(),
      remover: vi.fn(),
    },
    dietas: { listar: (...a: unknown[]) => listarDietas(...a) },
    prescricoes: { listar: (...a: unknown[]) => listarPrescricoes(...a), emitir: vi.fn() },
    modelosPrescricao: { listar: (...a: unknown[]) => listarModelosPrescricao(...a) },
    /*
      O editor de itens da prescrição busca o catálogo do profissional. Sem ele no
      dublê, abrir o formulário derruba o render — e a prova falharia por um
      motivo que não é o dela.
    */
    prescritiveis: {
      listar: vi.fn(() => Promise.resolve([])),
      criar: vi.fn(),
      remover: vi.fn(),
    },
    alimentos: {
      grupos: (...a: unknown[]) => gruposDeAlimentos(...a),
      listar: (...a: unknown[]) => listarAlimentos(...a),
    },
  },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ alunoId: 'aluna-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

vi.mock('../lib/sessao', () => ({
  useSessao: () => ({
    usuario: { id: 'prof-1', nome: 'Dra. Helena', email: 'h@exemplo.com', papel: 'MEDICO' },
    carregando: false,
  }),
}));

const vinculo = (id: string, nome: string) => ({
  id: `v-${id}`,
  status: 'ATIVO',
  aguardandoMinhaResposta: false,
  tipo: 'MEDICO',
  contraparte: { id, nome, papel: 'ALUNO', avatarUrl: null },
});

const semRede = () => new ErroApi('ERRO_DE_REDE', 'fetch failed', 0);
const textoDaTela = () => document.body.textContent ?? '';

beforeEach(() => {
  meusAlunos.mockResolvedValue([vinculo('aluna-1', 'Ana Souza')]);
  carteira.mockResolvedValue({ linhas: [], geradoEm: new Date().toISOString(), dias: 30 });
  listarCardapios.mockResolvedValue([]);
  listarDietas.mockResolvedValue([]);
  listarPrescricoes.mockResolvedValue([]);
  listarModelosPrescricao.mockResolvedValue([]);
  gruposDeAlimentos.mockResolvedValue(['CEREAIS', 'LEGUMINOSAS']);
  listarAlimentos.mockResolvedValue([]);
});

describe('carteira de alunos', () => {
  it('falha no relatório NÃO faz todo mundo parecer bem', async () => {
    carteira.mockRejectedValue(semRede());
    const { default: Alunos } = await import('../app/(pro)/alunos/page');
    render(<Alunos />);

    await waitFor(() =>
      expect(textoDaTela()).toMatch(/não foi possível conferir quem precisa de atenção/i),
    );
    // A lista continua útil: o aluno está lá, só sem o selo conferido.
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
  });

  it('relatório respondido não deixa aviso nenhum', async () => {
    const { default: Alunos } = await import('../app/(pro)/alunos/page');
    render(<Alunos />);

    await waitFor(() => expect(screen.getByText('Ana Souza')).toBeInTheDocument());
    expect(textoDaTela()).not.toMatch(/não foi possível conferir quem precisa/i);
  });
});

describe('cardápios', () => {
  it('plano ilegível de um aluno é CONTADO, e a lista se declara incompleta', async () => {
    /*
      Antes o `.catch(() => [])` por aluno fazia o plano desaparecer da lista de
      origem. O profissional procura um plano que ele sabe que existe, não acha, e
      conclui que precisa montar de novo.
    */
    listarDietas.mockRejectedValue(semRede());
    const { default: Cardapios } = await import('../app/(pro)/plano-alimentar/cardapios/page');
    render(<Cardapios />);

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível ler os planos de 1 aluno/i));
    expect(textoDaTela()).toMatch(/lista incompleta/i);
  });

  it('sem alunos por falha, o seletor "aplicar em" diz isso', async () => {
    meusAlunos.mockRejectedValue(semRede());
    const { default: Cardapios } = await import('../app/(pro)/plano-alimentar/cardapios/page');
    render(<Cardapios />);

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível carregar seus alunos/i));
    expect(textoDaTela()).not.toMatch(/nenhum aluno ativo/i);
  });
});

describe('prescrições do aluno', () => {
  it('modelos ilegíveis avisam para não redigitar a posologia', async () => {
    listarModelosPrescricao.mockRejectedValue(semRede());
    const { default: Prescricoes } = await import('../app/(pro)/alunos/[alunoId]/prescricoes/page');
    render(<Prescricoes />);
    await waitFor(() => expect(screen.getByText('+ Nova prescrição')).toBeInTheDocument());

    /*
      O aviso vive DENTRO do formulário de emissão, que é onde ele importa: na
      lista, um alerta sobre modelos seria ruído; na hora de prescrever, é a
      diferença entre recarregar e redigitar a posologia à mão.
    */
    fireEvent.click(screen.getByText('+ Nova prescrição'));

    await waitFor(() =>
      expect(textoDaTela()).toMatch(/não foi possível carregar seus modelos de prescrição/i),
    );
    expect(textoDaTela()).toMatch(/em vez de redigitar a posologia/i);
  });
});

describe('catálogo de alimentos', () => {
  it('grupos ilegíveis avisam que o filtro ficou vazio', async () => {
    gruposDeAlimentos.mockRejectedValue(semRede());
    const { default: Alimentos } = await import('../app/(pro)/plano-alimentar/alimentos/page');
    render(<Alimentos />);

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível carregar os grupos/i));
    // E diz o que ainda funciona, que é o que permite continuar trabalhando.
    expect(textoDaTela()).toMatch(/a busca por nome continua funcionando/i);
  });

  it('com os grupos carregados, o filtro aparece sem aviso', async () => {
    const { default: Alimentos } = await import('../app/(pro)/plano-alimentar/alimentos/page');
    render(<Alimentos />);

    await waitFor(() => expect(textoDaTela()).toContain('Leguminosas'));
    expect(textoDaTela()).not.toMatch(/filtro indisponível/i);
  });
});
