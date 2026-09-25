import { describe, expect, it } from 'vitest';
import {
  avaliarCabecalhos,
  avaliarContas,
  avaliarFuncaoDeBorda,
  avaliarMidia,
  avaliarRotina,
  resumir,
} from './regras';

/**
 * As regras do diagnóstico.
 *
 * Um diagnóstico que aprova tudo é pior do que nenhum: ele dá a sensação de
 * conferência sem conferir nada, e uma comparação invertida basta para isso. Por
 * isso cada regra é testada pelos DOIS lados — o estado bom e o estado ruim que
 * ela existe para pegar. Todos os casos ruins aqui aconteceram de verdade neste
 * projeto, nas últimas duas semanas.
 */
const agora = new Date('2026-09-25T18:00:00Z');

describe('cabeçalhos de segurança', () => {
  it('aprova quando os seis chegam', () => {
    const r = avaliarCabecalhos({
      'Strict-Transport-Security': 'max-age=31536000',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(self)',
      'Content-Security-Policy': "frame-ancestors 'none'",
    });
    expect(r.ok).toBe(true);
  });

  it('reprova e diz qual falta', () => {
    // O estado real do site até 22/09: nenhum cabeçalho.
    const r = avaliarCabecalhos({ 'content-type': 'text/html' });
    expect(r.ok).toBe(false);
    expect(r.detalhe).toContain('x-frame-options');
  });
});

describe('função de borda', () => {
  it('401 é publicada e exigindo sessão', () => {
    expect(avaliarFuncaoDeBorda('ler-dieta', 401).ok).toBe(true);
  });

  it('404 reprova, e a frase diz o que fazer', () => {
    // Foi o estado real por duas semanas, com a tela dizendo apenas que a
    // leitura automática "não estava configurada".
    const r = avaliarFuncaoDeBorda('ler-dieta', 404);
    expect(r.ok).toBe(false);
    expect(r.detalhe).toMatch(/não publicada/i);
  });

  it('200 sem sessão também reprova — seria porta aberta', () => {
    expect(avaliarFuncaoDeBorda('ler-dieta', 200).ok).toBe(false);
  });
});

describe('rotina do banco', () => {
  it('execução recente com sucesso aprova', () => {
    const r = avaliarRotina('lembretes', { status: 'succeeded', quando: new Date('2026-09-25T17:59:00Z') }, agora);
    expect(r.ok).toBe(true);
  });

  it('parada há horas reprova, mesmo que a última tenha dado certo', () => {
    /*
      É o caso que o "existe e está ativa" não pega: o agendador pode estar
      registrado e não rodar. Foi assim que o disparo de lembretes ficou dias
      sem existir — com a tela salvando horário normalmente.
    */
    const r = avaliarRotina('lembretes', { status: 'succeeded', quando: new Date('2026-09-25T14:00:00Z') }, agora);
    expect(r.ok).toBe(false);
    expect(r.detalhe).toMatch(/parada/i);
  });

  it('última execução com falha reprova', () => {
    const r = avaliarRotina('lembretes', { status: 'failed', quando: new Date('2026-09-25T17:59:30Z') }, agora);
    expect(r.ok).toBe(false);
  });

  it('nunca executou reprova', () => {
    expect(avaliarRotina('lembretes', null, agora).ok).toBe(false);
  });
});

describe('mídia', () => {
  it('chave sem arquivo reprova; arquivo sem dono só avisa', () => {
    const [comArquivo, semDono] = avaliarMidia(
      ['catalogo/exercicios/a.png', 'evolucao/aluno/b.png'],
      ['catalogo/exercicios/a.png', 'exames/prof/sobra.pdf'],
    );

    // A foto que a tela promete e não abre.
    expect(comArquivo!.ok).toBe(false);
    expect(comArquivo!.detalhe).toContain('evolucao/aluno/b.png');

    // A sobra de upload interrompido: ocupa espaço, não quebra nada, e apagar
    // por conta própria é o risco que não vale (pendência 23).
    expect(semDono!.ok).toBe(false);
    expect(semDono!.informativo).toBe(true);
  });

  it('catálogo não conta como arquivo sem dono', () => {
    // Ele é acervo: existe sem nenhuma linha apontando para ele.
    const [, semDono] = avaliarMidia([], ['catalogo/exercicios/a.png']);
    expect(semDono!.ok).toBe(true);
  });
});

describe('contas', () => {
  it('sobra de teste reprova', () => {
    const [sobras] = avaliarContas(['personal@viviofit.com.br', 'prova-medida-123@teste.com']);
    expect(sobras!.ok).toBe(false);
  });

  it('semente e alunos de exemplo não são sobra', () => {
    const [sobras] = avaliarContas(['ana@exemplo.com', 'nutri@viviofit.com.br']);
    expect(sobras!.ok).toBe(true);
  });

  it('gente de verdade no banco é aviso, não falha — e muda o que a suíte pode fazer', () => {
    const [, reais] = avaliarContas(['ana@exemplo.com', 'cliente@gmail.com']);
    expect(reais!.ok).toBe(true);
    expect(reais!.informativo).toBe(true);
    expect(reais!.detalhe).toMatch(/NÃO pode mais rodar/);
  });
});

describe('o resumo', () => {
  it('informativo não derruba o comando; falha derruba', () => {
    const semFalha = resumir([
      { nome: 'a', ok: true, detalhe: '' },
      { nome: 'b', ok: false, detalhe: '', informativo: true },
    ]);
    expect(semFalha.codigoDeSaida).toBe(0);
    expect(semFalha.avisos).toHaveLength(1);

    const comFalha = resumir([{ nome: 'c', ok: false, detalhe: '' }]);
    expect(comFalha.codigoDeSaida).toBe(1);
    expect(comFalha.reprovadas).toHaveLength(1);
  });
});
