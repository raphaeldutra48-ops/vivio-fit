import { ErroApi } from '@vivio/sdk';
import { obterTema } from '@vivio/ui-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Metas (só leitura) e lembretes (só escrita) — os dois extremos do app.
 *
 * **Metas** são combinação de acompanhamento: o profissional escreve, o aluno
 * lê. Se o próprio aluno pudesse criar e marcar como cumprida, viraria lista de
 * desejos. Como uma tela sem botão de "adicionar" parece quebrada, ela precisa
 * DIZER de onde vêm as metas — e distinguir três coisas que se parecem: não há
 * meta, há mas a evolução não foi compartilhada (403 é escolha do aluno, não
 * falha), e a busca falhou.
 *
 * **Lembretes** é o contrário: a tela só escreve, e o que ela grava decide se
 * uma notificação chega às 7h da manhã. Horário inválido precisa morrer aqui —
 * mandado ao servidor, volta como erro genérico depois de a pessoa já ter
 * fechado o app achando que estava configurado.
 */
const listarMetas = vi.fn();
const listarLembretes = vi.fn();
const definirLembrete = vi.fn();

vi.mock('../src/sdk', () => ({
  sdk: {
    metas: { listar: (...a: unknown[]) => listarMetas(...a) },
    lembretes: {
      listar: (...a: unknown[]) => listarLembretes(...a),
      definir: (...a: unknown[]) => definirLembrete(...a),
    },
  },
}));

const usuario = { id: 'aluna-1', nome: 'Ana Souza', email: 'ana@exemplo.com', papel: 'ALUNO' };
const sessao = { tema: obterTema('claro'), nomeDoTema: 'claro', usuario, carregando: false };
vi.mock('../src/sessao', () => ({ useSessao: () => sessao }));

const meta = (id: string, extras: Record<string, unknown> = {}) => ({
  id,
  titulo: 'Chegar a 75 kg',
  tipo: 'PESO_CORPORAL',
  exercicioNome: null,
  alvo: 75,
  valorInicial: 80,
  valorAtual: 78,
  progresso: 40,
  atingida: false,
  atrasada: false,
  prazo: '2026-12-20',
  observacao: null,
  ...extras,
});

const textoDaTela = () => document.body.textContent ?? '';

async function abrirMetas() {
  const { default: Metas } = await import('../app/metas');
  return render(<Metas />);
}

async function abrirLembretes() {
  const { default: Lembretes } = await import('../app/lembretes');
  return render(<Lembretes />);
}

beforeEach(() => {
  listarMetas.mockResolvedValue([meta('m1')]);
  listarLembretes.mockResolvedValue([]);
  definirLembrete.mockImplementation((dados: unknown) => Promise.resolve(dados));
});

describe('minhas metas', () => {
  it('conta a história: de onde saiu, onde está, quanto falta', async () => {
    // Só o percentual não diz nada — "começou em 80, agora 78" é o que a pessoa
    // reconhece como esforço.
    await abrirMetas();

    await waitFor(() => expect(screen.getByText('Chegar a 75 kg')).toBeInTheDocument());
    expect(textoDaTela()).toMatch(/começou em 80 kg · agora 78 kg/i);
    expect(textoDaTela()).toContain('40%');
  });

  it('meta sem medição não vira barra em zero', async () => {
    /*
      Zero é uma afirmação sobre o esforço da pessoa; ausência de medição é uma
      afirmação sobre o acompanhamento. Quem lê a primeira no lugar da segunda
      conclui que nada do que fez teve efeito.
    */
    listarMetas.mockResolvedValue([meta('m1', { progresso: null, valorAtual: null })]);
    await abrirMetas();

    await waitFor(() => expect(textoDaTela()).toMatch(/ainda sem medição para acompanhar/i));
    expect(textoDaTela()).not.toContain('0%');
  });

  it('prazo vencido é dito como vencido', async () => {
    // A mesma data com outra palavra na frente muda o que a pessoa faz hoje.
    listarMetas.mockResolvedValue([meta('m1', { atrasada: true, prazo: '2026-08-10' })]);
    await abrirMetas();

    await waitFor(() => expect(textoDaTela()).toMatch(/prazo vencido em 10 de agosto/i));
  });

  it('as conquistadas ficam, e ficam embaixo', async () => {
    /*
      Sumir com elas apagaria a única prova de que o acompanhamento deu certo
      alguma vez; no topo, empurrariam para baixo o que ainda precisa de esforço.
    */
    listarMetas.mockResolvedValue([
      meta('m1', { titulo: 'Supino 100 kg', atingida: true }),
      meta('m2', { titulo: 'Chegar a 75 kg' }),
    ]);
    await abrirMetas();

    await waitFor(() => expect(screen.getByText('Já conquistadas')).toBeInTheDocument());
    const tela = textoDaTela();
    expect(tela.indexOf('Chegar a 75 kg')).toBeLessThan(tela.indexOf('Já conquistadas'));
    expect(tela.indexOf('Já conquistadas')).toBeLessThan(tela.indexOf('Supino 100 kg'));
    expect(tela).toMatch(/meta atingida/i);
  });

  it('sem autorização de evolução, explica a causa — que é escolha dela', async () => {
    /*
      403 aqui não é falha: é o aluno não ter liberado a evolução. Dizer "erro ao
      carregar" faria ele procurar problema no app, quando a chave está no
      próprio perfil.
    */
    listarMetas.mockRejectedValue(new ErroApi('CONSENTIMENTO_AUSENTE', 'sem consentimento', 403));
    await abrirMetas();

    await waitFor(() => expect(screen.getByText('Evolução não compartilhada')).toBeInTheDocument());
    expect(textoDaTela()).toMatch(/autorize o compartilhamento de evolução/i);
    expect(textoDaTela()).not.toMatch(/não foi possível carregar/i);
  });

  it('falha de verdade NÃO vira "nenhuma meta ainda"', async () => {
    listarMetas.mockRejectedValue(new ErroApi('ERRO_DE_REDE', 'sem rede', 0));
    await abrirMetas();

    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar suas metas.')).toBeInTheDocument(),
    );
    expect(textoDaTela()).not.toMatch(/nenhuma meta ainda/i);
  });

  it('o vazio de verdade diz quem define as metas', async () => {
    // Sem isso, a pessoa procura um botão "+" que não existe — e conclui que a
    // tela está quebrada.
    listarMetas.mockResolvedValue([]);
    await abrirMetas();

    await waitFor(() => expect(screen.getByText('Nenhuma meta ainda')).toBeInTheDocument());
    expect(textoDaTela()).toMatch(/combinadas com o seu personal ou nutricionista/i);
  });
});

describe('lembrete de treino', () => {
  it('abre com o que já estava configurado', async () => {
    /*
      Abrir no padrão faria quem entrasse só para mudar o horário zerar os dias
      sem perceber — a gravação manda a configuração inteira, não um pedaço.
    */
    listarLembretes.mockResolvedValue([
      { id: 'l1', tipo: 'TREINO', horarios: ['19:30'], diasDaSemana: [1, 3, 5], ativo: true, canais: ['PUSH'] },
    ]);
    await abrirLembretes();

    await waitFor(() =>
      expect(screen.getByLabelText(/horário do lembrete/i)).toHaveValue('19:30'),
    );
    expect(textoDaTela()).toContain('Atualizar lembrete');
  });

  it('horário inválido morre aqui, e não no servidor', async () => {
    /*
      Mandado adiante, volta como erro genérico — e a pessoa fecha o app achando
      que configurou. Depois estranha que a notificação nunca chegou.
    */
    await abrirLembretes();
    fireEvent.change(screen.getByLabelText(/horário do lembrete/i), { target: { value: '25:00' } });

    fireEvent.click(screen.getByLabelText(/salvar lembrete/i));

    await waitFor(() => expect(textoDaTela()).toMatch(/use o formato HH:MM/i));
    expect(definirLembrete).not.toHaveBeenCalled();
  });

  it('grava horário, dias e canal — e confirma que gravou', async () => {
    await abrirLembretes();
    fireEvent.change(screen.getByLabelText(/horário do lembrete/i), { target: { value: '06:45' } });
    fireEvent.click(screen.getByLabelText(/dia 2 da semana/i));
    fireEvent.click(screen.getByLabelText(/dia 4 da semana/i));

    fireEvent.click(screen.getByLabelText(/salvar lembrete/i));

    await waitFor(() =>
      expect(definirLembrete).toHaveBeenCalledWith(
        expect.objectContaining({ horarios: ['06:45'], diasDaSemana: [2, 4], ativo: true }) as unknown,
      ),
    );
    // Sem a confirmação, a pessoa toca de novo — e não há como saber se gravou.
    await waitFor(() => expect(screen.getByText('Lembrete salvo.')).toBeInTheDocument());
  });

  it('tocar duas vezes no mesmo dia o remove', async () => {
    await abrirLembretes();
    fireEvent.click(screen.getByLabelText(/dia 3 da semana/i));
    fireEvent.click(screen.getByLabelText(/dia 3 da semana/i));

    fireEvent.click(screen.getByLabelText(/salvar lembrete/i));

    await waitFor(() =>
      expect(definirLembrete).toHaveBeenCalledWith(
        expect.objectContaining({ diasDaSemana: [] }) as unknown,
      ),
    );
  });

  it('nenhum dia marcado significa TODOS, e a tela diz isso', async () => {
    // Lista vazia enviada ao servidor quer dizer "todo dia"; sem o aviso, a
    // pessoa leria como "nenhum dia" e acharia que desligou o lembrete.
    await abrirLembretes();

    await waitFor(() => expect(textoDaTela()).toMatch(/dias \(todos\)/i));
  });

  it('mostra exatamente a notificação que vai chegar', async () => {
    // Prometer em abstrato ("você será notificado") não permite decidir se vale
    // ligar. O texto real, sim.
    await abrirLembretes();

    await waitFor(() => expect(textoDaTela()).toMatch(/você vai receber assim/i));
    expect(textoDaTela()).toMatch(/se você já tiver treinado no dia, o lembrete não chega/i);
  });

  it('se não gravar, a tela não diz que gravou', async () => {
    definirLembrete.mockRejectedValue(new Error('rede'));
    await abrirLembretes();

    fireEvent.click(screen.getByLabelText(/salvar lembrete/i));

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível salvar/i));
    expect(screen.queryByText('Lembrete salvo.')).not.toBeInTheDocument();
  });

  it('falha ao carregar é dita — em vez de mostrar o padrão como se fosse o seu', async () => {
    /*
      Sem aviso, a tela mostraria 07:00 e nenhum dia: a pessoa leria a
      configuração PADRÃO como se fosse a dela, e ao salvar apagaria a de
      verdade.
    */
    listarLembretes.mockRejectedValue(new Error('rede'));
    await abrirLembretes();

    await waitFor(() => expect(textoDaTela()).toMatch(/não foi possível carregar seus lembretes/i));
  });
});
