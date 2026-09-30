import { ErroApi } from '@vivio/sdk';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const resumoAluno = vi.fn();
const listarTreinos = vi.fn();
/*
  A ficha é um HUB: ela monta seis componentes, e cada um busca o seu. Um método
  que falte no dublê não some da tela — derruba o render inteiro, e a prova sobre
  os planos passaria a falhar por um motivo que não tem nada a ver com planos.
*/
const vazio = () => Promise.resolve([]);
vi.mock('../lib/sdk', () => ({
  sdk: {
    alunos: { resumo: (...a: unknown[]) => resumoAluno(...a) },
    treinos: { listar: (...a: unknown[]) => listarTreinos(...a) },
    condicoes: { listar: vazio, registrar: vi.fn(), resolver: vi.fn() },
    alertas: { doAluno: vazio, listar: vazio, reconhecer: vi.fn() },
    metas: {
      listar: vazio,
      criar: vi.fn(),
      concluir: vi.fn(),
      reabrir: vi.fn(),
      remover: vi.fn(),
    },
    cardio: {
      listar: vazio,
      calorias: () =>
        Promise.resolve({
          dias: 30,
          pesoUsadoKg: null,
          musculacao: { sessoes: 0, minutos: 0, kcal: null },
          cardio: { sessoes: 0, minutos: 0, kcal: null },
          totalKcal: null,
          gastoDiario: {
            tmb: null,
            formula: null,
            cotidiano: null,
            exercicioPorDia: null,
            totalPorDia: null,
            faltando: [],
            calorimetriaExpirada: null,
          },
        }),
    },
    execucoes: { listar: vazio, historicoDeCarga: vazio },
    medidas: {
      evolucao: () =>
        Promise.resolve({ de: '2026-09-01', ate: '2026-09-30', totalMedicoes: 0, series: [] }),
    },
    /*
      O painel de progresso lê `painel.treino.total` direto. A primeira versão
      deste dublê devolveu outra forma, e o componente estourou DEPOIS do teste
      terminar: as 429 provas passaram e o `vitest` saiu com erro, porque exceção
      não capturada conta como falha da suíte mesmo sem reprovar caso nenhum. Foi
      assim que o CI ficou vermelho com tudo verde na tela.
    */
    progresso: {
      painel: () =>
        Promise.resolve({
          dias: 30,
          treino: {
            total: 0,
            volumeKg: 0,
            minutos: 0,
            duracaoMediaMin: null,
            porSemana: 0,
            ultimoEm: null,
            diasSemTreinar: null,
          },
          checkins: null,
          cargas: [],
          variacaoPesoKg: null,
        }),
    },
    exercicios: { listar: vazio },
  },
}));
vi.mock('../lib/sessao', () => ({
  useSessao: () => ({ usuario: { id: 'p1', nome: 'Diego', papel: 'PERSONAL' }, carregando: false }),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ alunoId: 'aluna-1' }),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));
const textoDaTela = () => document.body.textContent ?? '';
beforeEach(() => {
  resumoAluno.mockResolvedValue({
    id: 'aluna-1',
    nome: 'Ana Souza',
    email: 'ana@exemplo.com',
    avatarUrl: null,
    idade: 30,
    alturaCm: 168,
    objetivo: null,
    equipe: [],
  });
  listarTreinos.mockResolvedValue([]);
});
describe('ficha do aluno', () => {
  it('falha ao listar planos NÃO vira "nenhum plano montado ainda"', async () => {
    listarTreinos.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'fetch failed', 0));
    const { default: Ficha } = await import('../app/(pro)/alunos/[alunoId]/page');
    render(<Ficha />);
    await waitFor(() => expect(screen.getByText('Ana Souza')).toBeInTheDocument());
    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível carregar os planos de treino/i));
    expect(textoDaTela()).not.toMatch(/nenhum plano montado ainda/i);
  });
  it('aluno sem plano de verdade continua dizendo que não tem', async () => {
    const { default: Ficha } = await import('../app/(pro)/alunos/[alunoId]/page');
    render(<Ficha />);
    await waitFor(() => expect(textoDaTela()).toMatch(/nenhum plano montado ainda/i));
  });
});
