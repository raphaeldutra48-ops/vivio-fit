import { describe, expect, it } from 'vitest';
import { ordenarPlanosDeTreino, type PlanoTreinoResumo } from './treino';

/**
 * A ordem da lista de planos.
 *
 * Vive no contrato porque agora tem dois chamadores — a API e o SDK falando
 * direto com o Postgres — e a mesma tela mostra os dois. Duas cópias da regra
 * divergiriam caladas: a lista sairia numa ordem no navegador e noutra no
 * celular, sem nada quebrar.
 */
const plano = (p: Partial<PlanoTreinoResumo> & { id: string }): PlanoTreinoResumo => ({
  nome: 'Plano',
  objetivo: null,
  versao: 1,
  status: 'RASCUNHO',
  criadoEm: '2026-01-01T00:00:00.000Z',
  inicioEm: null,
  fimEm: null,
  totalSessoes: 3,
  personal: { id: 'p1', nome: 'Personal' },
  ...p,
});

describe('ordenarPlanosDeTreino', () => {
  it('o que está valendo vem primeiro, e o arquivado por último', () => {
    /*
      A regressão que isto impede: ordenar por `status` seguia a ordem em que o
      enum foi declarado — RASCUNHO, ATIVO, ARQUIVADO — e punha rascunho acima
      do plano que o aluno está treinando hoje. Numa lista que se lê de cima
      para baixo, o topo tem de ser o que está valendo.
    */
    const ordenados = ordenarPlanosDeTreino([
      plano({ id: 'arquivado', status: 'ARQUIVADO' }),
      plano({ id: 'rascunho', status: 'RASCUNHO' }),
      plano({ id: 'ativo', status: 'ATIVO' }),
    ]);
    expect(ordenados.map((p) => p.id)).toEqual(['ativo', 'rascunho', 'arquivado']);
  });

  it('dentro do mesmo estado, o mais recente primeiro', () => {
    const ordenados = ordenarPlanosDeTreino([
      plano({ id: 'antigo', criadoEm: '2026-01-01T00:00:00.000Z' }),
      plano({ id: 'novo', criadoEm: '2026-06-01T00:00:00.000Z' }),
      plano({ id: 'meio', criadoEm: '2026-03-01T00:00:00.000Z' }),
    ]);
    expect(ordenados.map((p) => p.id)).toEqual(['novo', 'meio', 'antigo']);
  });

  it('empate no instante é desfeito pela versão, e não pela sorte', () => {
    /*
      Não é hipótese: versionar um plano cria a versão nova no mesmo
      milissegundo em que arquiva a antiga. Empatados, o Postgres devolve em
      ordem arbitrária — e a mesma tela sai em ordens diferentes entre dois
      carregamentos, sem que nada tenha mudado.
    */
    const mesmoInstante = '2026-05-05T12:00:00.000Z';
    const ordenados = ordenarPlanosDeTreino([
      plano({ id: 'v1', versao: 1, criadoEm: mesmoInstante }),
      plano({ id: 'v3', versao: 3, criadoEm: mesmoInstante }),
      plano({ id: 'v2', versao: 2, criadoEm: mesmoInstante }),
    ]);
    expect(ordenados.map((p) => p.id)).toEqual(['v3', 'v2', 'v1']);
  });

  it('empate até na versão ainda tem ordem total: o id decide', () => {
    // Acontece entre planos de raízes diferentes criados juntos. Sem este
    // último critério a ordem voltaria a ser a que o banco quisesse.
    const iguais = { versao: 1, criadoEm: '2026-05-05T12:00:00.000Z' };
    const primeira = ordenarPlanosDeTreino([
      plano({ id: 'aaa', ...iguais }),
      plano({ id: 'zzz', ...iguais }),
    ]);
    const segunda = ordenarPlanosDeTreino([
      plano({ id: 'zzz', ...iguais }),
      plano({ id: 'aaa', ...iguais }),
    ]);
    expect(primeira.map((p) => p.id)).toEqual(segunda.map((p) => p.id));
  });

  it('o estado pesa mais que a data: um ativo antigo continua no topo', () => {
    const ordenados = ordenarPlanosDeTreino([
      plano({ id: 'rascunho-de-ontem', status: 'RASCUNHO', criadoEm: '2026-09-01T00:00:00.000Z' }),
      plano({ id: 'ativo-de-janeiro', status: 'ATIVO', criadoEm: '2026-01-01T00:00:00.000Z' }),
    ]);
    expect(ordenados[0]!.id).toBe('ativo-de-janeiro');
  });

  it('não mexe na lista que recebeu', () => {
    // Quem chama costuma ser um `map` recém-criado, mas nem sempre: no SDK a
    // lista vem do cache do React Query, e ordenar no lugar reordenaria o que
    // outra tela está mostrando.
    const original = [plano({ id: 'b', status: 'ARQUIVADO' }), plano({ id: 'a', status: 'ATIVO' })];
    ordenarPlanosDeTreino(original);
    expect(original.map((p) => p.id)).toEqual(['b', 'a']);
  });
});
