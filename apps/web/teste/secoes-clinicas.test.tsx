import {
  GravidadeCondicao,
  Papel,
  RegiaoCorpo,
  SeveridadeAlerta,
  TipoCondicao,
  type AlertaResumo,
  type CondicaoResumo,
} from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertasClinicos } from '../components/AlertasClinicos';
import { CondicoesDeSaude } from '../components/CondicoesDeSaude';

/**
 * As duas seções clínicas da ficha do aluno, e o jeito como elas sumiam.
 *
 * Os dois componentes tinham o mesmo desenho: um `.catch` que mandava QUALQUER
 * erro para o estado de "não pode ver" e devolvia `null` — a seção não
 * aparecia. A intenção era boa (403 por falta de consentimento não é falha e
 * não deve acusar erro), mas a condição não existia: um tropeço de rede tinha
 * o mesmo efeito.
 *
 * O preço é alto justamente aqui. "Condições de saúde" existe para o personal
 * não prescrever desenvolvimento militar a quem tem lesão no ombro, e "Alertas
 * clínicos" existe para dizer que algo precisa de olhar. Sumir calado é o
 * oposto do que as duas servem para fazer — e a ausência se lê como "não há
 * nada".
 *
 * O segundo defeito é dos BOTÕES: "Marcar como visto" e "Dar alta" engoliam a
 * falha e não mudavam nada na tela. Quem clicou sai achando que resolveu.
 */
const listarAlertas = vi.fn();
const reconhecerAlerta = vi.fn();
const listarCondicoes = vi.fn();
const resolverCondicao = vi.fn();

vi.mock('../lib/sdk', () => ({
  sdk: {
    alertas: {
      listar: (...a: unknown[]) => listarAlertas(...a),
      reconhecer: (...a: unknown[]) => reconhecerAlerta(...a),
    },
    condicoes: {
      listar: (...a: unknown[]) => listarCondicoes(...a),
      registrar: vi.fn(),
      resolver: (...a: unknown[]) => resolverCondicao(...a),
    },
  },
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('../lib/sessao', () => ({
  useSessao: () => ({
    usuario: { id: 'medico-1', nome: 'Dra. Helena', email: 'h@exemplo.com', papel: Papel.MEDICO },
    carregando: false,
  }),
}));

const alerta = (extras: Partial<AlertaResumo> = {}): AlertaResumo =>
  ({
    id: 'a1',
    papelDestino: 'PERSONAL',
    severidade: SeveridadeAlerta.ALTA,
    titulo: 'Lesão no ombro direito',
    orientacao: 'Evitar desenvolvimento militar e supino inclinado.',
    marcadorOrigem: null,
    exameId: null,
    condicaoId: 'c1',
    criadoEm: '2026-09-20T10:00:00.000Z',
    reconhecidoEm: null,
    reconhecidoPor: null,
    ...extras,
  }) as AlertaResumo;

const condicao = (extras: Partial<CondicaoResumo> = {}): CondicaoResumo =>
  ({
    id: 'c1',
    tipo: TipoCondicao.LESAO,
    descricao: 'Tendinopatia do supraespinhal à direita',
    regiao: RegiaoCorpo.OMBRO,
    gravidade: GravidadeCondicao.MODERADA,
    inicioEm: null,
    observacao: null,
    registradoPor: { id: 'medico-1', nome: 'Dra. Helena' },
    criadoEm: '2026-09-20T10:00:00.000Z',
    resolvidaEm: null,
    resolvidaPor: null,
    ...extras,
  }) as CondicaoResumo;

const textoDaTela = () => document.body.textContent ?? '';
const semRede = () => new ErroApi('ERRO_DE_REDE', 'fetch failed', 0);
const semPermissao = () =>
  new ErroApi('ACESSO_NEGADO', 'Você não tem acesso a este conteúdo.', 403);

beforeEach(() => {
  listarAlertas.mockResolvedValue([]);
  listarCondicoes.mockResolvedValue([]);
  reconhecerAlerta.mockResolvedValue(alerta({ reconhecidoEm: '2026-10-01T12:00:00.000Z' }));
  resolverCondicao.mockResolvedValue(condicao({ resolvidaEm: '2026-10-01T12:00:00.000Z' }));
});

describe('alertas clínicos', () => {
  it('falha de rede NÃO faz a seção desaparecer como se não houvesse alerta', async () => {
    listarAlertas.mockRejectedValue(semRede());
    render(<AlertasClinicos alunoId="aluna-1" />);

    await waitFor(() => expect(textoDaTela()).toMatch(/não deu para buscar os alertas/i));
    // E diz o que o profissional precisa saber antes de seguir o atendimento.
    expect(textoDaTela()).toMatch(/antes de concluir que não há nada a olhar/i);
    expect(textoDaTela()).not.toMatch(/fetch failed/i);
  });

  it('403 continua escondendo a seção, sem acusar erro nenhum', async () => {
    // Falta de consentimento clínico não é defeito: é o aluno não ter liberado.
    // Um erro aqui faria o profissional procurar problema onde não há.
    listarAlertas.mockRejectedValue(semPermissao());
    render(<AlertasClinicos alunoId="aluna-1" />);

    await waitFor(() => expect(listarAlertas).toHaveBeenCalled());
    expect(textoDaTela()).toBe('');
  });

  it('sem alerta nenhum, a seção não aparece — e isso é verdade', async () => {
    render(<AlertasClinicos alunoId="aluna-1" />);

    await waitFor(() => expect(listarAlertas).toHaveBeenCalled());
    expect(textoDaTela()).toBe('');
  });

  it('"marcar como visto" que falha diz que o alerta continua pendente', async () => {
    /*
      O botão engolia a falha: o alerta seguia pendente e a tela não mudava
      nada. Quem clicou sai achando que marcou — e o alerta deixa de ser olhado
      por alguém que acredita já tê-lo tratado.
    */
    listarAlertas.mockResolvedValue([alerta()]);
    reconhecerAlerta.mockRejectedValue(semRede());
    const usuario = userEvent.setup();
    render(<AlertasClinicos alunoId="aluna-1" />);

    await usuario.click(await screen.findByRole('button', { name: 'Marcar como visto' }));

    await waitFor(() => expect(textoDaTela()).toMatch(/continua pendente/i));
    // E o botão segue lá, para tentar de novo.
    expect(screen.getByRole('button', { name: 'Marcar como visto' })).toBeInTheDocument();
  });
});

describe('condições de saúde', () => {
  it('falha de rede NÃO faz a seção desaparecer antes de alguém prescrever', async () => {
    listarCondicoes.mockRejectedValue(semRede());
    render(<CondicoesDeSaude alunoId="aluna-1" />);

    await waitFor(() => expect(textoDaTela()).toMatch(/não deu para buscar as condições/i));
    expect(textoDaTela()).toMatch(/recarregue a página antes de prescrever/i);
    expect(textoDaTela()).not.toMatch(/nenhuma condição registrada/i);
  });

  it('403 continua escondendo a seção', async () => {
    listarCondicoes.mockRejectedValue(semPermissao());
    render(<CondicoesDeSaude alunoId="aluna-1" />);

    await waitFor(() => expect(listarCondicoes).toHaveBeenCalled());
    expect(textoDaTela()).toBe('');
  });

  it('sem condição nenhuma, diz isso — para o médico, que pode registrar', async () => {
    render(<CondicoesDeSaude alunoId="aluna-1" />);

    expect(await screen.findByText('Nenhuma condição registrada.')).toBeInTheDocument();
  });

  it('"dar alta" que falha diz que a condição continua ativa', async () => {
    /*
      Dar alta é decisão clínica, e o botão falhava calado. O médico sai da
      ficha achando que resolveu, e a condição segue bloqueando exercício em
      todo o plano do aluno.
    */
    listarCondicoes.mockResolvedValue([condicao()]);
    resolverCondicao.mockRejectedValue(semRede());
    const usuario = userEvent.setup();
    render(<CondicoesDeSaude alunoId="aluna-1" />);

    await usuario.click(await screen.findByRole('button', { name: 'Dar alta' }));

    await waitFor(() => expect(textoDaTela()).toMatch(/continua ativa/i));
  });
});
